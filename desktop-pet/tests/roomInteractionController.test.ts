import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { AIRUI } from "../src/characters/airui.ts";
import { NANGONG } from "../src/characters/nangong.ts";
import { QIANXIA } from "../src/characters/qianxia.ts";
import type { CharacterDefinition, ReactionKind } from "../src/characters/types.ts";
import type { SpineCharacterMetadata } from "../src/renderer/SpineRenderer.ts";
import { RoomInteractionController } from "../src/room/RoomInteractionController.ts";

function fixture(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let now = 0, timerId = 0;
  const timers = new Map<number, {at:number; callback:()=>void}>();
  const fakeWindow = {
    devicePixelRatio: 2,
    // A resident must never initialize desktop cursor polling/native dragging.
    get __TAURI_INTERNALS__(): never { throw new Error("room input touched native desktop APIs"); },
    setTimeout(callback:()=>void, delay:number) { timers.set(++timerId,{at:now+delay,callback}); return timerId; },
    clearTimeout(id:number) { timers.delete(id); },
  };
  Object.defineProperty(globalThis,"window",{configurable:true,value:fakeWindow});
  const controllers: RoomInteractionController[] = [];
  t.after(() => {
    for (const controller of controllers) controller.dispose();
    assert.equal(timers.size,0,"resident timers leaked");
    if (original) Object.defineProperty(globalThis,"window",original);
    else Reflect.deleteProperty(globalThis,"window");
  });
  return {
    advance(ms:number) {
      const end=now+ms;
      for (;;) {
        const due=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if (!due) break;
        now=due[1].at; timers.delete(due[0]); due[1].callback();
      }
      now=end;
    },
    resident(definition:CharacterDefinition) {
      const source=JSON.parse(readFileSync(new URL(`../public/characters/${definition.id}/json/${definition.id}.json`,import.meta.url),"utf8"));
      const actions=Object.keys(source.animations);
      const metadata={bodyActions:actions.filter(a=>a.startsWith("动作_")),overlays:actions.filter(a=>a.startsWith("表情_"))} as SpineCharacterMetadata;
      const plays:Array<{action:string;loop:boolean;overlay:string;id:number}>=[], reactions:ReactionKind[]=[];
      let restCount=0;
      const controller=new RoomInteractionController({} as HTMLElement,{
        play(action,loop,overlay) { const id=plays.length+1; plays.push({action,loop,overlay,id}); return id; },
        setOverlay() {}, onReaction:kind=>reactions.push(kind), onRest:()=>{restCount++;},
      },()=>0,()=>now);
      controllers.push(controller); controller.configure(definition,metadata);
      return {controller,plays,reactions,get restCount(){return restCount;},
        complete() { const p=plays.at(-1)!; controller.handleActionComplete(p.action,1,p.id); }};
    },
  };
}

for (const definition of [AIRUI,NANGONG,QIANXIA]) {
  for (const kind of ["click","doubleClick","rapidClick"] as const) {
    test(`${definition.id}: room ${kind} uses desktop recognition, action and expression`, t=>{
      const f=fixture(t), r=f.resident(definition);
      const count=kind==="click"?1:kind==="doubleClick"?2:5;
      for (let i=0;i<count;i++) { r.controller.click(); f.advance(50); }
      if (kind==="click") { assert.deepEqual(r.reactions,[]); f.advance(300); }
      const expected=definition.behavior.reactions[kind][0];
      const playing=r.plays.at(-1)!;
      assert.equal(playing.action,expected.action); assert.equal(playing.overlay,expected.overlay); assert.equal(playing.loop,false);
      assert.equal(r.reactions.at(-1),kind); assert.equal(r.controller.isReacting(),true);
      // A stale completion from an interrupted, lower-priority click cannot reset it.
      r.controller.handleActionComplete(definition.preferredAction,1,0);
      assert.equal(r.controller.isReacting(),true);
      r.complete();
      assert.equal(r.controller.isReacting(),false);
      assert.equal(r.plays.at(-1)!.action,definition.preferredAction);
      assert.equal(r.plays.at(-1)!.overlay,definition.preferredOverlay);
      assert.equal(r.plays.at(-1)!.loop,true);
    });
  }
  test(`${definition.id}: room retains its desktop click cooldown`,t=>{
    const f=fixture(t),r=f.resident(definition);
    r.controller.click();f.advance(300);r.complete();
    f.advance(500);r.controller.click();f.advance(300);
    assert.deepEqual(r.reactions,["click"]);
    f.advance(definition.behavior.cooldownMs.click);r.controller.click();f.advance(300);
    assert.deepEqual(r.reactions,["click","click"]);
  });
}

test("seating or hiding cancels pending input, and standing restores interactions",t=>{
  const f=fixture(t),r=f.resident(AIRUI);
  r.controller.click();r.controller.setAvailable(false);f.advance(400);
  r.controller.click();f.advance(400);
  assert.deepEqual(r.reactions,[]);
  r.controller.setAvailable(true);r.controller.click();f.advance(300);
  assert.deepEqual(r.reactions,["click"]);
  r.controller.setAvailable(false);
  assert.equal(r.controller.isReacting(),false);
});

test("dragging cancels pending clicks and interrupts a running reaction",t=>{
  const f=fixture(t),r=f.resident(QIANXIA);
  r.controller.click();r.controller.cancelGesture();f.advance(400);
  assert.deepEqual(r.reactions,[]);
  r.controller.click();f.advance(300);assert.equal(r.controller.isReacting(),true);
  const old=r.plays.at(-1)!;
  r.controller.cancelGesture();assert.equal(r.controller.isReacting(),false);
  const playCount=r.plays.length;
  r.controller.handleActionComplete(old.action,1,old.id);
  assert.equal(r.plays.length,playCount);
});

test("room respects the desktop click and double-click switches",t=>{
  const f=fixture(t),r=f.resident(AIRUI);
  r.controller.click();r.controller.setPreferences({clickEnabled:false,doubleClickEnabled:false});f.advance(400);
  assert.deepEqual(r.reactions,[]);
  r.controller.setPreferences({clickEnabled:false,doubleClickEnabled:true});
  r.controller.click();f.advance(50);r.controller.click();
  assert.deepEqual(r.reactions,["doubleClick"]);r.complete();
  const other=f.resident(NANGONG);
  other.controller.setPreferences({clickEnabled:true,doubleClickEnabled:false});
  other.controller.click();f.advance(50);other.controller.click();f.advance(400);
  assert.deepEqual(other.reactions,[]);
  f.advance(500);other.controller.click();f.advance(300);
  assert.deepEqual(other.reactions,["click"]);
});

test("different room residents never combine clicks into a double-click",t=>{
  const f=fixture(t),a=f.resident(AIRUI),b=f.resident(NANGONG);
  a.controller.click();f.advance(50);b.controller.click();f.advance(300);
  assert.deepEqual(a.reactions,["click"]);assert.deepEqual(b.reactions,["click"]);
});

test("leaving the room disposes pending clicks and idle timers",t=>{
  const f=fixture(t),r=f.resident(AIRUI);
  r.controller.click();r.controller.dispose();f.advance(500);
  r.controller.click();assert.deepEqual(r.reactions,[]);
});
