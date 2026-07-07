"use client";

/**
 * useOrchestration
 *
 * Public interface preserved: { state, launch, reset, source }. Every component
 * still consumes the same OrchestrationState shape. Internally, the fake
 * client-side script and its wall-clock timers are gone. On launch we:
 *
 *   1. open a WebSocket to the backend live stream (via ``startLiveStream``);
 *   2. flip into a loading state (isRunning=true, empty panels);
 *   3. reduce every arriving event into state via ``applyBackendEvent``.
 *
 * If the WebSocket can't reach the backend at all, we fall back to POST
 * /company/launch + client-side event replay (still real backend events,
 * just paced by the ``EventPlayer``). If REST also fails, we surface an error
 * state -- there is no simulated-orchestration fallback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AI_EMPLOYEES } from "@/lib/constants";
import type {
  ActivityEntry,
  Deliverable,
  OrchestrationState,
  TimelineEvent,
} from "@/lib/orchestration-types";
import {
  BackendUnavailableError,
  friendlyLaunchError,
  launchCompany,
  type BackendCompanyRunResult,
  type BackendOrchestrationEvent,
} from "@/services/api";
import {
  applyBackendEvent,
  buildLiveContext,
  buildReducerContext,
  createEmptyStreamedState,
} from "@/services/orchestration-adapter";
import { createEventPlayer, type EventPlayer } from "@/services/event-player";
import {
  startLiveStream,
  type LiveStreamHandle,
} from "@/services/live-stream";

/** Source of the current run -- surfaced so components can label the mode. */
export type OrchestrationSource = "live" | "backend" | null;

function createInitialState(): OrchestrationState {
  return {
    isRunning: false,
    isComplete: false,
    progress: 0,
    projectIdea: "",
    employees: AI_EMPLOYEES.map((e) => ({ ...e, status: "offline" as const })),
    activities: [],
    timelineEvents: [],
    deliverables: [],
    missionControlMessages: [],
    memoryContext: null,
    projectPlan: null,
    releaseSummary: null,
    startedAt: null,
    completedAt: null,
    codeBundle: null,
    agentTime: {},
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOrchestration() {
  const [state, setState] = useState<OrchestrationState>(createInitialState);
  const [source, setSource] = useState<OrchestrationSource>(null);
  // User-facing failure message; null while healthy. Set only when both the
  // live WebSocket path and the REST fallback have failed.
  const [error, setError] = useState<string | null>(null);

  // Live path: WebSocket + REST replay resources. The fake-script fallback
  // and its wall-clock timers were removed; if both live and REST fail, we
  // surface an error state rather than pretend to run a project.
  const playerRef = useRef<EventPlayer | null>(null);
  const liveStreamRef = useRef<LiveStreamHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearAll = useCallback(() => {
    playerRef.current?.cancel();
    playerRef.current = null;
    liveStreamRef.current?.close();
    liveStreamRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const runBackend = useCallback(
    (result: BackendCompanyRunResult) => {
      const ctx = buildReducerContext(result);
      playerRef.current = createEventPlayer(result.events, {
        onEvent: (event: BackendOrchestrationEvent) => {
          setState((prev) => applyBackendEvent(prev, event, ctx));
        },
        onProgress: (fraction: number) => {
          // Smooth progress: EventPlayer emits between event boundaries too, so
          // the bar animates naturally instead of jumping only on events.
          const percent = Math.round(fraction * 100);
          setState((prev) =>
            prev.progress === percent ? prev : { ...prev, progress: percent }
          );
        },
        onStatusChange: (status) => {
          if (status === "finished") {
            // The backend's own run_completed event already flips
            // isRunning/isComplete; this is just a belt-and-braces guard for
            // runs that end without that event for any reason.
            setState((prev) =>
              prev.isComplete
                ? prev
                : { ...prev, isRunning: false, isComplete: true, progress: 100 }
            );
          }
        },
      });
      playerRef.current.play();
    },
    []
  );

  const runLive = useCallback(
    (projectIdea: string, onFallback: (reason: string) => void) => {
      const ctx = buildLiveContext();
      liveStreamRef.current = startLiveStream(projectIdea, {
        onEvent: (event) => {
          setState((prev) => applyBackendEvent(prev, event, ctx));
        },
        onStatus: (status) => {
          // Surface a lightweight status in activity so the user knows what
          // happened. Only visible transitions get a row.
          if (status === "reconnecting") {
            setState((prev) => ({
              ...prev,
              activities: [
                {
                  id: `activity-status-reconnect-${Date.now()}`,
                  agent: "ForgeOS",
                  action: "Reconnecting to live stream",
                  time: "just now",
                },
                ...prev.activities,
              ],
            }));
          }
        },
        onFallback: (reason) => {
          console.warn("[ForgeOS] Live stream unavailable, falling back to replay.", reason);
          onFallback(reason);
        },
        onComplete: () => {
          // Belt-and-braces: the run_completed event should already have
          // flipped state, but if not, do it now.
          setState((prev) =>
            prev.isComplete
              ? prev
              : { ...prev, isRunning: false, isComplete: true, progress: 100 }
          );
        },
      });
    },
    []
  );

  const launch = useCallback(
    async (projectIdea: string) => {
      clearAll();
      setError(null);

      // Immediately flip into a loading state so the button + panels react.
      setState(createEmptyStreamedState(projectIdea));

      // Try live streaming first. If the WebSocket can't reach the backend
      // (or fails all reconnect attempts), fall through to REST + replay.
      // If REST also fails, surface an error state, no fake simulation.
      let liveFellBack = false;
      runLive(projectIdea, async (reason) => {
        if (liveFellBack) return;
        liveFellBack = true;
        setSource("backend");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const result = await launchCompany(projectIdea, {
            signal: controller.signal,
          });
          runBackend(result);
        } catch (err) {
          if (err instanceof BackendUnavailableError) {
            console.error(
              "[ForgeOS] Backend unreachable via both WebSocket and REST.",
              { wsReason: reason, restError: err }
            );
          } else {
            console.error("[ForgeOS] Unexpected launch failure:", err);
          }
          const message = friendlyLaunchError(err);
          setError(message);
          setState((prev) => ({
            ...prev,
            isRunning: false,
            activities: [
              {
                id: `activity-error-${Date.now()}`,
                agent: "ForgeOS",
                action: message,
                time: "just now",
              },
              ...prev.activities,
            ],
          }));
        } finally {
          abortRef.current = null;
        }
      });
      setSource("live");
    },
    [clearAll, runBackend, runLive]
  );

  const reset = useCallback(() => {
    clearAll();
    setSource(null);
    setError(null);
    setState(createInitialState());
  }, [clearAll]);

  useEffect(() => clearAll, [clearAll]);

  return { state, launch, reset, source, error };
}

export type { ActivityEntry, Deliverable, OrchestrationState, TimelineEvent };
