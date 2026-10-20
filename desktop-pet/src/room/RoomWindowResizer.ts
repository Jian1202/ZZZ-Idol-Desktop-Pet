import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { isNativeRuntime } from "../settings/appSettings";
import { resizeRoomWindow, type RoomResizeDirection, type RoomWindowRect } from "./roomGeometry";

interface ResizeGesture {
  handle: HTMLElement; pointerId: number; screenX: number; screenY: number;
  direction: RoomResizeDirection; origin: RoomWindowRect | null; dpi: number;
  dx: number; dy: number; released: boolean; pending: boolean;
}
/** Pointer capture keeps borderless resizing working on macOS, where Tao's
 * drag_resize_window is unsupported. Screen deltas survive the window moving. */
export class RoomWindowResizer {
  private gesture: ResizeGesture | null = null;
  private flushing = false;
  private disposed = false;
  constructor(private root: HTMLElement, private onStatus: (error: unknown) => void) {
    root.addEventListener("pointerdown", this.down);
    root.addEventListener("pointermove", this.move);
    root.addEventListener("pointerup", this.up);
    root.addEventListener("pointercancel", this.up);
    root.addEventListener("lostpointercapture", this.up);
  }
  dispose(): void {
    this.disposed = true; this.gesture = null;
    this.root.removeEventListener("pointerdown", this.down);
    this.root.removeEventListener("pointermove", this.move);
    this.root.removeEventListener("pointerup", this.up);
    this.root.removeEventListener("pointercancel", this.up);
    this.root.removeEventListener("lostpointercapture", this.up);
  }
  private down = (e: PointerEvent) => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>("[data-room-resize]");
    if (!handle || e.button !== 0 || !isNativeRuntime() || this.gesture) return;
    e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
    const gesture: ResizeGesture = { handle, pointerId: e.pointerId, screenX: e.screenX, screenY: e.screenY,
      direction: handle.dataset.roomResize as RoomResizeDirection, origin: null, dpi: 1,
      dx: 0, dy: 0, released: false, pending: false };
    this.gesture = gesture;
    this.onStatus("正在调整活动室大小");
    const window = getCurrentWindow();
    void Promise.all([window.innerSize(), window.outerPosition(), window.scaleFactor()]).then(([size, position, dpi]) => {
      if (this.disposed || this.gesture !== gesture) return;
      gesture.origin = { x: position.x / dpi, y: position.y / dpi, width: size.width / dpi, height: size.height / dpi };
      gesture.dpi = dpi;
      void this.flush();
    }).catch(error => { this.gesture = null; this.onStatus(error); });
  };
  private move = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || g.pointerId !== e.pointerId || g.released) return;
    e.preventDefault(); g.dx = e.screenX - g.screenX; g.dy = e.screenY - g.screenY; g.pending = true;
    void this.flush();
  };
  private up = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || g.pointerId !== e.pointerId || g.released) return;
    g.released = true;
    if (g.handle.hasPointerCapture(e.pointerId)) g.handle.releasePointerCapture(e.pointerId);
    void this.flush();
  };
  private async flush(): Promise<void> {
    if (this.flushing || this.disposed) return;
    const g = this.gesture;
    if (!g?.origin) return;
    this.flushing = true;
    try {
      while (g.pending && !this.disposed && this.gesture === g) {
        g.pending = false;
        const next = resizeRoomWindow(g.origin, g.direction, g.dx, g.dy);
        const window = getCurrentWindow();
        await window.setSize(new LogicalSize(next.width, next.height));
        if (g.direction.includes("West") || g.direction.includes("North")) {
          await window.setPosition(new PhysicalPosition(Math.round(next.x * g.dpi), Math.round(next.y * g.dpi)));
        }
      }
    } catch (error) { this.gesture = null; this.onStatus(error); }
    finally {
      this.flushing = false;
      if (g.released && !g.pending && this.gesture === g) {
        const final = resizeRoomWindow(g.origin, g.direction, g.dx, g.dy);
        this.onStatus(`活动室缩放：${Math.round(final.width / 1024 * 100)}%`);
        this.gesture = null;
      }
    }
  }
}
