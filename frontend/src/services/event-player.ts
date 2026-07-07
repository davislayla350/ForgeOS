/**
 * services/event-player.ts
 *
 * EventPlayer -- chronological replay of a completed orchestration run.
 *
 * The backend returns a full CompanyRunResult with an ordered ``events`` array;
 * each event carries an ISO timestamp. The naive options are both bad:
 *
 *   * "Play at real time" -- deterministic fallback events fire ~2ms apart so
 *     the whole run flashes past in under a second; LLM runs stall for seconds
 *     of silence during a slow model call. Neither feels like watching work.
 *
 *   * "Space evenly" -- ignores the actual rhythm; a rejection + revision that
 *     took real thinking time reads the same as two trivial state changes.
 *
 * This player instead uses **proportional pacing**: it preserves the *relative*
 * intervals between real timestamps and scales the whole run to a target
 * duration (default 15s). A burst of tightly-clustered events stays a burst;
 * a long pause stays a pause; the total feels watchable.
 *
 * The player exposes a real controller: play, pause, resume, seek, setSpeed,
 * cancel. It is state-shape agnostic -- the caller decides what to do with each
 * event via the ``onEvent`` callback.
 */

import type { BackendOrchestrationEvent } from "@/services/api";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type EventPlayerStatus = "idle" | "playing" | "paused" | "finished";

export type EventPlayerOptions = {
  /** Called for each event as it fires, in chronological order. */
  onEvent: (event: BackendOrchestrationEvent, index: number) => void;
  /** Called every time playback status changes. */
  onStatusChange?: (status: EventPlayerStatus) => void;
  /**
   * Called with a 0..1 progress fraction as playback advances. Fires on every
   * event *and* on a smooth interval between events so a progress bar animates
   * naturally rather than jumping only on event boundaries.
   */
  onProgress?: (fraction: number) => void;
  /** Target total playback duration in ms. Default 15_000. */
  targetDurationMs?: number;
  /** Minimum gap between two events in ms (prevents unreadable strobing). */
  minGapMs?: number;
  /** Maximum gap between two events in ms (prevents dead air on LLM pauses). */
  maxGapMs?: number;
  /** Interval for smooth progress ticks between events. Default 100ms. */
  progressTickMs?: number;
};

export type EventPlayer = {
  play: () => void;
  pause: () => void;
  resume: () => void;
  /** Instantly advance to a 0..1 fraction, firing every event skipped over. */
  seek: (fraction: number) => void;
  /** Adjust playback rate (1 = normal, 2 = double time, 0.5 = half). */
  setSpeed: (rate: number) => void;
  /** Cancel playback and release timers. */
  cancel: () => void;
  status: () => EventPlayerStatus;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build an EventPlayer that will replay ``events`` in order, respecting their
 * timestamps proportionally.
 */
export function createEventPlayer(
  events: BackendOrchestrationEvent[],
  {
    onEvent,
    onStatusChange,
    onProgress,
    targetDurationMs = 15_000,
    minGapMs = 120,
    maxGapMs = 1_800,
    progressTickMs = 100,
  }: EventPlayerOptions
): EventPlayer {
  // ---- Precompute the schedule once ---------------------------------------
  // Sort defensively; the backend already delivers in order but paying that
  // extra pass here means the player is safe for any input.
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const schedule = computeSchedule(ordered, {
    targetDurationMs,
    minGapMs,
    maxGapMs,
  });
  const totalDuration = schedule.length
    ? schedule[schedule.length - 1]
    : 0;

  // ---- Playback state ------------------------------------------------------
  let status: EventPlayerStatus = "idle";
  let speed = 1;
  let nextIndex = 0;
  // "elapsed" is the virtual time within the scaled schedule (0..totalDuration).
  let elapsed = 0;
  // Anchor from which to measure real time on the current play segment.
  let segmentStartWallMs = 0;
  let segmentStartElapsed = 0;
  let eventTimer: ReturnType<typeof setTimeout> | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  function setStatus(next: EventPlayerStatus): void {
    if (status === next) return;
    status = next;
    onStatusChange?.(next);
  }

  function clearTimers(): void {
    if (eventTimer !== null) {
      clearTimeout(eventTimer);
      eventTimer = null;
    }
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function currentElapsed(): number {
    if (status === "playing") {
      const now = performance.now();
      return segmentStartElapsed + (now - segmentStartWallMs) * speed;
    }
    return elapsed;
  }

  function reportProgress(): void {
    if (!onProgress) return;
    if (totalDuration === 0) {
      onProgress(1);
      return;
    }
    const frac = Math.min(1, Math.max(0, currentElapsed() / totalDuration));
    onProgress(frac);
  }

  /** Schedule the next event based on the current elapsed time. */
  function scheduleNext(): void {
    if (eventTimer !== null) {
      clearTimeout(eventTimer);
      eventTimer = null;
    }
    if (nextIndex >= ordered.length) {
      finish();
      return;
    }
    const dueAt = schedule[nextIndex];
    const remainingVirtual = Math.max(0, dueAt - currentElapsed());
    const realMs = remainingVirtual / Math.max(0.1, speed);
    eventTimer = setTimeout(fireNext, realMs);
  }

  function fireNext(): void {
    if (status !== "playing") return;
    // Emit every event that has come due (protects against clock drift + speed
    // changes that would otherwise skip an event).
    const nowElapsed = currentElapsed();
    while (nextIndex < ordered.length && schedule[nextIndex] <= nowElapsed + 1) {
      onEvent(ordered[nextIndex], nextIndex);
      nextIndex += 1;
    }
    reportProgress();
    if (nextIndex >= ordered.length) {
      finish();
      return;
    }
    scheduleNext();
  }

  function finish(): void {
    clearTimers();
    elapsed = totalDuration;
    onProgress?.(1);
    setStatus("finished");
  }

  function startSegment(): void {
    segmentStartWallMs = performance.now();
    segmentStartElapsed = elapsed;
    if (progressTimer === null && onProgress) {
      progressTimer = setInterval(reportProgress, progressTickMs);
    }
    reportProgress();
    scheduleNext();
  }

  // ---- Public API ---------------------------------------------------------
  return {
    play(): void {
      if (status === "playing") return;
      if (ordered.length === 0) {
        setStatus("finished");
        onProgress?.(1);
        return;
      }
      nextIndex = 0;
      elapsed = 0;
      setStatus("playing");
      startSegment();
    },

    pause(): void {
      if (status !== "playing") return;
      elapsed = currentElapsed();
      clearTimers();
      setStatus("paused");
    },

    resume(): void {
      if (status !== "paused") return;
      setStatus("playing");
      startSegment();
    },

    seek(fraction: number): void {
      const clamped = Math.min(1, Math.max(0, fraction));
      const targetElapsed = clamped * totalDuration;
      // Fire every event whose scheduled time we've passed.
      while (
        nextIndex < ordered.length &&
        schedule[nextIndex] <= targetElapsed
      ) {
        onEvent(ordered[nextIndex], nextIndex);
        nextIndex += 1;
      }
      elapsed = targetElapsed;
      reportProgress();
      if (status === "playing") {
        // Re-anchor the segment so future timing is measured from here.
        segmentStartWallMs = performance.now();
        segmentStartElapsed = elapsed;
        if (nextIndex >= ordered.length) {
          finish();
        } else {
          scheduleNext();
        }
      } else if (nextIndex >= ordered.length && status !== "idle") {
        setStatus("finished");
      }
    },

    setSpeed(rate: number): void {
      const clamped = Math.max(0.1, Math.min(rate, 10));
      if (status === "playing") {
        // Freeze current elapsed at the old speed before switching.
        elapsed = currentElapsed();
        speed = clamped;
        segmentStartWallMs = performance.now();
        segmentStartElapsed = elapsed;
        scheduleNext();
      } else {
        speed = clamped;
      }
    },

    cancel(): void {
      clearTimers();
      setStatus("idle");
    },

    status(): EventPlayerStatus {
      return status;
    },
  };
}

// ---------------------------------------------------------------------------
// Schedule computation (pure, exported for testing)
// ---------------------------------------------------------------------------

type ScheduleOptions = {
  targetDurationMs: number;
  minGapMs: number;
  maxGapMs: number;
};

/**
 * Given a chronologically ordered event list, return an array of virtual
 * "fire at" times (in ms, starting at 0) that:
 *
 *   * preserves the relative shape of the original timestamp intervals,
 *   * clamps each interval to [minGapMs, maxGapMs] so nothing strobes and
 *     no gap becomes dead air, and
 *   * scales the whole thing so the total run ends around targetDurationMs.
 *
 * If timestamps are unusable (missing, all equal, non-monotonic), it falls back
 * to evenly spaced intervals.
 */
export function computeSchedule(
  events: BackendOrchestrationEvent[],
  { targetDurationMs, minGapMs, maxGapMs }: ScheduleOptions
): number[] {
  if (events.length === 0) return [];
  if (events.length === 1) return [0];

  // Parse timestamps into ms. If any parse fails or times aren't monotonic,
  // fall through to even spacing.
  const times: number[] = [];
  let usable = true;
  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t)) {
      usable = false;
      break;
    }
    times.push(t);
  }
  if (usable) {
    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1]) {
        usable = false;
        break;
      }
    }
  }

  if (!usable) {
    const gap = Math.max(
      minGapMs,
      Math.min(maxGapMs, Math.floor(targetDurationMs / events.length))
    );
    return events.map((_, i) => i * gap);
  }

  const rawIntervals: number[] = [];
  for (let i = 1; i < times.length; i++) {
    rawIntervals.push(Math.max(0, times[i] - times[i - 1]));
  }
  const rawTotal = rawIntervals.reduce((a, b) => a + b, 0);

  // Degenerate case: everything at the same instant -> even spacing.
  if (rawTotal === 0) {
    const gap = Math.max(
      minGapMs,
      Math.min(maxGapMs, Math.floor(targetDurationMs / events.length))
    );
    return events.map((_, i) => i * gap);
  }

  // Scale each interval by the ratio that maps raw total -> target duration,
  // then clamp to the min/max readability window.
  const scale = targetDurationMs / rawTotal;
  const clamped = rawIntervals.map((raw) =>
    Math.min(maxGapMs, Math.max(minGapMs, raw * scale))
  );

  // After clamping the total may drift; renormalise so it lands on target.
  const clampedTotal = clamped.reduce((a, b) => a + b, 0);
  const finalIntervals =
    clampedTotal > 0
      ? clamped.map((v) => (v * targetDurationMs) / clampedTotal)
      : clamped;

  const schedule: number[] = [0];
  let running = 0;
  for (const interval of finalIntervals) {
    running += interval;
    schedule.push(running);
  }
  return schedule;
}
