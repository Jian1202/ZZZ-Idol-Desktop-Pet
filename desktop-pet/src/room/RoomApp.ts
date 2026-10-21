import { getCurrentWindow } from "@tauri-apps/api/window";
import { CHARACTER_BY_ID } from "../characters";
import type { CharacterId } from "../characters/types";
import { APP_SETTINGS_STATE, listenAppEvent } from "../characters/events";
import { getAppSettings, isNativeRuntime, type AppSettings } from "../settings/appSettings";
import { ROOM_POSE_LAYOUT } from "../renderer/RoomPoseController";
import { SpineRenderer } from "../renderer/SpineRenderer";
import { shouldMirrorForFacingDirection } from "../pet/characterFacing";
import { RoomWindowResizer } from "./RoomWindowResizer";
import { RoomInteractionController } from "./RoomInteractionController";
import { closeRoom, getRoom, leaveRoom, subscribeRoom, type RoomSnapshot, type RoomMember } from "./client";
import { availableFurniture, clampFloor, FURNITURE, FURNITURE_FACING, furnitureAt, ROOM_FRAME_INSETS, roomFrameBounds, roomPeriod,
  stepToward, type FurnitureId, type RoomPoint, type RoomTheme } from "./roomGeometry";
import "./room.css";

interface Resident extends RoomPoint {
  id: CharacterId;
  element: HTMLElement;
  renderer: SpineRenderer;
  interaction: RoomInteractionController;
  loaded: boolean;
  furniture: FurnitureId | null;
  pendingSeat: FurnitureId | null;
  target: RoomPoint | null;
  nextActionAt: number;
  walking: boolean;
}
interface Drag { id: CharacterId; pointerId: number; offsetX: number; offsetY: number; moved: boolean; startX: number; startY: number }
export class RoomApp {
  private readonly scene: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly status: HTMLElement;
  private readonly residents = new Map<CharacterId, Resident>();
  private readonly unlisten: Array<() => void> = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly windowResizer: RoomWindowResizer;
  private settings: AppSettings | null = null;
  private theme: RoomTheme = "auto";
  private period = roomPeriod("auto");
  private drag: Drag | null = null;
  private frame = 0;
  private lastFrame = 0;
  private revision = -1;
  private disposed = false;
  private busy = false;
  private roaming = true;
  private clockTimer = 0;
  private readonly preventContextMenu = (event: Event): void => event.preventDefault();

  constructor(private readonly root: HTMLElement) {
    try {
      this.roaming = localStorage.getItem("activity-room-roaming") !== "false";
      const saved = localStorage.getItem("activity-room-theme");
      if (saved === "auto" || saved === "day" || saved === "night") this.theme = saved;
    } catch { /* Private storage may be unavailable. */ }
    document.title = "妄想天使活动室";
    this.root.addEventListener("contextmenu", this.preventContextMenu);
    this.root.innerHTML = `
      <main class="room-shell" aria-label="妄想天使活动室">
        <div class="room-frame-panel" aria-hidden="true"></div>
        <img class="room-frame-image" src="./room/frame.png" alt="" draggable="false">
        <header class="room-header" data-room-drag>
          <strong class="room-title">妄想天使活动室</strong>
          <div class="room-tools">
            <button type="button" data-room-theme aria-label="昼夜背景">◐</button>
            <button type="button" data-room-roaming aria-label="室内漫步" aria-pressed="true">Ⅱ</button>
            <button type="button" data-room-close aria-label="关闭活动室并送回桌宠">×</button>
          </div>
        </header>
        <div class="room-viewport"><div class="room-scene">
          <img class="room-background" alt="妄想天使活动室背景" draggable="false">
        </div></div>
        <output class="sr-only" data-room-status role="status" aria-live="polite">拖动角色到家具上休息，拖出房间回到桌面</output>
        ${["North", "South", "East", "West", "NorthEast", "NorthWest", "SouthEast", "SouthWest"].map(direction =>
          `<div class="room-resize room-resize--${direction.toLowerCase()}" data-room-resize="${direction}" aria-hidden="true"></div>`).join("")}
      </main>`;
    this.scene = this.el(".room-scene"); this.viewport = this.root; this.status = this.el("[data-room-status]");
    const shell = this.el(".room-shell");
    for (const [side, value] of Object.entries(ROOM_FRAME_INSETS)) shell.style.setProperty(`--frame-${side}`, `${value * 100}%`);
    this.el("[data-room-theme]").addEventListener("click", () => {
      this.theme = this.theme === "auto" ? "day" : this.theme === "day" ? "night" : "auto";
      try { localStorage.setItem("activity-room-theme", this.theme); } catch { /* optional */ }
      this.updatePeriod();
    });
    this.windowResizer = new RoomWindowResizer(this.root, error => this.message(error));
    this.el("[data-room-drag]").addEventListener("pointerdown", e => {
      if (e.button === 0 && !(e.target as HTMLElement).closest("button") && isNativeRuntime()) void getCurrentWindow().startDragging().catch(e => this.message(e));
    });
    this.el("[data-room-close]").addEventListener("click", () => void this.run(async () => {
      if (isNativeRuntime()) this.reconcile(await closeRoom());
      else this.reconcile({ revision: ++this.revision, visible: false, members: [] });
    }));
    this.el("[data-room-roaming]").addEventListener("click", () => {
      this.roaming = !this.roaming;
      try { localStorage.setItem("activity-room-roaming", String(this.roaming)); } catch { /* optional */ }
      if (!this.roaming) for (const r of this.residents.values()) {
        if (!r.pendingSeat) { r.target = null; this.setWalking(r, false); }
      }
      this.renderControls();
    });
    this.scene.addEventListener("pointerdown", this.pointerDown);
    this.scene.addEventListener("pointermove", this.pointerMove);
    this.scene.addEventListener("pointerup", this.pointerUp);
    this.scene.addEventListener("pointercancel", this.pointerCancel);
    this.scene.addEventListener("lostpointercapture", this.pointerCancel);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.updatePeriod(); this.resize(); this.renderControls();
  }

  async mount(): Promise<void> {
    this.settings = await getAppSettings();
    this.unlisten.push(await listenAppEvent(APP_SETTINGS_STATE, s => {
      this.settings = s;
      for (const r of this.residents.values()) {
        r.element.hidden = !s.pets[r.id].visible;
        r.renderer.setSuspended(r.element.hidden);
        r.renderer.setPerformance(s.performanceMode, s.frameRate);
        r.interaction.setPreferences(s);
        r.interaction.setAvailable(!r.furniture && !r.element.hidden);
      }
      this.renderControls();
    }));
    if (isNativeRuntime()) {
      this.unlisten.push(await subscribeRoom(s => this.reconcile(s)));
      this.reconcile(await getRoom());
    }
    this.clockTimer = window.setInterval(() => this.updatePeriod(), 30_000);
    this.frame = requestAnimationFrame(this.tick);
  }
  dispose(): void {
    this.disposed = true;
    this.root.removeEventListener("contextmenu", this.preventContextMenu);
    cancelAnimationFrame(this.frame); window.clearInterval(this.clockTimer);
    this.unlisten.splice(0).forEach(f => f()); this.resizeObserver.disconnect();
    this.windowResizer.dispose();
    this.scene.removeEventListener("pointerdown", this.pointerDown); this.scene.removeEventListener("pointermove", this.pointerMove);
    this.scene.removeEventListener("pointerup", this.pointerUp); this.scene.removeEventListener("pointercancel", this.pointerCancel);
    this.scene.removeEventListener("lostpointercapture", this.pointerCancel);
    for (const r of this.residents.values()) { r.interaction.dispose(); r.renderer.dispose(); }
    this.residents.clear();
  }
  private reconcile(s: RoomSnapshot): void {
    if (this.disposed || s.revision < this.revision) return;
    this.revision = s.revision;
    for (const [id, r] of this.residents) if (!s.members.some(m => m.id === id)) {
      r.interaction.dispose(); r.renderer.dispose(); r.element.remove(); this.residents.delete(id);
      if (this.drag?.id === id) this.drag = null;
    }
    for (const m of s.members) if (!this.residents.has(m.id)) void this.add(m);
    this.renderControls();
  }
  private async add(m: RoomMember): Promise<void> {
    const element = document.createElement("div"); element.className = "room-character"; element.dataset.character = m.id;
    element.setAttribute("aria-label", CHARACTER_BY_ID[m.id].displayName); this.scene.append(element);
    let renderer: SpineRenderer;
    let interaction: RoomInteractionController | null = null;
    try {
      renderer = new SpineRenderer(element, {
        onActionComplete: (action, loopCount, playbackId) => interaction?.handleActionComplete(action, loopCount, playbackId),
      });
      renderer.setRoomPose("stand");
    }
    catch (error) {
      element.remove(); this.message(`无法创建角色画布：${String(error)}`);
      if (isNativeRuntime()) this.reconcile(await leaveRoom(m.id));
      return;
    }
    const def = CHARACTER_BY_ID[m.id];
    interaction = new RoomInteractionController(element, {
      play: (action, loop, overlay) => {
        element.dataset.action = action;
        return renderer.playAction(action, loop, overlay);
      },
      setOverlay: overlay => { renderer.setOverlay(overlay); },
      onReaction: kind => {
        r.target = null; r.pendingSeat = null; r.walking = false;
        r.nextActionAt = performance.now() + 8000;
        const label = kind === "doubleClick" ? "双击" : kind === "rapidClick" ? "连续点击" : "点击";
        element.setAttribute("aria-label", `${def.displayName}，正在回应${label}`);
        this.message(`${def.displayName}回应了你的${label}`);
      },
      onRest: () => {
        r.nextActionAt = performance.now() + 4000;
        element.setAttribute("aria-label", def.displayName);
      },
    });
    const r: Resident = { ...clampFloor(m), id: m.id, element, renderer, interaction, loaded: false, furniture: null,
      pendingSeat: null, target: null, walking: false, nextActionAt: performance.now() + 3000 + Math.random() * 5000 };
    this.residents.set(m.id, r); this.position(r);
    try {
      const metadata = await renderer.loadCharacter(def);
      if (this.disposed || this.residents.get(m.id) !== r) return;
      r.loaded = true;
      interaction.configure(def, metadata);
      interaction.setPreferences({ clickEnabled: this.settings?.clickEnabled ?? true,
        doubleClickEnabled: this.settings?.doubleClickEnabled ?? true });
      const initialSeat = furnitureAt(m, this.period);
      if (initialSeat && availableFurniture(this.residents.values(), initialSeat, r.id)) this.sit(r, initialSeat);
      renderer.setPerformance(this.settings?.performanceMode ?? "balanced", this.settings?.frameRate ?? "auto");
      element.hidden = this.settings?.pets[m.id].visible === false;
      renderer.setSuspended(element.hidden);
      interaction.setAvailable(!r.furniture && !element.hidden);
      this.message(`${CHARACTER_BY_ID[m.id].displayName}入住了活动室`); this.renderControls();
    } catch (e) {
      if (this.residents.get(m.id) !== r || this.disposed) return;
      this.message(`角色加载失败：${String(e)}。正在送回桌面`);
      // Never leave a failed WebGL resident owning a hidden desktop character.
      try { await this.release(m.id); } catch (error) { this.message(error); }
    }
  }
  private resize(): void {
    const rect = this.viewport.getBoundingClientRect(), frame = roomFrameBounds(rect.width, rect.height);
    const shell = this.el(".room-shell");
    shell.style.width = `${frame.width}px`; shell.style.height = `${frame.height}px`;
    shell.style.left = `${frame.left}px`; shell.style.top = `${frame.top}px`;
    for (const r of this.residents.values()) this.position(r);
  }
  private updatePeriod(): void {
    this.period = roomPeriod(this.theme);
    this.el<HTMLImageElement>(".room-background").src = `./room/${this.period}.jpg`;
    this.root.dataset.period = this.period;
    const button = this.el("[data-room-theme]");
    const label = this.theme === "auto" ? "随时间" : this.theme === "day" ? "日间" : "夜间";
    button.textContent = this.theme === "auto" ? "◐" : this.theme === "day" ? "☀" : "☾";
    button.setAttribute("aria-label", `昼夜背景：${label}，点击切换`); button.title = `昼夜背景：${label}`;
    for (const r of this.residents.values()) if (r.furniture) {
      Object.assign(r, FURNITURE[this.period][r.furniture]); this.position(r);
    }
  }
  private position(r: Resident): void {
    r.element.style.left = `${r.x * 100}%`;
    const layout = ROOM_POSE_LAYOUT[r.furniture === "sofa" ? "sit" : r.furniture === "cushion" ? "recline" : "stand"];
    r.element.style.width = `${layout.width * 100}%`;
    r.element.style.height = `${layout.height * 100}%`;
    r.element.style.top = `${(r.y + layout.height * (1 - layout.anchorY)) * 100}%`;
    r.element.style.zIndex = String(10 + Math.round(r.y * 100));
    r.element.dataset.pose = r.furniture ?? "floor";
  }
  private setWalking(r: Resident, walking: boolean): void {
    if (!r.loaded || r.walking === walking) return;
    r.walking = walking;
    const def = CHARACTER_BY_ID[r.id];
    r.renderer.playAction(walking ? "动作_走路" : "动作_待机", true,
      walking ? def.behavior.actionOverlays["动作_走路"] ?? def.preferredOverlay : def.preferredOverlay);
  }
  private walkTo(r: Resident, point: RoomPoint, seat: FurnitureId | null = null): void {
    if (!r.loaded) return;
    r.furniture = null; r.pendingSeat = seat; r.renderer.setRoomPose("stand");
    r.interaction.setAvailable(!r.element.hidden);
    Object.assign(r, clampFloor(r)); r.target = clampFloor(point);
    r.renderer.setHorizontalMirror(shouldMirrorForFacingDirection(r.renderer.getDiagnostics().currentSkin, r.target.x > r.x ? "right" : "left"));
    this.setWalking(r, true); this.position(r); this.renderControls();
  }
  private requestSeat(r: Resident, furniture: FurnitureId): void {
    if (!r.loaded) return;
    if (!availableFurniture(this.residents.values(), furniture, r.id)
      || Array.from(this.residents.values()).some(other => other.id !== r.id && other.pendingSeat === furniture)) {
      this.message(`${furniture === "sofa" ? "沙发" : "坐垫"}已有角色使用，请稍等`); return;
    }
    this.walkTo(r, FURNITURE[this.period][furniture], furniture);
    this.message(`${CHARACTER_BY_ID[r.id].displayName}正在走向${furniture === "sofa" ? "沙发" : "坐垫"}`);
  }
  private sit(r: Resident, furniture: FurnitureId): void {
    if (!availableFurniture(this.residents.values(), furniture, r.id)) {
      r.pendingSeat = null; r.nextActionAt = performance.now() + 5000; return;
    }
    r.furniture = furniture; r.pendingSeat = null; r.target = null; this.setWalking(r, false);
    r.interaction.setAvailable(false);
    r.renderer.setRoomPose(furniture === "sofa" ? "sit" : "recline");
    r.renderer.setHorizontalMirror(shouldMirrorForFacingDirection(r.renderer.getDiagnostics().currentSkin, FURNITURE_FACING[furniture]));
    Object.assign(r, FURNITURE[this.period][furniture]); r.nextActionAt = performance.now() + 20_000 + Math.random() * 20_000;
    this.message(`${CHARACTER_BY_ID[r.id].displayName}正在${furniture === "sofa" ? "沙发上坐着休息" : "坐垫上躺坐休息"}`);
    this.position(r); this.renderControls();
  }
  private readonly tick = (now: number) => {
    if (this.disposed) return;
    const delta = Math.min(.08, Math.max(0, (now - (this.lastFrame || now)) / 1000)); this.lastFrame = now;
    for (const r of this.residents.values()) {
      if (!r.loaded || r.element.hidden || this.drag?.id === r.id || r.interaction.isReacting() || document.hidden) continue;
      if (r.target) {
        Object.assign(r, stepToward(r, r.target, delta * .10 * (this.settings?.movementSpeed ?? 1)));
        if (Math.hypot(r.x - r.target.x, r.y - r.target.y) < .002) {
          r.target = null; this.setWalking(r, false);
          if (r.pendingSeat) this.sit(r, r.pendingSeat);
          else r.nextActionAt = now + (4_000 + Math.random() * 7_000) / (this.settings?.walkFrequency ?? 1);
        }
        this.position(r);
      } else if (this.roaming && now >= r.nextActionAt) {
        const furniture = Math.random() < .5 ? "sofa" : "cushion";
        if (!r.furniture && Math.random() < .3 && availableFurniture(this.residents.values(), furniture, r.id)) this.requestSeat(r, furniture);
        else this.walkTo(r, { x: .25 + Math.random() * .58, y: .82 + Math.random() * .11 });
      }
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  private readonly pointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.busy) return;
    const rect = this.scene.getBoundingClientRect();
    const candidates = [...this.residents.values()].filter(r => r.loaded && !r.element.hidden).sort((a,b) => b.y - a.y);
    const r = candidates.find(r => (r.renderer.sampleAlphaAt(e.clientX, e.clientY) ?? 0) > .08);
    if (!r) return;
    e.preventDefault();
    const offsetX = (e.clientX - rect.left) / rect.width - r.x, offsetY = (e.clientY - rect.top) / rect.height - r.y;
    this.drag = { id: r.id, pointerId: e.pointerId, offsetX, offsetY, moved: false, startX: e.clientX, startY: e.clientY };
    this.scene.setPointerCapture(e.pointerId); r.target = null; r.pendingSeat = null;
    this.setWalking(r, false); this.renderControls();
  };
  private readonly pointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    if (!this.drag.moved && Math.hypot(e.clientX-this.drag.startX, e.clientY-this.drag.startY) < 4) return;
    const r = this.residents.get(this.drag.id); if (!r) return;
    if (!this.drag.moved) r.interaction.cancelGesture();
    this.drag.moved = true;
    r.furniture = null; r.renderer.setRoomPose("stand");
    r.interaction.setAvailable(!r.element.hidden);
    const rect = this.scene.getBoundingClientRect();
    r.x = (e.clientX - rect.left) / rect.width - this.drag.offsetX;
    r.y = (e.clientY - rect.top) / rect.height - this.drag.offsetY;
    this.position(r);
  };
  private readonly pointerUp = (e: PointerEvent) => {
    const drag = this.drag; if (!drag || e.pointerId !== drag.pointerId) return;
    this.drag = null; if (this.scene.hasPointerCapture(e.pointerId)) this.scene.releasePointerCapture(e.pointerId);
    const r = this.residents.get(drag.id); if (!r) return;
    if (!drag.moved) { r.nextActionAt = performance.now() + 8000; r.interaction.click(); return; }
    const rect = this.scene.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      Object.assign(r, clampFloor(r)); this.position(r); void this.release(r.id, true); return;
    }
    const furniture = furnitureAt({ x: (e.clientX-rect.left)/rect.width, y: (e.clientY-rect.top)/rect.height }, this.period);
    if (furniture && availableFurniture(this.residents.values(), furniture, r.id)) this.sit(r, furniture);
    else { Object.assign(r, clampFloor(r)); r.nextActionAt = performance.now() + 8000; this.position(r); }
    this.renderControls();
  };
  private readonly pointerCancel = () => {
    if (!this.drag) return;
    const drag = this.drag, r = this.residents.get(drag.id); this.drag = null;
    if (r) {
      r.interaction.cancelGesture();
      if (drag.moved) {
        Object.assign(r, clampFloor(r)); r.furniture = null; r.renderer.setRoomPose("stand");
        r.interaction.setAvailable(!r.element.hidden); this.position(r);
      }
    }
  };
  private async release(id: CharacterId, atCursor = false): Promise<void> {
    await this.run(async () => {
      if (isNativeRuntime()) this.reconcile(await leaveRoom(id, atCursor));
      else this.reconcile({ revision: ++this.revision, visible: true, members: [...this.residents.values()].filter(r => r.id !== id) });
      this.message(`${CHARACTER_BY_ID[id].displayName}已回到桌面`);
    });
  }
  private renderControls(): void {
    const button = this.el("[data-room-roaming]");
    button.textContent = this.roaming ? "Ⅱ" : "▷";
    button.setAttribute("aria-pressed", String(this.roaming));
    button.setAttribute("aria-label", `室内漫步：${this.roaming ? "开" : "关"}，点击${this.roaming ? "暂停" : "继续"}`);
    button.title = this.roaming ? "暂停室内漫步" : "继续室内漫步";
  }

  private message(value: unknown): void { this.status.textContent = String(value); }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await action(); } catch (error) { this.message(error); }
    finally { this.busy = false; }
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
}
