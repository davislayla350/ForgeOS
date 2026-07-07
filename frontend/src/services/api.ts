/**
 * services/api.ts
 *
 * Frontend service layer for the ForgeOS backend. This is the ONLY file that
 * knows about HTTP: everything downstream (hooks, adapters, components) works
 * against the typed backend shapes exported from here.
 *
 * The backend is defined by app/services/company_orchestrator.py and its
 * response is CompanyRunResult from app/models/company.py. The types below
 * mirror that contract exactly.
 */

// -----------------------------------------------------------------------------
// Backend contract types (mirror app/models/company.py + app/models/domain.py)
// -----------------------------------------------------------------------------

export type BackendEventType =
  | "run_started"
  | "memory_seeded"
  | "plan_created"
  | "artifact_token"
  | "code_bundle_generated"
  | "task_created"
  | "task_assigned"
  | "task_started"
  | "artifact_produced"
  | "task_completed"
  | "agent_state_changed"
  | "agent_message"
  | "run_completed"
  | "review_requested"
  | "review_approved"
  | "review_rejected"
  | "revision_requested"
  | "escalated"
  | "project_published";

export type BackendAgentState =
  | "idle"
  | "working"
  | "waiting"
  | "reviewing"
  | "blocked"
  | "complete";

export type BackendReviewVerdict = "approved" | "rejected";

export type BackendOrchestrationEvent = {
  seq: number;
  type: BackendEventType;
  /** ISO 8601 UTC timestamp string. */
  timestamp: string;
  actor: string | null;
  payload: Record<string, unknown>;
};

export type BackendTask = {
  id: string;
  title: string;
  type: string;
  owner_role: string;
  phase: string;
  depends_on: string[];
  status: "pending" | "running" | "completed";
  revision: number;
  artifact: BackendArtifact | null;
};

export type BackendArtifact = {
  title: string;
  type: string;
  owner_role: string;
  content: string;
};

export type BackendAgentRuntimeState = {
  role: string;
  name: string;
  status: BackendAgentState;
  current_task: string | null;
  completed_tasks: string[];
};

export type BackendAgentMessage = {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  timestamp: string;
};

export type BackendReviewOutcome = {
  reviewer: string;
  target: string;
  verdict: BackendReviewVerdict;
  comments: string;
  issues: string[];
  revision: number;
  source: "llm" | "deterministic";
};

export type BackendProjectPlan = {
  company_name: string;
  mission: string;
  vision: string;
  summary: string;
  plan_source: "llm" | "deterministic";
  // The plan has more fields; the dashboard doesn't need them so they're loose.
  [key: string]: unknown;
};

export type BackendCompanyRunResult = {
  run_id: string;
  project: string;
  plan: BackendProjectPlan;
  tasks: BackendTask[];
  agents: BackendAgentRuntimeState[];
  messages: BackendAgentMessage[];
  reviews: BackendReviewOutcome[];
  events: BackendOrchestrationEvent[];
};

// -----------------------------------------------------------------------------
// HTTP client
// -----------------------------------------------------------------------------

/**
 * Base URL for the backend. Overridable at build time via
 * NEXT_PUBLIC_FORGEOS_API_URL; defaults to the local dev backend.
 */
export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_FORGEOS_API_URL ?? "http://localhost:8000";

/** Distinct error class so callers can tell "backend down" from other errors. */
export class BackendUnavailableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    /** HTTP status when the backend responded (e.g. 429), else undefined. */
    public readonly status?: number
  ) {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

/**
 * Translate a launch failure into copy safe to show end users. Keeps raw
 * network/error details out of the UI (they still go to the console).
 */
export function friendlyLaunchError(err: unknown): string {
  if (err instanceof BackendUnavailableError) {
    if (err.status === 429) {
      return "The demo request limit was reached. Please wait a minute and launch again.";
    }
    if (err.status !== undefined && err.status >= 500) {
      return "ForgeOS hit a temporary problem generating this run. Please try again shortly.";
    }
    return "ForgeOS could not reach its backend. The demo may be waking up or offline. Please try again in a moment.";
  }
  return "Something unexpected went wrong launching this run. Please try again.";
}

type LaunchCompanyOptions = {
  /** AbortSignal to cancel the request. */
  signal?: AbortSignal;
  /** Milliseconds before the request is aborted. Defaults to 30_000. */
  timeoutMs?: number;
};

/**
 * POST /company/launch: run the multi-agent orchestration to completion and
 * return the full result. Throws BackendUnavailableError on network failure or
 * non-2xx, so callers can fall back to the deterministic client-side script.
 */
export async function launchCompany(
  project: string,
  { signal, timeoutMs = 30_000 }: LaunchCompanyOptions = {}
): Promise<BackendCompanyRunResult> {
  const controller = new AbortController();
  const linked = linkSignals(controller, signal);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/company/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new BackendUnavailableError(
        `Backend returned ${response.status} ${response.statusText}.`,
        undefined,
        response.status
      );
    }

    return (await response.json()) as BackendCompanyRunResult;
  } catch (err) {
    if (err instanceof BackendUnavailableError) throw err;
    throw new BackendUnavailableError(
      err instanceof Error ? err.message : "Failed to reach backend.",
      err
    );
  } finally {
    clearTimeout(timer);
    linked?.();
  }
}

/** Wires an external AbortSignal into a local AbortController. */
function linkSignals(
  controller: AbortController,
  external?: AbortSignal
): (() => void) | undefined {
  if (!external) return undefined;
  if (external.aborted) {
    controller.abort();
    return undefined;
  }
  const onAbort = () => controller.abort();
  external.addEventListener("abort", onAbort);
  return () => external.removeEventListener("abort", onAbort);
}
