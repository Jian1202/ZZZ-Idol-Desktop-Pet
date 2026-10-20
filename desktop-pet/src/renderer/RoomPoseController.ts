import { drawableBounds } from "./liftPoseGeometry.ts";
import { Physics, Vector2, type Bone, type Skeleton } from "@esotericsoftware/spine-core";
export type RoomPose = "stand" | "sit" | "recline";
export const ROOM_POSE_LAYOUT = {
  stand: { height: .30, width: .16, anchorY: .92 },
  sit: { height: .46, width: .26, anchorY: .72 },
  recline: { height: .30, width: .16, anchorY: .56 },
} as const;
/** Canvas sizes reserve pose-specific movement space, never change body size. */
export function roomCharacterScale(
  source: { width: number; height: number }, width: number, height: number,
  pose: RoomPose, padding: number, characterScale = 1,
): number {
  const layout = ROOM_POSE_LAYOUT[pose], reference = ROOM_POSE_LAYOUT.stand;
  return Math.min(width / layout.width * reference.width * padding / source.width,
    height / layout.height * reference.height * padding / source.height) * characterScale;
}
export function roomFeetBounds(skeleton: Skeleton) {
  return drawableBounds(skeleton, ["脚l", "脚r", "脚L", "脚R"]);
}
interface SavedBone { bone: Bone; x: number; y: number; rotation: number }
/** Additive poses run after the authored animation and before Spine IK/geometry.
 * Restore local values afterwards so unkeyed controller bones never accumulate offsets. */
export class RoomPoseController {
  pose: RoomPose = "stand";
  private sit = 0;
  private recline = 0;
  private saved: SavedBone[] = [];
  apply(skeleton: Skeleton, delta: number): void {
    const blend = 1 - Math.exp(-delta * 9);
    this.sit += ((this.pose === "stand" ? 0 : 1) - this.sit) * blend;
    this.recline += ((this.pose === "recline" ? 1 : 0) - this.recline) * blend;
    if (this.sit < .001) return;
    const edit = (name: string, change: (bone: Bone) => void) => {
      const bone = skeleton.findBone(name);
      if (!bone) throw new Error(`活动室坐姿缺少骨骼：${name}`);
      this.saved.push({ bone, x: bone.x, y: bone.y, rotation: bone.rotation });
      change(bone);
    };
    // Sofa: upright pelvis/torso. Cushion: retain the accepted 27-degree lean.
    edit("身体", b => { b.rotation = b.rotation * (1 - this.sit + this.recline) + this.recline * 27; });
    edit("身体2", b => { b.rotation -= this.recline * 4; });
    const sofa = Math.max(0, this.sit - this.recline);
    // The source rigs face +X before their default horizontal mirror. Keep the
    // two hip joints close in depth and turn the authored head rig toward that
    // same direction, so this reads as a left-facing side seat on screen.
    const hipLeft = skeleton.findBone("腿L")!;
    const hipRight = skeleton.findBone("腿R")!;
    const hipCenter = (hipLeft.x + hipRight.x) / 2;
    edit("腿L", b => { b.x += (hipCenter - 24 - b.x) * sofa; });
    edit("腿R", b => { b.x += (hipCenter + 24 - b.x) * sofa; });
    edit("3D_手柄", b => { b.x += 45 * sofa; });
    skeleton.updateWorldTransform(Physics.pose);
    const hip = skeleton.findBone("身体")!;
    // Side seat: thighs project forward (+X -> screen left), then calves hang.
    // The cushion keeps its previous stretched-leg targets and source knee bend.
    const reclining = this.sit > .001 ? this.recline / this.sit : 0;
    for (const [name, side] of [["脚l3", -1], ["脚r3", 1]] as const) {
      edit(name, b => {
        // ALL carries the source rig's own scale (about 0.22). Express offsets
        // in that parent space; treating source units as world units stretches
        // the weighted leg meshes several times beyond their intended length.
        const world = hip.parent!.localToWorld(new Vector2(
          hip.x + 245 + side * 32 + reclining * side * 60,
          hip.y - 300 + reclining * 180,
        ));
        const target = b.parent!.worldToLocal(world);
        b.x += (target.x - b.x) * this.sit;
        b.y += (target.y - b.y) * this.sit;
        const hangingRotation = side === -1 ? -12 : -2;
        const restingRotation = b.rotation + 22;
        b.rotation += ((1 - reclining) * hangingRotation + reclining * restingRotation - b.rotation) * this.sit;
      });
    }
    skeleton.updateWorldTransform(Physics.pose);
    // Aim each lower-leg mesh vertically, then level the actual shoe soles.
    // IK also moves the knee, so solve the small correction to convergence.
    // The cushion does not use this correction and retains its accepted pose.
    if (this.sit > .99 && reclining < .01) {
      for (let iteration = 0; iteration < 12; iteration++) {
        const left = drawableBounds(skeleton, ["脚l", "脚L"]);
        const right = drawableBounds(skeleton, ["脚r", "脚R"]);
        if (!left || !right) break;
        const floor = Math.min(left.y, right.y);
        let maximumCorrection = 0;
        for (const [suffix, bounds] of [["l", left], ["r", right]] as const) {
          const foot = skeleton.findBone(`脚${suffix}3`)!;
          const calf = skeleton.findBone(`脚${suffix}2`)!;
          const dx = calf.worldX - foot.worldX;
          const dy = floor - bounds.y;
          maximumCorrection = Math.max(maximumCorrection, Math.abs(dx), Math.abs(dy));
          const target = foot.parent!.worldToLocal(new Vector2(foot.worldX + dx * .8, foot.worldY + dy));
          foot.x = target.x; foot.y = target.y;
        }
        if (maximumCorrection < .03) break;
        skeleton.updateWorldTransform(Physics.pose);
      }
    }
  }

  restore(): void {
    for (const s of this.saved) { s.bone.x = s.x; s.bone.y = s.y; s.bone.rotation = s.rotation; }
    this.saved = [];
  }
}
