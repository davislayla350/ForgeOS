/**
 * services/live-stream.ts
 *
 * Live WebSocket client for /company/stream/{run_id}.
 *
 * Design goals:
 *   * Start a run via POST /company/start, then open the WebSocket with the
 *     returned run_id.
 *   * Deliver events immediately as they arrive (no client-side pacing).
 *   * Auto-reconnect on drop, using ?since=<last-seq> so the server resumes
 *     the stream without duplicating or missing events.
 *   * Give up after a bounded number of consecutive failed reconnects and
 *     signal fallback so the caller can switch to REST + replay.
 *
 * Non-goals for this file:
 *   * State reduction. That still lives in the adapter.
 *   * REST fallback. The hook orchestrates that; this file just tells the hook
 *     when to fall back via ``onFallback``.
 */

import { API_BASE_URL, type BackendOrchestrationEvent } from "@/services/api";

/** Terminal event types after which the stream is considered done. */
const TERMINAL_EVENT_TYPES = new Set(["run_completed", "run_failed"]);

/** Cap consecutive failed reconnects before giving up and falling back. */
const MAX_RECONNECT_ATTEMPTS = 4;

/** Exponential backoff between reconnects: 250ms, 500ms, 1s, 2s. */
const RECONNECT_DELAYS_MS = [250, 500, 1000, 2000];

export type LiveStreamStatus =
  | "starting"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "failed";

export type LiveStreamOptions = {
  /** Called for each real orchestration event (skips hello/error envelopes). */
  onEvent: (event: BackendOrchestrationEvent) => void;
  /** Called on every WebSocket status transition. */
  onStatus?: (status: LiveStreamStatus, info?: { attempt?: number }) => void;
  /** Called once when we give up on the WebSocket. Caller falls back to REST. */
  onFallback: (reason: string) => void;
  /** Called once when the stream terminates cleanly (run_completed). */
  onComplete?: () => void;
};

export type LiveStreamHandle = {
  /** Close the stream permanently. No more reconnects. */
  close: () => void;
  /** Current run_id, once ``start`` has resolved. */
  runId: () => string | null;
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function httpToWs(baseUrl: string): string {
  // Support both explicit ws:// and http:// bases. If it already starts with
  // ws, leave alone; otherwise flip http->ws / https->wss.
  if (/^wss?:\/\//i.test(baseUrl)) return baseUrl;
  return baseUrl.replace(/^http(s?):\/\//i, "ws$1://");
}

function wsUrlFor(runId: string, sinceSeq: number): string {
  const base = httpToWs(API_BASE_URL);
  const suffix = sinceSeq > 0 ? `?since=${sinceSeq}` : "";
  return `${base}/company/stream/${encodeURIComponent(runId)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a run and stream its events over a WebSocket. Returns a handle that
 * exposes ``close()`` and the current ``runId()``.
 *
 * Behavior on connection failure:
 *   * If the initial ``POST /company/start`` fails, ``onFallback`` fires
 *     immediately and no WebSocket is opened.
 *   * If the WebSocket fails after being briefly open OR fails to open, we
 *     reconnect up to ``MAX_RECONNECT_ATTEMPTS`` times with backoff. If the
 *     run is already complete, the buffered stream will replay in full via
 *     ``?since=0`` and the caller sees a coherent end-of-run state.
 *   * If all reconnects fail, ``onFallback`` fires and the handle is closed.
 */
export function startLiveStream(
  project: string,
  options: LiveStreamOptions
): LiveStreamHandle {
  const { onEvent, onStatus, onFallback, onComplete } = options;

  let runId: string | null = null;
  let lastSeq = 0;
  let attempt = 0;
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let terminatedByServer = false;

  const setStatus = (s: LiveStreamStatus, info?: { attempt?: number }) => {
    onStatus?.(s, info);
  };

  const closeSocket = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };

  const openSocket = (isReconnect: boolean) => {
    if (closed || runId === null) return;
    const url = wsUrlFor(runId, lastSeq);
    setStatus(isReconnect ? "reconnecting" : "connecting", { attempt });

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      // Constructor threw synchronously. Treat as a fatal connect failure.
      scheduleReconnectOrFallback(`WebSocket constructor failed: ${err}`);
      return;
    }

    ws = socket;
    let opened = false;

    socket.onopen = () => {
      opened = true;
      attempt = 0; // reset backoff on successful open
      setStatus("open");
    };

    socket.onmessage = (evt) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(evt.data as string);
      } catch {
        return;
      }
      const type = typeof msg.type === "string" ? msg.type : "";
      if (type === "hello") {
        // Envelope. Nothing to render; we already know runId + lastSeq.
        return;
      }
      if (type === "error") {
        // Server-side error frame; treat as terminal and fall back.
        terminatedByServer = true;
        onFallback(`server error: ${String(msg.message ?? "unknown")}`);
        closed = true;
        closeSocket();
        return;
      }
      // Real orchestration event. Track seq so reconnect knows where to resume.
      const seq = typeof msg.seq === "number" ? msg.seq : 0;
      if (seq > lastSeq) lastSeq = seq;
      onEvent(msg as unknown as BackendOrchestrationEvent);
      if (TERMINAL_EVENT_TYPES.has(type)) {
        terminatedByServer = true;
        onComplete?.();
        closed = true;
        closeSocket();
        setStatus("closed");
      }
    };

    socket.onerror = () => {
      // We rely on ``onclose`` for the reconnect decision; errors alone
      // don't tell us whether the socket ever opened.
    };

    socket.onclose = () => {
      ws = null;
      if (closed || terminatedByServer) {
        setStatus("closed");
        return;
      }
      // Reconnect logic. If we never opened, retry as a connect failure;
      // otherwise retry as an unexpected drop -- both use the same policy.
      scheduleReconnectOrFallback(
        opened ? "connection dropped" : "connection never opened"
      );
    };
  };

  const scheduleReconnectOrFallback = (reason: string) => {
    if (closed) return;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      onFallback(reason);
      closed = true;
      setStatus("failed");
      return;
    }
    const delay = RECONNECT_DELAYS_MS[attempt] ?? 2000;
    attempt += 1;
    reconnectTimer = setTimeout(() => openSocket(true), delay);
  };

  // Kick off: POST /company/start, then open the socket.
  setStatus("starting");
  fetch(`${API_BASE_URL}/company/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`start returned ${response.status}`);
      }
      const body = (await response.json()) as { run_id: string };
      runId = body.run_id;
      openSocket(false);
    })
    .catch((err) => {
      onFallback(
        `POST /company/start failed: ${err instanceof Error ? err.message : String(err)}`
      );
      closed = true;
      setStatus("failed");
    });

  return {
    close: () => {
      closed = true;
      closeSocket();
      setStatus("closed");
    },
    runId: () => runId,
  };
}
