/**
 * services/event-scheduler.ts
 *
 * DEPRECATED shim. The evenly-spaced scheduler this module used to be has been
 * replaced by ``services/event-player.ts``, which preserves the *relative*
 * rhythm of the backend's timestamps and supports pause/resume/seek/speed.
 *
 * The public API is preserved for any external caller and forwards to the
 * player.
 */

import type { BackendOrchestrationEvent } from "@/services/api";
import { createEventPlayer } from "@/services/event-player";

export type EventSchedulerOptions = {
  durationMs?: number;
  minGapMs?: number;
};

export type EventScheduler = {
  cancel: () => void;
};

/** Fire ``events`` chronologically over ``durationMs`` ms total. */
export function scheduleEvents(
  events: BackendOrchestrationEvent[],
  onEvent: (event: BackendOrchestrationEvent) => void,
  { durationMs = 15_000, minGapMs = 120 }: EventSchedulerOptions = {}
): EventScheduler {
  const player = createEventPlayer(events, {
    onEvent,
    targetDurationMs: durationMs,
    minGapMs,
  });
  player.play();
  return { cancel: player.cancel };
}
