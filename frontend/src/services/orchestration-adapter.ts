/**
 * services/orchestration-adapter.ts
 *
 * Pure functions that map backend types (services/api.ts) into the existing
 * client-side OrchestrationState shape used by every dashboard component. No
 * HTTP, no timers -- this is where translation lives, and only here.
 *
 * Why this file exists: the components' prop shapes are already good. Rather
 * than change any panel, we adapt the backend's events into the exact same
 * ActivityEntry / TimelineEvent / Deliverable / AIEmployee shapes.
 */

import { AI_EMPLOYEES, type AIEmployee } from "@/lib/constants";
import type {
  Deliverable,
  GeneratedCodeBundle,
  OrchestrationState,
  TimelineEvent,
} from "@/lib/orchestration-types";
import type {
  MissionControlMessage,
  MissionControlMessageKind,
} from "@/lib/mission-control-types";
import type {
  BackendAgentState,
  BackendCompanyRunResult,
  BackendOrchestrationEvent,
  BackendReviewOutcome,
  BackendTask,
} from "@/services/api";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatRelativeTime(pastIso: string, now: number): string {
  const past = new Date(pastIso).getTime();
  const seconds = Math.max(0, Math.floor((now - past) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

/** Map a backend AgentState to the sidebar's simpler {active, idle, offline}. */
function toEmployeeStatus(state: BackendAgentState): AIEmployee["status"] {
  switch (state) {
    case "working":
    case "reviewing":
      return "active";
    case "waiting":
    case "blocked":
    case "idle":
      return "idle";
    case "complete":
      // Preserve "idle" so completed employees don't grey out entirely; they've
      // done work and should still read as part of the crew.
      return "idle";
    default:
      return "offline";
  }
}

/** Extract a string field from an unknown payload record. */
function pickString(
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

/** Extract a number field from an unknown payload record. */
function pickNumber(
  payload: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

// ---------- Mission Control message helpers ---------------------------------

/** Look up a display name for a role via the reducer context. */
function resolveAgent(
  role: string,
  ctx: ReducerContext
): { name: string; initials: string } {
  const found = ctx.agentsByRole.get(role);
  if (found) return { name: found.name, initials: found.initials };
  if (role === "*") return { name: "All hands", initials: "**" };
  if (role === "system") return { name: "ForgeOS", initials: "FO" };
  // Fall back to the role itself + first two letters, so unknown roles still
  // render cleanly instead of showing empty avatars.
  return {
    name: role,
    initials: role.slice(0, 2).toUpperCase(),
  };
}

function formatClockLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Map a review's target label to the corresponding deliverable title. See
 * ``buildReducerContext`` for why this alias exists.
 */
const REVIEW_TARGET_TO_DELIVERABLE: Record<string, string> = {
  Implementation: "API Spec",
};

function reviewTargetToDeliverable(target: string): string {
  return REVIEW_TARGET_TO_DELIVERABLE[target] ?? target;
}

/**
 * Build a MissionControlMessage from a backend event of any inter-agent kind.
 * Returns null if the event isn't a conversation event.
 */
function buildMissionControlMessage(
  event: BackendOrchestrationEvent,
  ctx: ReducerContext
): MissionControlMessage | null {
  const { payload } = event;

  let senderRole: string | undefined;
  let recipientRole: string | undefined;
  let content: string | undefined;
  let kind: MissionControlMessageKind = "message";

  switch (event.type) {
    case "agent_message": {
      senderRole = pickString(payload, "from");
      recipientRole = pickString(payload, "to");
      content = pickString(payload, "content");
      if (recipientRole === "*") kind = "broadcast";
      break;
    }
    case "review_requested": {
      senderRole = pickString(payload, "requester");
      recipientRole = pickString(payload, "reviewer");
      const target = pickString(payload, "target") ?? "artifact";
      content = `Please review '${target}'.`;
      kind = "review_request";
      break;
    }
    case "review_approved": {
      senderRole = pickString(payload, "reviewer") ?? event.actor ?? undefined;
      recipientRole = pickString(payload, "owner");
      const target = pickString(payload, "target") ?? "artifact";
      const comments = pickString(payload, "comments") ?? "";
      content = `Approved '${target}'.${comments ? ` ${comments}` : ""}`.trim();
      kind = "approval";
      break;
    }
    case "review_rejected": {
      senderRole = pickString(payload, "reviewer") ?? event.actor ?? undefined;
      recipientRole = pickString(payload, "owner");
      const target = pickString(payload, "target") ?? "artifact";
      const comments = pickString(payload, "comments") ?? "";
      content = `Rejected '${target}': ${comments}`.trim();
      kind = "rejection";
      break;
    }
    case "escalated": {
      senderRole = pickString(payload, "by") ?? event.actor ?? undefined;
      recipientRole = "CEO";
      const reason = pickString(payload, "reason") ?? "escalation";
      content = `Escalation: ${reason}`;
      kind = "escalation";
      break;
    }
    default:
      return null;
  }

  if (!senderRole || !recipientRole || !content) return null;

  const sender = resolveAgent(senderRole, ctx);
  const recipient = resolveAgent(recipientRole, ctx);
  return {
    id: `mcm-${event.seq}`,
    senderRole,
    senderName: sender.name,
    senderInitials: sender.initials,
    recipientRole,
    recipientName: recipient.name,
    timestamp: formatClockLocal(event.timestamp),
    timestampIso: event.timestamp,
    content,
    kind,
    status: "delivered",
  };
}

/**
 * Whenever a sender emits a message, mark all *earlier* messages that were
 * addressed to them (as recipient) as "seen" -- the acknowledgement pattern
 * everyone recognises from Slack read receipts.
 */
function markMessagesSeenBySender(
  prev: MissionControlMessage[],
  senderRole: string
): MissionControlMessage[] {
  let changed = false;
  const next = prev.map((m) => {
    if (m.recipientRole === senderRole && m.status !== "seen") {
      changed = true;
      return { ...m, status: "seen" as const };
    }
    return m;
  });
  return changed ? next : prev;
}

// -----------------------------------------------------------------------------
// State factory
// -----------------------------------------------------------------------------

export function createEmptyStreamedState(projectIdea: string): OrchestrationState {
  return {
    isRunning: true,
    isComplete: false,
    progress: 0,
    projectIdea,
    employees: AI_EMPLOYEES.map((e) => ({ ...e, status: "offline" as const })),
    activities: [
      {
        id: "activity-init",
        agent: "ForgeOS",
        action: `Project queued: "${projectIdea.slice(0, 60)}${
          projectIdea.length > 60 ? "…" : ""
        }"`,
        time: "just now",
      },
    ],
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

// -----------------------------------------------------------------------------
// Event -> state reducer
// -----------------------------------------------------------------------------

type ReducerContext = {
  /** Total number of events in the run, for computing progress. */
  totalEvents: number;
  /** Backend agents keyed by role, so we can resolve id/initials/name. */
  agentsByRole: Map<string, { id: string; name: string; initials: string }>;
  /** Backend tasks keyed by title, for artifact enrichment. */
  tasksByTitle: Map<string, BackendTask>;
  /**
   * Latest review outcome by (target, revision). For lookup by target only,
   * use ``latestReviewByTarget``.
   */
  latestReviewByTarget: Map<string, BackendReviewOutcome>;
};

/**
 * Fold one backend event into the existing OrchestrationState. Pure -- returns
 * a new state; never mutates. Also appends a MissionControlMessage when the
 * event is agent-to-agent (message, review request/approve/reject, escalation).
 */
export function applyBackendEvent(
  prev: OrchestrationState,
  event: BackendOrchestrationEvent,
  ctx: ReducerContext
): OrchestrationState {
  const next = applyBackendEventInner(prev, event, ctx);
  const message = buildMissionControlMessage(event, ctx);
  if (!message) return next;
  const seenUpdated = markMessagesSeenBySender(
    next.missionControlMessages,
    message.senderRole
  );
  // Append -- never overwrite. Mission control is a strictly growing log.
  return {
    ...next,
    missionControlMessages: [...seenUpdated, message],
  };
}

function applyBackendEventInner(
  prev: OrchestrationState,
  event: BackendOrchestrationEvent,
  ctx: ReducerContext
): OrchestrationState {
  const progress = Math.min(
    100,
    Math.round((event.seq / Math.max(1, ctx.totalEvents)) * 100)
  );

  switch (event.type) {
    case "run_started":
      return { ...prev, progress, startedAt: event.timestamp };

    case "memory_seeded": {
      // Backend seeded past-project context onto the shared blackboard;
      // capture a UI-friendly snapshot for the reasoning drawer to display.
      const payload = event.payload as Record<string, unknown>;
      const similarRaw = Array.isArray(payload.similar_projects)
        ? (payload.similar_projects as Array<Record<string, unknown>>)
        : [];
      const preferredRaw = Array.isArray(payload.preferred_technologies)
        ? (payload.preferred_technologies as Array<Record<string, unknown>>)
        : [];
      const similarProjects = similarRaw.map((s) => ({
        project: String(s.project ?? ""),
        score: typeof s.score === "number" ? s.score : 0,
        companyName:
          typeof s.company_name === "string" ? s.company_name : undefined,
        technologies: Array.isArray(s.technologies)
          ? (s.technologies as string[])
          : undefined,
      }));
      const preferredTechnologies = preferredRaw
        .map((t) => ({
          name: String(t.name ?? ""),
          uses: typeof t.uses === "number" ? t.uses : 0,
        }))
        .filter((t) => t.name);
      return {
        ...prev,
        progress,
        memoryContext: {
          similarProjects,
          preferredTechnologies,
          pastMistakesCount:
            typeof payload.past_mistakes_count === "number"
              ? payload.past_mistakes_count
              : 0,
          pastSecurityIssuesCount:
            typeof payload.past_security_issues_count === "number"
              ? payload.past_security_issues_count
              : 0,
        },
      };
    }

    case "plan_created": {
      const summary = pickString(event.payload, "summary");
      const company = pickString(event.payload, "company_name");
      // Extract the deep plan object if present. Backends emit the full plan
      // under "plan" as part of the payload; be defensive about missing keys.
      const rawPlan = (event.payload as Record<string, unknown>).plan as
        | Record<string, unknown>
        | undefined;
      const stackList =
        rawPlan && Array.isArray(rawPlan.recommended_stack)
          ? (rawPlan.recommended_stack as unknown[])
              .filter((x): x is string => typeof x === "string")
          : undefined;
      const metricsList =
        rawPlan && Array.isArray(rawPlan.success_metrics)
          ? (rawPlan.success_metrics as unknown[])
              .filter((x): x is string => typeof x === "string")
          : undefined;
      const projectPlan: NonNullable<OrchestrationState["projectPlan"]> = {
        companyName:
          company ??
          (typeof rawPlan?.company_name === "string"
            ? (rawPlan.company_name as string)
            : undefined),
        mission:
          typeof rawPlan?.mission === "string"
            ? (rawPlan.mission as string)
            : undefined,
        vision:
          pickString(event.payload, "vision") ??
          (typeof rawPlan?.vision === "string"
            ? (rawPlan.vision as string)
            : undefined),
        recommendedStack: stackList,
        successMetrics: metricsList,
        planSource:
          rawPlan?.plan_source === "llm" || rawPlan?.plan_source === "deterministic"
            ? (rawPlan.plan_source as "llm" | "deterministic")
            : undefined,
      };
      if (!summary && !company) {
        // Even without an activity row, we still want the plan snapshot.
        return { ...prev, progress, projectPlan };
      }
      const action = company
        ? `Chartered ${company}${summary ? ` -- ${summary}` : ""}`
        : summary!;
      return {
        ...prev,
        progress,
        projectPlan,
        activities: [
          {
            id: `activity-plan-${event.seq}`,
            agent: event.actor ?? "CEO",
            action,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
      };
    }

    case "agent_state_changed": {
      const role = pickString(event.payload, "role");
      const status = pickString(event.payload, "status") as
        | BackendAgentState
        | undefined;
      if (!role || !status) return { ...prev, progress };
      const employeeInfo = ctx.agentsByRole.get(role);
      const nextStatus = toEmployeeStatus(status);

      // Accumulate per-agent time-in-state. Any state other than "idle" or
      // "offline" counts as active (working, reviewing, waiting, blocked
      // all mean the agent is engaged with the run). We close the *previous*
      // interval when the new event arrives.
      const priorAccount = prev.agentTime[role];
      const nowMs = new Date(event.timestamp).getTime();
      let addedMs = 0;
      if (priorAccount && priorAccount.lastChangeAt) {
        const priorMs = new Date(priorAccount.lastChangeAt).getTime();
        const priorStatus = priorAccount.lastStatus;
        const wasActive =
          priorStatus === "working" ||
          priorStatus === "reviewing" ||
          priorStatus === "waiting" ||
          priorStatus === "blocked";
        if (wasActive && Number.isFinite(nowMs) && nowMs > priorMs) {
          addedMs = nowMs - priorMs;
        }
      }
      const nextAccount: NonNullable<OrchestrationState["agentTime"][string]> = {
        activeMs: (priorAccount?.activeMs ?? 0) + addedMs,
        lastStatus: status,
        lastChangeAt: event.timestamp,
      };

      return {
        ...prev,
        progress,
        employees: prev.employees.map((e) =>
          e.id === employeeInfo?.id || e.role === role
            ? { ...e, status: nextStatus, rawState: status }
            : e
        ),
        agentTime: { ...prev.agentTime, [role]: nextAccount },
      };
    }

    case "task_started": {
      const title = pickString(event.payload, "title");
      const actor = event.actor;
      if (!title || !actor) return { ...prev, progress };
      return {
        ...prev,
        progress,
        activities: [
          {
            id: `activity-start-${event.seq}`,
            agent: actor,
            action: `Started ${title}`,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
      };
    }

    case "code_bundle_generated": {
      // Engineer produced a starter code bundle via the LLM. The showcase
      // will render these files instead of its templated placeholders.
      const payload = event.payload as Record<string, unknown>;
      const filesRaw = Array.isArray(payload.files)
        ? (payload.files as Array<Record<string, unknown>>)
        : [];
      const files = filesRaw
        .map((f) => ({
          path: typeof f.path === "string" ? f.path : "",
          language: typeof f.language === "string" ? f.language : "text",
          content: typeof f.content === "string" ? f.content : "",
        }))
        .filter((f) => f.path && f.content.length >= 20);
      if (files.length === 0) return { ...prev, progress };
      const sourceRaw = payload.source;
      const source: GeneratedCodeBundle["source"] =
        sourceRaw === "llm" || sourceRaw === "hybrid" || sourceRaw === "deterministic"
          ? sourceRaw
          : "llm";
      return {
        ...prev,
        progress,
        codeBundle: { files, source },
      };
    }

    case "artifact_token": {
      const title = pickString(event.payload, "title");
      const delta = pickString(event.payload, "delta");
      if (!title || !delta) return { ...prev, progress };
      const ownerRole = pickString(event.payload, "owner_role");
      const existing = prev.deliverables.find((d) => d.title === title);
      if (existing) {
        // Append to whatever trace has accumulated so far.
        const deliverables = prev.deliverables.map((d) =>
          d.title === title
            ? { ...d, reasoningTrace: (d.reasoningTrace ?? "") + delta }
            : d
        );
        return { ...prev, progress, deliverables };
      }
      // Deliverable card hasn't materialised yet: stub it so the trace has a
      // home. It will get enriched with content/type on artifact_produced.
      return {
        ...prev,
        progress,
        deliverables: [
          ...prev.deliverables,
          {
            id: `deliverable-${title}`,
            title,
            type: "Document",
            progress: 100,
            ownerRole,
            reasoningTrace: delta,
          },
        ],
      };
    }

    case "artifact_produced": {
      const title = pickString(event.payload, "title");
      const type = pickString(event.payload, "type") ?? "Document";
      if (!title) return { ...prev, progress };
      // Enrich from the batch when we have it (REST mode). In live mode the
      // batch is empty, so we fall back to the event payload which now carries
      // the full content and owner_role.
      const task = ctx.tasksByTitle.get(title);
      const content =
        task?.artifact?.content ?? pickString(event.payload, "content");
      const ownerRole =
        task?.owner_role ?? pickString(event.payload, "owner_role");
      const eventRevision = pickNumber(event.payload, "revision");
      const revision =
        eventRevision !== undefined
          ? eventRevision
          : (task?.revision ?? 0);
      const review = ctx.latestReviewByTarget.get(title);
      // If a review exists, only mark it approved/rejected if that review
      // covers this revision or an earlier one (i.e. it applies).
      let approvalStatus: Deliverable["approvalStatus"];
      let approvedBy: string | undefined;
      if (review && review.revision <= revision) {
        approvalStatus = review.verdict === "approved" ? "approved" : "rejected";
        approvedBy = review.reviewer;
      } else {
        // Deliverables that don't undergo review still exist (PRD, Deployment
        // Plan). Default to "not_reviewed" so the UI shows an honest label.
        approvalStatus = "not_reviewed";
      }
      const enrich: Partial<Deliverable> = {
        type,
        progress: 100,
        content,
        ownerRole,
        revision,
        updatedAt: event.timestamp,
        approvalStatus,
        approvedBy,
      };
      const existing = prev.deliverables.find((d) => d.title === title);
      const deliverables: Deliverable[] = existing
        ? prev.deliverables.map((d) =>
            d.title === title ? { ...d, ...enrich } : d
          )
        : [
            ...prev.deliverables,
            {
              id: `deliverable-${title}`,
              title,
              type,
              progress: 100,
              ...enrich,
            } as Deliverable,
          ];
      return { ...prev, progress, deliverables };
    }

    case "task_completed": {
      const actor = event.actor;
      if (!actor) return { ...prev, progress };
      return {
        ...prev,
        progress,
        activities: [
          {
            id: `activity-done-${event.seq}`,
            agent: actor,
            action: "Task complete -- handing off",
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
      };
    }

    case "agent_message": {
      const from = pickString(event.payload, "from") ?? "system";
      const to = pickString(event.payload, "to") ?? "*";
      const content = pickString(event.payload, "content") ?? "";
      const label = to === "*" ? "everyone" : to;
      return {
        ...prev,
        progress,
        activities: [
          {
            id: `activity-msg-${event.seq}`,
            agent: from,
            action: `${label}: ${content}`,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
      };
    }

    case "review_requested": {
      const target = pickString(event.payload, "target") ?? "artifact";
      const reviewer = pickString(event.payload, "reviewer") ?? "reviewer";
      return {
        ...prev,
        progress,
        timelineEvents: promoteActiveToComplete([
          ...prev.timelineEvents,
          {
            id: `timeline-review-${event.seq}`,
            phase: "Review",
            label: `${reviewer} reviewing ${target}`,
            timestamp: formatClockTime(event.timestamp),
            status: "active",
          },
        ]),
      };
    }

    case "review_approved": {
      const target = pickString(event.payload, "target") ?? "artifact";
      const deliverableTitle = reviewTargetToDeliverable(target);
      const reviewer = pickString(event.payload, "reviewer") ?? event.actor ?? "reviewer";
      // Reflect approval on the matching deliverable if we have one.
      const deliverables = prev.deliverables.map((d) =>
        d.title === deliverableTitle
          ? { ...d, approvalStatus: "approved" as const, approvedBy: reviewer }
          : d
      );
      return {
        ...prev,
        progress,
        deliverables,
        activities: [
          {
            id: `activity-approve-${event.seq}`,
            agent: reviewer,
            action: `Approved ${target}`,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
        timelineEvents: promoteActiveToComplete([
          ...prev.timelineEvents,
          {
            id: `timeline-approved-${event.seq}`,
            phase: "Approved",
            label: `${target} approved`,
            timestamp: formatClockTime(event.timestamp),
            status: "active",
          },
        ]),
      };
    }

    case "review_rejected": {
      const target = pickString(event.payload, "target") ?? "artifact";
      const deliverableTitle = reviewTargetToDeliverable(target);
      const reviewer = pickString(event.payload, "reviewer") ?? event.actor ?? "reviewer";
      const comments = pickString(event.payload, "comments") ?? "";
      const deliverables = prev.deliverables.map((d) =>
        d.title === deliverableTitle
          ? { ...d, approvalStatus: "rejected" as const, approvedBy: reviewer }
          : d
      );
      return {
        ...prev,
        progress,
        deliverables,
        activities: [
          {
            id: `activity-reject-${event.seq}`,
            agent: reviewer,
            action: `Rejected ${target}${comments ? `: ${comments}` : ""}`,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
        timelineEvents: promoteActiveToComplete([
          ...prev.timelineEvents,
          {
            id: `timeline-rejected-${event.seq}`,
            phase: "Revision",
            label: `${target} rejected, revising`,
            timestamp: formatClockTime(event.timestamp),
            status: "active",
          },
        ]),
      };
    }

    case "revision_requested": {
      const target = pickString(event.payload, "target") ?? "artifact";
      const revision = pickNumber(event.payload, "revision") ?? 1;
      // Bounce the matching deliverable back to in-progress so its bar re-fills.
      return {
        ...prev,
        progress,
        deliverables: prev.deliverables.map((d) =>
          d.title === target ? { ...d, progress: 40 } : d
        ),
        activities: [
          {
            id: `activity-revise-${event.seq}`,
            agent: event.actor ?? "engineer",
            action: `Revising ${target} (rev ${revision})`,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
      };
    }

    case "escalated": {
      const reason = pickString(event.payload, "reason") ?? "escalation";
      return {
        ...prev,
        progress,
        activities: [
          {
            id: `activity-escalate-${event.seq}`,
            agent: event.actor ?? "system",
            action: `Escalated to CEO: ${reason}`,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
      };
    }

    case "project_published": {
      const summary = pickString(event.payload, "summary") ?? "Project published";
      return {
        ...prev,
        progress,
        releaseSummary: { text: summary, timestamp: event.timestamp },
        activities: [
          {
            id: `activity-publish-${event.seq}`,
            agent: event.actor ?? "CEO",
            action: summary,
            time: formatRelativeTime(event.timestamp, Date.now()),
          },
          ...prev.activities,
        ],
        timelineEvents: promoteActiveToComplete([
          ...prev.timelineEvents,
          {
            id: `timeline-publish-${event.seq}`,
            phase: "Complete",
            label: "Project published",
            timestamp: formatClockTime(event.timestamp),
            status: "active",
          },
        ]),
      };
    }

    case "run_completed": {
      const nowMs = new Date(event.timestamp).getTime();
      const closedAgentTime: OrchestrationState["agentTime"] = {};
      for (const [role, account] of Object.entries(prev.agentTime)) {
        let addedMs = 0;
        if (account.lastChangeAt) {
          const priorMs = new Date(account.lastChangeAt).getTime();
          const wasActive =
            account.lastStatus === "working" ||
            account.lastStatus === "reviewing" ||
            account.lastStatus === "waiting" ||
            account.lastStatus === "blocked";
          if (wasActive && Number.isFinite(nowMs) && nowMs > priorMs) {
            addedMs = nowMs - priorMs;
          }
        }
        closedAgentTime[role] = {
          activeMs: account.activeMs + addedMs,
          lastStatus: "complete",
          lastChangeAt: event.timestamp,
        };
      }
      return {
        ...prev,
        isRunning: false,
        isComplete: true,
        progress: 100,
        completedAt: event.timestamp,
        employees: prev.employees.map((e) =>
          e.status === "active" ? { ...e, status: "idle" as const } : e
        ),
        timelineEvents: prev.timelineEvents.map((e) =>
          e.status === "active" ? { ...e, status: "complete" as const } : e
        ),
        agentTime: closedAgentTime,
      };
    }

    // Events we deliberately don't visualise (they'd add noise to the panels).
    case "task_created":
    case "task_assigned":
    default:
      return { ...prev, progress };
  }
}

function promoteActiveToComplete(events: TimelineEvent[]): TimelineEvent[] {
  // When a new active event lands, promote earlier active ones to complete.
  // Keep the LAST one active (the new one), everything prior becomes complete.
  const lastActiveIdx = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].status === "active") return i;
    }
    return -1;
  })();
  if (lastActiveIdx < 0) return events;
  return events.map((e, i) =>
    e.status === "active" && i !== lastActiveIdx
      ? { ...e, status: "complete" as const }
      : e
  );
}

// -----------------------------------------------------------------------------
// Context builder
// -----------------------------------------------------------------------------

export function buildReducerContext(
  result: BackendCompanyRunResult
): ReducerContext {  const byRole = new Map<string, { id: string; name: string; initials: string }>();
  for (const employee of AI_EMPLOYEES) {
    byRole.set(employee.role, {
      id: employee.id,
      name: employee.name,
      initials: employee.initials,
    });
  }
  // Any backend-only roles get synthesised entries (no-op for the current roster
  // but future-proofs adding a 7th agent on the backend).
  for (const agent of result.agents) {
    if (!byRole.has(agent.role)) {
      byRole.set(agent.role, {
        id: `runtime-${agent.role}`,
        name: agent.name,
        initials: agent.name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2),
      });
    }
  }

  const tasksByTitle = new Map<string, BackendTask>();
  for (const task of result.tasks) tasksByTitle.set(task.title, task);

  // Some reviews target labels that don't match a deliverable title exactly:
  // the backend labels QA's review as "Implementation" but the deliverable it
  // actually gates is the "API Spec". Alias here so the UI shows the right
  // approval state on the right card.
  const REVIEW_TARGET_ALIASES: Record<string, string> = {
    Implementation: "API Spec",
  };

  const latestReviewByTarget = new Map<string, BackendReviewOutcome>();
  for (const review of result.reviews) {
    const target = REVIEW_TARGET_ALIASES[review.target] ?? review.target;
    // Reviews are appended in order; keep the LAST one per target so we surface
    // the final verdict rather than an earlier rejection.
    latestReviewByTarget.set(target, review);
  }

  return {
    totalEvents: Math.max(1, result.events.length),
    agentsByRole: byRole,
    tasksByTitle,
    latestReviewByTarget,
  };
}

/**
 * Build a minimal reducer context for LIVE STREAMING mode.
 *
 * In live mode we don't have the completed run upfront: tasks and reviews are
 * still being computed. The adapter has been extended to read ``content`` and
 * ``owner_role`` directly off ``artifact_produced`` payloads when the batch
 * ``tasksByTitle`` map is empty, and to update approval state from
 * ``review_approved``/``review_rejected`` events as they arrive. This helper
 * seeds an empty context, plus an estimated total event count to drive
 * progress. Tune ``estimatedEventCount`` based on typical run sizes; the value
 * is only used for progress display and is corrected once ``run_completed``
 * fires.
 */
export function buildLiveContext(
  estimatedEventCount = 60
): ReducerContext {
  const byRole = new Map<string, { id: string; name: string; initials: string }>();
  for (const employee of AI_EMPLOYEES) {
    byRole.set(employee.role, {
      id: employee.id,
      name: employee.name,
      initials: employee.initials,
    });
  }
  return {
    totalEvents: Math.max(1, estimatedEventCount),
    agentsByRole: byRole,
    tasksByTitle: new Map(),
    latestReviewByTarget: new Map(),
  };
}
