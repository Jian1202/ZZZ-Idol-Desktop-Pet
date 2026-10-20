import assert from "node:assert/strict";
import test from "node:test";
import { availableFurniture, clampFloor, FURNITURE, furnitureAt, ROOM_ASPECT, ROOM_BASE_WIDTH, ROOM_FRAME_ASPECT,
  ROOM_MIN_SCALE, resizeRoomWindow, roomFrameBounds, roomPeriod, stepToward } from "../src/room/roomGeometry.ts";
test("window edge drags preserve aspect, opposite edges and the twenty percent minimum", () => {
  const start = { x: -1024, y: 100, width: 1024, height: Math.round(1024 / ROOM_FRAME_ASPECT) };
  for (const direction of ["North", "South", "East", "West", "NorthEast", "NorthWest", "SouthEast", "SouthWest"] as const) {
    for (const delta of [-10000, -300, 300, 10000]) {
      const next = resizeRoomWindow(start, direction, delta, delta);
      assert.ok(next.width >= 205 && next.height >= 124);
      assert.ok(Math.abs(next.height - next.width / ROOM_FRAME_ASPECT) <= .5);
      if (direction.includes("West")) assert.equal(next.x + next.width, start.x + start.width);
      else assert.equal(next.x, start.x);
      if (direction.includes("North")) assert.equal(next.y + next.height, start.y + start.height);
      else assert.equal(next.y, start.y);
    }
  }
  const minimum = resizeRoomWindow(start,"SouthEast",-10000,-10000);
  assert.deepEqual(minimum, {x:-1024,y:100,width:205,height:124});
  const restored = resizeRoomWindow(minimum,"SouthEast",819,495);
  assert.deepEqual(restored,start);
});
test("production frame keeps the whole image and seats proportional down to twenty percent", () => {
  const base = roomFrameBounds(ROOM_BASE_WIDTH, ROOM_BASE_WIDTH / ROOM_FRAME_ASPECT);
  for (const scale of [ROOM_MIN_SCALE, .35, .65, 1, 1.5]) {
    const frame = roomFrameBounds(ROOM_BASE_WIDTH * scale, ROOM_BASE_WIDTH / ROOM_FRAME_ASPECT * scale);
    assert.ok(Math.abs(frame.scene.width / base.scene.width - scale) < 1e-10);
    assert.ok(Math.abs(frame.scene.height / base.scene.height - scale) < 1e-10);
    assert.ok(Math.abs(frame.scene.width / frame.scene.height - ROOM_ASPECT) < 1e-10, "background distorted");
    assert.ok(frame.scene.top > frame.height * .16, "background overlaps the logo/header");
    assert.ok(frame.scene.left > frame.left && frame.scene.left + frame.scene.width < frame.left + frame.width);
  }
  // Arbitrary edge drags add transparent space instead of cropping or distorting.
  for (const [width, height] of [[205,124], [640,900], [1400,470]]) {
    const frame = roomFrameBounds(width,height);
    assert.ok(frame.left >= 0 && frame.top >= 0);
    assert.ok(frame.left + frame.width <= width + 1e-8 && frame.top + frame.height <= height + 1e-8);
    assert.ok(Math.abs(frame.scene.width / frame.scene.height - ROOM_ASPECT) < 1e-10);
  }
});
test("day/night places seats on the sofa middle and cushion V groove", () => {
  assert.deepEqual(FURNITURE.day, { sofa: { x: 1895/2048, y: 790/1080 }, cushion: { x:297/2048, y:868/1080 } });
  assert.deepEqual(FURNITURE.night, { sofa: { x: 1895/2048, y: 790/1080 }, cushion: { x:297/2048, y:868/1080 } });
  assert.equal(roomPeriod("auto", 6), "night"); assert.equal(roomPeriod("auto", 7), "day");
  assert.equal(roomPeriod("auto", 18), "day"); assert.equal(roomPeriod("auto", 19), "night");
  assert.equal(roomPeriod("night", 12), "night");
  for (const period of ["day", "night"] as const) for (const id of ["sofa", "cushion"] as const) {
    assert.equal(furnitureAt(FURNITURE[period][id], period), id);
  }
  assert.equal(furnitureAt({x:.5,y:.9}, "day"), null);
});
test("free walking never enters furniture/wall space or overshoots its destination", () => {
  for (let x=-1; x<=2; x+=.05) for (let y=-1; y<=2; y+=.1) {
    const p = clampFloor({x,y});
    assert.ok(p.x>=.25 && p.x<=.85 && p.y>=.8 && p.y<=.95);
    assert.equal(furnitureAt(p,"day"),null);
  }
  assert.deepEqual(clampFloor({ x:NaN,y:Infinity }),{x:.5,y:.88});
  const a={x:.3,y:.85}, b={x:.8,y:.94}; let p=a;
  for (let i=0;i<1000;i++) {
    const next=stepToward(p,b,.001);
    assert.ok(Math.hypot((next.x-p.x)*ROOM_ASPECT,next.y-p.y)<=.00100001);
    p=next;
  }
  assert.deepEqual(p,b);
  assert.deepEqual(stepToward(b,b,.1),b);
});
test("each seat has one owner, while the owner can reuse it", () => {
  const residents=[{id:"airui",furniture:"sofa" as const},{id:"qianxia",furniture:null}];
  assert.equal(availableFurniture(residents,"sofa","qianxia"),false);
  assert.equal(availableFurniture(residents,"sofa","airui"),true);
  assert.equal(availableFurniture(residents,"cushion","qianxia"),true);
});
