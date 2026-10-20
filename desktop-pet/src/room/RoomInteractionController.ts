import type { CharacterDefinition, ReactionKind } from "../characters/types";
import type { SpineCharacterMetadata } from "../renderer/SpineRenderer";
import { PetInteractionController, type InteractionPreferences } from "../pet/PetInteractionController.ts";
import { PetStateMachine, type PetStateSnapshot } from "../pet/PetStateMachine.ts";

interface RoomInteractionHost {
  play(action: string, loop: boolean, overlay: string): number;
  setOverlay(overlay: string): void;
  onReaction(kind: ReactionKind): void;
  onRest(): void;
}
/** Uses desktop recognition, reaction pools, priorities and cooldowns; the room
 * remains responsible for alpha hit-testing, furniture and character dragging. */
export class RoomInteractionController {
  private readonly input: PetInteractionController;
  private readonly state: PetStateMachine;
  private available = true;
  private configured = false;
  private disposed = false;
  private reacting = false;

  constructor(surface: HTMLElement, host: RoomInteractionHost, random = Math.random, now = Date.now) {
    this.state = new PetStateMachine({
      play: (action, loop, overlay) => host.play(action, loop, overlay),
      setOverlay: overlay => host.setOverlay(overlay),
      // Room roaming owns idle activity; its timer must not interrupt reactions.
      canPlayIdleRandomAction: () => false,
      onStateChange: snapshot => {
        this.reacting = snapshot.state.endsWith("_reaction");
        if (snapshot.state === "idle") host.onRest();
      },
    }, random, now);
    this.input = new PetInteractionController(surface, {
      sampleAlphaAt: () => 0,
      onHover() {}, onDragStart() {}, onDragMove() {}, onDragEnd() {}, onError() {},
      onReaction: kind => {
        if (!this.available || this.disposed || !this.configured) return;
        if (this.state.trigger(kind)) host.onReaction(kind);
      },
    }, now, { externalInput: true });
  }

  configure(definition: CharacterDefinition, metadata: SpineCharacterMetadata): void {
    this.configured = true;
    this.state.configure(definition, metadata);
  }
  setPreferences(preferences: Pick<InteractionPreferences, "clickEnabled" | "doubleClickEnabled">): void {
    this.input.setPreferences({ ...preferences, hoverEnabled: false });
  }
  setAvailable(available: boolean): void {
    if (this.available === available || this.disposed) return;
    this.available = available;
    this.input.setEnabled(available);
    if (!available && this.configured) this.state.forceIdle();
  }
  click(): void {
    if (this.available && !this.disposed && this.configured) this.input.simulateClick();
  }
  cancelGesture(): void {
    this.input.reset();
    if (this.configured && this.isReacting()) this.state.forceIdle();
  }
  isReacting(): boolean {
    return this.reacting;
  }
  handleActionComplete(action: string, loopCount: number, playbackId: number): void {
    if (!this.disposed) this.state.handleActionComplete(action, loopCount, playbackId);
  }
  getSnapshot(): PetStateSnapshot { return this.state.getSnapshot(); }
  dispose(): void {
    this.disposed = true;
    this.input.dispose(); this.state.dispose();
  }
}
