import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { AtlasAttachmentLoader, SkeletonJson, TextureAtlas, Skeleton, AnimationState, AnimationStateData, Physics } from "@esotericsoftware/spine-core";
import { FURNITURE, FURNITURE_FACING } from "../src/room/roomGeometry.ts";
import { shouldMirrorForFacingDirection } from "../src/pet/characterFacing.ts";
import { drawableBounds } from "../src/renderer/liftPoseGeometry.ts";
import { ROOM_POSE_LAYOUT, roomCharacterScale, roomFeetBounds, RoomPoseController } from "../src/renderer/RoomPoseController.ts";
for (const id of ["airui", "nangong", "qianxia"]) {
  test(`${id}: seated and reclining poses bend actual leg IK and restore unkeyed bones without drift`, () => {
    const root=new URL(`../public/characters/${id}/`,import.meta.url);
    const atlas=new TextureAtlas(readFileSync(new URL(`atlas-local/${id}.atlas`,root),"utf8"));
    const data=new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(readFileSync(new URL(`json/${id}.json`,root),"utf8")));
    const skeleton=new Skeleton(data); skeleton.setSkinByName("朝左");
    const state=new AnimationState(new AnimationStateData(data)); state.setAnimation(0,"动作_待机",true);
    const pose=new RoomPoseController();
    const targets=["脚l3","脚r3"].map(name=>skeleton.findBone(name)!);
    const baseline=targets.map(b=>({x:b.x,y:b.y,rotation:b.rotation}));
    const knee=skeleton.findBone("腿L3")!, thigh=skeleton.findBone("腿L2")!;
    const kneeAngle = () => knee.getWorldRotationX() - thigh.getWorldRotationX();
    state.apply(skeleton); skeleton.updateWorldTransform(Physics.update);
    const standingAngle=kneeAngle();
    const standingBounds=drawableBounds(skeleton)!;
    const angles:number[]=[], torso:number[]=[], feet:number[]=[]; let standingReference=standingAngle;
    for (const mode of ["sit","recline","stand"] as const) {
      pose.pose=mode;
      for(let frame=0;frame<180;frame++) {
        state.update(1/60);state.apply(skeleton);skeleton.update(1/60);skeleton.updateWorldTransform(Physics.update);
        if (mode === "stand" && frame === 179) standingReference = kneeAngle();
        const modified = ["身体", "身体2", "腿L", "腿R", "3D_手柄", "脚l3", "脚r3"].map(name => skeleton.findBone(name)!);
        const before = modified.map(b => ({x:b.x,y:b.y,rotation:b.rotation}));
        pose.apply(skeleton,1/60);
        for(const b of skeleton.bones) assert.ok(Number.isFinite(b.worldX)&&Number.isFinite(b.worldY),b.data.name);
        const bounds=drawableBounds(skeleton)!;
        assert.ok(bounds.width < standingBounds.width * 1.5, "weighted mesh stretched horizontally");
        assert.ok(bounds.height < standingBounds.height * 1.2, "weighted mesh stretched vertically");
        if(frame===179) {
          angles.push(kneeAngle()); torso.push(skeleton.findBone("身体")!.getWorldRotationX());
          feet.push(targets[0].worldX-skeleton.findBone("身体")!.worldX);
          if (mode === "recline") {
            const hip = skeleton.findBone("身体")!;
            assert.ok(Math.abs(targets[0].x - hip.x - 153) < .001, "accepted cushion leg extension changed");
            assert.ok(Math.abs(targets[0].y - hip.y + 120) < .001, "accepted cushion leg height changed");
            assert.ok(Math.abs(targets[0].rotation - baseline[0].rotation - 22) < .001, "accepted cushion foot angle changed");
          }
          if (mode === "sit") {
            const left = drawableBounds(skeleton, ["脚l", "脚L"])!;
            const right = drawableBounds(skeleton, ["脚r", "脚R"])!;
            const hip = skeleton.findBone("身体")!;
            assert.ok(Math.abs(left.y - right.y) < .5, "both soles must share the floor");
            for (const name of ["脚l2", "脚r2"]) {
              assert.ok(Math.abs(skeleton.findBone(name)!.getWorldRotationX() + 90) < 1, "calves must hang vertically");
            }
            assert.ok(hip.worldY - roomFeetBounds(skeleton)!.y > 75, "legs must drop below the seat");
            const mirrored = shouldMirrorForFacingDirection("朝左", FURNITURE_FACING.sofa);
            const screenSign = mirrored ? 1 : -1; // Each source rig has flipX=true.
            for (const name of ["脚l", "脚r"]) {
              assert.ok(Math.abs(skeleton.findBone(name)!.getWorldRotationX()) < 35,
                "thighs must project left from the pelvis instead of facing the camera");
            }
            for (const name of ["脚l2", "脚r2", "脚l3", "脚r3"]) {
              assert.ok((skeleton.findBone(name)!.worldX - hip.worldX) * screenSign < -22,
                "both knees and both feet must appear to the left of the pelvis");
            }
            // Reserve a larger sitting canvas without enlarging the character.
            // The head/torso keep the same source-unit scale through all poses.
            for (const backgroundHeight of [102, 351, 540, 621]) {
              const backgroundWidth = backgroundHeight * 2048 / 1080;
              const scaleFor = (mode: keyof typeof ROOM_POSE_LAYOUT) => {
                const layout = ROOM_POSE_LAYOUT[mode];
                return roomCharacterScale(standingBounds, backgroundWidth * layout.width,
                  backgroundHeight * layout.height, mode, .9);
              };
              const meshScale = scaleFor("sit");
              assert.ok(Math.abs(meshScale / scaleFor("stand") - 1) < 1e-10, "sitting enlarged the character");
              assert.ok(Math.abs(meshScale / scaleFor("recline") - 1) < 1e-10, "reclining changed body scale");
              const canvasHeight = backgroundHeight * ROOM_POSE_LAYOUT.sit.height;
              assert.ok(ROOM_POSE_LAYOUT.sit.anchorY*canvasHeight - (bounds.y+bounds.height-hip.worldY)*meshScale>=0, "sofa head clipped by its canvas");
              // The pelvis stays on the chosen seat, independent of foot height.
              const canvasTop = backgroundHeight * FURNITURE.day.sofa.y - canvasHeight * ROOM_POSE_LAYOUT.sit.anchorY;
              assert.ok(Math.abs(canvasTop + canvasHeight * ROOM_POSE_LAYOUT.sit.anchorY - backgroundHeight * 790/1080) < 1e-8);
            }
          }
        }
        pose.restore();
        assert.deepEqual(modified.map(b => ({x:b.x,y:b.y,rotation:b.rotation})),before,"side-seat offsets accumulated");
        assert.deepEqual(targets.map(b=>({x:b.x,y:b.y,rotation:b.rotation})),baseline,"IK offsets accumulated");
      }
    }
    assert.ok(Math.abs(angles[0]-standingAngle)>15,"sitting must bend the legs while letting the calves hang");
    assert.ok(Math.abs(torso[0]) < .1, "sofa torso must stay upright");
    assert.ok(Math.abs(torso[1]-torso[0])>20,"reclining must lean the torso");
    assert.ok(feet[1]>25,"reclining must retain its accepted extended legs");
    assert.ok(Math.abs(angles[2]-standingReference)<.001,"standing must recover the source pose");
  });
}
