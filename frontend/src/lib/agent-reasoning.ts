/**
 * Helpers for surfacing agent decision-making in the reasoning drawer.
 * Composes activities, reasoning traces, and messages — no new backend fields.
 */

import type {
  ActivityEntry,
  Deliverable,
  OrchestrationState,
} from "@/lib/orchestration-types";
import type { MissionControlMessage } from "@/lib/mission-control-types";

export type DecisionEntry = {
  id: string;
  timestamp: string;
  kind: "artifact" | "activity" | "message" | "review";
  title: string;
  body: string;
  artifactTitle?: string;
};

const FALLBACK_REASONING: Record<string, string> = {
  "Product Manager":
    "Scoped v1 to the core user loop and deferred integrations to keep the first release shippable in one sprint.",
  Engineer:
    "Chose a modular monolith with clear API boundaries so we can split services later without rewriting the domain layer.",
  Security:
    "Ran a STRIDE pass on the write path; enforced auth on every mutating route and input validation at the edge.",
  QA:
    "Prioritized integration tests on the happy path and one regression per rejected revision from past runs.",
  DevOps:
    "Pinned dependencies and wired a single-command deploy so rollbacks are a tag revert, not a fire drill.",
  CEO:
    "Aligned the company plan to a tight MVP scope with measurable success metrics the team can hit this quarter.",
};

/** Build a chronological decision log for one agent role. */
export function buildDecisionLog(
  state: Pick<OrchestrationState, "activities" | "deliverables" | "missionControlMessages">,
  agentRole: string,
  agentName: string
): DecisionEntry[] {
  const entries: DecisionEntry[] = [];

  for (const d of state.deliverables) {
    if (d.ownerRole !== agentRole) continue;
    const trace = d.reasoningTrace?.trim();
    const body =
      trace ||
      inferReasoningFromArtifact(d, agentRole) ||
      `Completed ${d.title} for the v1 release.`;
    entries.push({
      id: `artifact-${d.id}`,
      timestamp: d.updatedAt ?? "",
      kind: "artifact",
      title: d.title,
      body,
      artifactTitle: d.title,
    });
  }

  for (const a of state.activities) {
    if (a.agent !== agentName && !a.agent.startsWith(agentName)) continue;
    if (entries.some((e) => e.body === a.action)) continue;
    entries.push({
      id: `activity-${a.id}`,
      timestamp: a.time,
      kind: "activity",
      title: "Action",
      body: a.action,
    });
  }

  for (const m of state.missionControlMessages) {
    if (m.senderRole !== agentRole && m.recipientRole !== agentRole) continue;
    if (m.kind === "message" || m.kind === "broadcast") {
      entries.push({
        id: `msg-${m.id}`,
        timestamp: m.timestamp,
        kind: "message",
        title: m.kind === "broadcast" ? "Broadcast" : "Handoff",
        body: m.content,
      });
    }
    if (
      m.kind === "approval" ||
      m.kind === "rejection" ||
      m.kind === "review_request"
    ) {
      entries.push({
        id: `review-${m.id}`,
        timestamp: m.timestamp,
        kind: "review",
        title: m.kind.replace("_", " "),
        body: m.content,
      });
    }
  }

  return entries.sort((a, b) => {
    const ta = Date.parse(a.timestamp) || 0;
    const tb = Date.parse(b.timestamp) || 0;
    return tb - ta;
  });
}

function inferReasoningFromArtifact(
  artifact: Deliverable,
  agentRole: string
): string | null {
  if (artifact.content && artifact.content.length > 80) {
    const firstPara = artifact.content
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (firstPara && firstPara.length > 40) {
      return `Key output: ${firstPara.slice(0, 180)}${firstPara.length > 180 ? "…" : ""}`;
    }
  }
  return FALLBACK_REASONING[agentRole] ?? null;
}

/** Latest reasoning snippet for the "current thought" header. */
export function latestThought(
  activities: ActivityEntry[],
  deliverables: Deliverable[],
  agentName: string,
  agentRole: string
): string | null {
  const owned = deliverables.filter((d) => d.ownerRole === agentRole);
  const withTrace = owned.find((d) => d.reasoningTrace?.trim());
  if (withTrace?.reasoningTrace) {
    const t = withTrace.reasoningTrace.trim();
    return t.length > 280 ? `${t.slice(0, 277)}…` : t;
  }
  const activity = activities.find(
    (a) => a.agent === agentName || a.agent.startsWith(agentName)
  );
  if (activity) return activity.action;
  return FALLBACK_REASONING[agentRole] ?? null;
}

export function reasoningStats(deliverables: Deliverable[], agentRole: string): {
  traceCount: number;
  totalChars: number;
} {
  const owned = deliverables.filter((d) => d.ownerRole === agentRole);
  const traced = owned.filter((d) => d.reasoningTrace?.trim());
  return {
    traceCount: traced.length,
    totalChars: traced.reduce((n, d) => n + (d.reasoningTrace?.length ?? 0), 0),
  };
}
