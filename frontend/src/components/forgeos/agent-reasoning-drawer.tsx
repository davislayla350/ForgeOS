"use client";

/**
 * AgentReasoningDrawer
 * ====================
 *
 * A slide-in inspector for a single agent. Everything the backend knows about
 * what this agent is thinking, doing, remembering, saying, and shipping.
 *
 * Sections (each empty gracefully if the run hasn't hit that state yet):
 *   1. Current thought  -- last activity row where this agent is the actor.
 *   2. Current task     -- derived from agent status + latest task event.
 *   3. Memory context   -- what this agent knows about past runs (shared).
 *   4. Conversations    -- inter-agent messages this agent sent or received.
 *   5. Artifacts        -- deliverables owned by this agent.
 *
 * Design notes
 * ------------
 * All data is pulled from the same OrchestrationState the rest of the
 * dashboard reads. Zero new backend fields. The point is inspection, not
 * duplication: this drawer is the "here's what that agent is up to" view.
 *
 * The panel uses Base UI's Dialog primitive (already installed for the
 * Artifact Center) rather than a custom drawer, for correct focus trap,
 * escape handling, and accessibility.
 */

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog } from "@base-ui/react/dialog";
import {
  Brain,
  Circle,
  ClipboardList,
  FileText,
  History,
  MessageSquare,
  User,
  X,
} from "lucide-react";
import type { AIEmployee } from "@/lib/constants";
import type {
  ActivityEntry,
  Deliverable,
  MemoryContext,
  OrchestrationState,
} from "@/lib/orchestration-types";
import type { MissionControlMessage } from "@/lib/mission-control-types";
import {
  buildDecisionLog,
  latestThought,
  reasoningStats,
  type DecisionEntry,
} from "@/lib/agent-reasoning";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MarkdownView } from "@/components/forgeos/markdown-view";

// ---------------------------------------------------------------------------
// Status styling shared with the sidebar
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<
  AIEmployee["status"],
  { label: string; dotClass: string; textClass: string }
> = {
  offline: {
    label: "Offline",
    dotClass: "bg-muted-foreground/40",
    textClass: "text-muted-foreground",
  },
  idle: {
    label: "Idle",
    dotClass: "bg-muted-foreground/60",
    textClass: "text-muted-foreground",
  },
  active: {
    label: "Working",
    dotClass: "bg-blueprint animate-pulse",
    textClass: "text-blueprint",
  },
  reviewing: {
    label: "Reviewing",
    dotClass: "bg-amber-400 animate-pulse",
    textClass: "text-amber-400",
  },
  waiting: {
    label: "Waiting",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
  },
  blocked: {
    label: "Blocked",
    dotClass: "bg-rose-400",
    textClass: "text-rose-400",
  },
  complete: {
    label: "Complete",
    dotClass: "bg-emerald-400",
    textClass: "text-emerald-400",
  },
} as const;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/** The activity row that represents this agent's most recent action. */
function latestActivity(
  activities: ActivityEntry[],
  agentName: string
): ActivityEntry | null {
  // Activities are stored newest-first; return the first that matches.
  return (
    activities.find(
      (a) => a.agent === agentName || a.agent.startsWith(agentName)
    ) ?? null
  );
}

/** Messages where the agent is sender or recipient, newest first. */
function conversationsFor(
  messages: MissionControlMessage[],
  agentRole: string
): MissionControlMessage[] {
  const conv = messages.filter(
    (m) => m.senderRole === agentRole || m.recipientRole === agentRole
  );
  // Messages arrive oldest-first in state; newest-first reads more naturally.
  return [...conv].reverse();
}

/** Deliverables owned by this agent. */
function artifactsFor(
  deliverables: Deliverable[],
  agentRole: string
): Deliverable[] {
  return deliverables.filter((d) => d.ownerRole === agentRole);
}

/** Human phrasing for the "current task" line. */
function currentTaskLine(employee: AIEmployee, ownedArtifacts: Deliverable[]): string {
  const inFlight = ownedArtifacts.find((a) => a.progress < 100);
  const done = ownedArtifacts.filter((a) => a.progress >= 100);
  switch (employee.status) {
    case "active":
      return inFlight
        ? `Producing ${inFlight.title}`
        : `Working on ${employee.role.toLowerCase()} responsibilities`;
    case "reviewing":
      return "Reviewing an incoming artifact";
    case "waiting":
      return "Waiting on a review outcome";
    case "blocked":
      return "Blocked pending revision";
    case "complete":
      return done.length > 0
        ? `Shipped ${done.length} artifact${done.length > 1 ? "s" : ""}`
        : "Work complete";
    case "idle":
    case "offline":
    default:
      return "Standby";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AgentReasoningDrawerProps = {
  employee: AIEmployee | null;
  state: OrchestrationState;
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

export function AgentReasoningDrawer({
  employee,
  state,
  open,
  onOpenChange,
}: AgentReasoningDrawerProps) {
  const conversations = useMemo(
    () => (employee ? conversationsFor(state.missionControlMessages, employee.role) : []),
    [employee, state.missionControlMessages]
  );

  const artifacts = useMemo(
    () => (employee ? artifactsFor(state.deliverables, employee.role) : []),
    [employee, state.deliverables]
  );

  const taskLine = useMemo(
    () => (employee ? currentTaskLine(employee, artifacts) : ""),
    [employee, artifacts]
  );

  const thought = useMemo(
    () =>
      employee
        ? latestThought(
            state.activities,
            state.deliverables,
            employee.name,
            employee.role
          )
        : null,
    [employee, state.activities, state.deliverables]
  );

  const decisionLog = useMemo(
    () =>
      employee
        ? buildDecisionLog(
            state,
            employee.role,
            employee.name
          ).slice(0, 12)
        : [],
    [employee, state]
  );

  const stats = useMemo(
    () => (employee ? reasoningStats(state.deliverables, employee.role) : null),
    [employee, state.deliverables]
  );

  if (!employee) return null;

  const status = STATUS_STYLES[employee.status];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          render={
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
            />
          }
        />
        <Dialog.Popup
          render={
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border/50 bg-card shadow-2xl sm:w-[440px]"
            />
          }
        >
          {/* Header */}
          <div className="relative shrink-0 border-b border-border/40 bg-card/80 px-5 pt-5 pb-4 backdrop-blur">
            <div className="pointer-events-none absolute top-2 left-3 font-mono text-[9px] tracking-[0.25em] text-blueprint/50 uppercase">
              Reasoning Panel
            </div>
            <div className="flex items-start gap-3 pt-2">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-blueprint/30 bg-blueprint/10 font-mono text-sm font-medium text-blueprint">
                {employee.initials}
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title
                  render={
                    <h2 className="truncate font-mono text-base font-medium tracking-tight text-foreground" />
                  }
                >
                  {employee.name}
                </Dialog.Title>
                <p className="mt-0.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {employee.role}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-border/40 bg-background/40 px-1.5 py-0.5">
                  <span className={cn("inline-block size-1.5 rounded-full", status.dotClass)} />
                  <span
                    className={cn(
                      "font-mono text-[9px] tracking-wider uppercase",
                      status.textClass
                    )}
                  >
                    {status.label}
                  </span>
                </div>
              </div>
              <Dialog.Close
                render={
                  <button
                    type="button"
                    aria-label="Close"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                }
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            <Section title="Current thought" Icon={Brain}>
              {thought ? (
                <p className="rounded-md border border-border/40 bg-background/40 px-3 py-2 text-sm leading-relaxed text-foreground">
                  {thought}
                </p>
              ) : (
                <EmptyLine label="No thoughts recorded yet" />
              )}
              {stats && stats.traceCount > 0 && (
                <p className="mt-2 font-mono text-[9px] tracking-widest text-blueprint/70 uppercase">
                  {stats.traceCount} reasoning trace
                  {stats.traceCount !== 1 ? "s" : ""} · {stats.totalChars} chars
                </p>
              )}
            </Section>

            <Section title="Current task" Icon={ClipboardList}>
              <p className="text-sm text-foreground">{taskLine}</p>
            </Section>

            <Section
              title={`Decision log (${decisionLog.length})`}
              Icon={Brain}
            >
              {decisionLog.length === 0 ? (
                <EmptyLine label="No decisions logged yet" />
              ) : (
                <ul className="space-y-2">
                  {decisionLog.map((entry) => (
                    <DecisionRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Memory context" Icon={History}>
              <MemoryContextSection context={state.memoryContext} />
            </Section>

            <Section
              title={`Conversations (${conversations.length})`}
              Icon={MessageSquare}
            >
              {conversations.length === 0 ? (
                <EmptyLine label="No inter-agent messages yet" />
              ) : (
                <ul className="space-y-2">
                  {conversations.slice(0, 8).map((m) => (
                    <ConversationRow
                      key={m.id}
                      message={m}
                      agentRole={employee.role}
                    />
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title={`Artifacts (${artifacts.length})`}
              Icon={FileText}
            >
              {artifacts.length === 0 ? (
                <EmptyLine label="No deliverables owned by this agent yet" />
              ) : (
                <ul className="space-y-2">
                  {artifacts.map((a) => (
                    <ArtifactRow key={a.id} artifact={a} />
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="size-3 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-[10px] tracking-widest text-blueprint uppercase">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70 uppercase">
      {label}
    </p>
  );
}

function DecisionRow({ entry }: { entry: DecisionEntry }) {
  const kindStyle: Record<string, string> = {
    artifact: "border-blueprint/30 bg-blueprint/10 text-blueprint",
    activity: "border-border/40 bg-background/40 text-muted-foreground",
    message: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    review: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  };
  return (
    <li className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-foreground">
          {entry.title}
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] tracking-widest uppercase",
            kindStyle[entry.kind] ?? kindStyle.activity
          )}
        >
          {entry.kind}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{entry.body}</p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Memory context
// ---------------------------------------------------------------------------

function MemoryContextSection({ context }: { context: MemoryContext | null }) {
  if (!context) {
    return <EmptyLine label="Memory not yet seeded" />;
  }
  const { similarProjects, preferredTechnologies, pastMistakesCount, pastSecurityIssuesCount } =
    context;
  return (
    <div className="space-y-3">
      {similarProjects.length > 0 ? (
        <div>
          <p className="mb-1 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
            Similar past projects
          </p>
          <ul className="space-y-1.5">
            {similarProjects.slice(0, 3).map((s, i) => (
              <li
                key={i}
                className="rounded border border-border/40 bg-background/40 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-foreground">
                    {s.project || "(untitled)"}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-blueprint">
                    {(s.score * 100).toFixed(0)}%
                  </span>
                </div>
                {s.technologies && s.technologies.length > 0 && (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {s.technologies.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyLine label="No prior projects similar to this one" />
      )}
      {preferredTechnologies.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
            Preferred stack
          </p>
          <div className="flex flex-wrap gap-1">
            {preferredTechnologies.slice(0, 8).map((t) => (
              <Badge
                key={t.name}
                variant="outline"
                className="h-5 border-blueprint/25 bg-blueprint/5 font-mono text-[9px] text-blueprint"
              >
                {t.name} × {t.uses}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-4 pt-1">
        <MemoryStat label="Past mistakes" value={pastMistakesCount} />
        <MemoryStat label="Security issues" value={pastSecurityIssuesCount} />
      </div>
    </div>
  );
}

function MemoryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation row
// ---------------------------------------------------------------------------

const KIND_STYLES: Record<
  MissionControlMessage["kind"],
  { badge: string; label: string }
> = {
  message: {
    badge: "border-blueprint/30 bg-blueprint/10 text-blueprint",
    label: "Message",
  },
  broadcast: {
    badge: "border-blueprint/30 bg-blueprint/10 text-blueprint",
    label: "Broadcast",
  },
  review_request: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    label: "Review",
  },
  approval: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    label: "Approved",
  },
  rejection: {
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    label: "Rejected",
  },
  escalation: {
    badge: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    label: "Escalated",
  },
};

function ConversationRow({
  message,
  agentRole,
}: {
  message: MissionControlMessage;
  agentRole: string;
}) {
  const outgoing = message.senderRole === agentRole;
  const style = KIND_STYLES[message.kind];
  const otherParty = outgoing ? message.recipientRole : message.senderRole;
  return (
    <li className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
          <User className="size-2.5" />
          {outgoing ? `to ${otherParty}` : `from ${otherParty}`}
        </span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase",
            style.badge
          )}
        >
          {style.label}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-foreground">{message.content}</p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Artifact row (compact; the full viewer lives in the Artifact Center)
// ---------------------------------------------------------------------------

function ArtifactRow({ artifact }: { artifact: Deliverable }) {
  const preview = artifact.content
    ? artifact.content.split("\n").slice(0, 2).join(" ").slice(0, 140)
    : "";
  const trace = artifact.reasoningTrace?.trim();
  return (
    <li className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {artifact.title}
        </span>
        <Badge
          variant="outline"
          className="h-5 shrink-0 border-blueprint/30 bg-blueprint/5 font-mono text-[9px] text-blueprint uppercase"
        >
          {artifact.type}
        </Badge>
      </div>
      {preview && (
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          {preview}
          {artifact.content && artifact.content.length > 140 ? "..." : ""}
        </p>
      )}
      {trace && (
        <div className="mt-2 border-l-2 border-blueprint/40 bg-blueprint/5 px-2 py-1.5">
          <p className="mb-0.5 font-mono text-[9px] tracking-widest text-blueprint/80 uppercase">
            Reasoning
          </p>
          <p className="text-xs leading-relaxed text-foreground">
            {trace}
          </p>
        </div>
      )}
      {typeof artifact.revision === "number" && artifact.revision > 0 && (
        <p className="mt-1 font-mono text-[9px] tracking-widest text-blueprint/70 uppercase">
          Rev. {String(artifact.revision).padStart(3, "0")}
        </p>
      )}
    </li>
  );
}

// AnimatePresence is imported but only used by the parent; keep the export
// footprint minimal and let Base UI's Dialog manage focus/escape.
export { AnimatePresence, MarkdownView };
