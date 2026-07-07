"use client";

// live run counters and completion overlay
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimation } from "framer-motion";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { OrchestrationState } from "@/lib/orchestration-types";
import type { MissionControlMessage } from "@/lib/mission-control-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PanelShell } from "@/components/forgeos/panel-shell";

// rough hours saved per deliverable type
const DELIVERABLE_HOUR_ESTIMATE: Record<string, number> = {
  Document: 6,
  Blueprint: 12,
  Technical: 8,
  Audit: 6,
  QA: 5,
  Ops: 4,
};
const DEFAULT_HOURS_PER_DELIVERABLE = 6;

export type RunStats = {
  tasksCompleted: number;
  messagesSent: number;
  reviewsPerformed: number;
  artifactsGenerated: number;
  hoursSaved: number;
};

export function computeRunStats(
  state: Pick<
    OrchestrationState,
    "deliverables" | "missionControlMessages" | "activities"
  >
): RunStats {
  const tasksCompleted = state.deliverables.filter(
    (d) => d.progress >= 100
  ).length;
  const messagesSent = state.missionControlMessages.length;
  const reviewsPerformed = state.missionControlMessages.filter(
    (m: MissionControlMessage) =>
      m.kind === "approval" ||
      m.kind === "rejection" ||
      m.kind === "review_request"
  ).length;
  const artifactsGenerated = state.deliverables.filter(
    (d) => d.content && d.content.trim().length > 0
  ).length;
  const hoursSaved = state.deliverables.reduce((sum, d) => {
    if (d.progress < 100) return sum;
    const perDeliv =
      DELIVERABLE_HOUR_ESTIMATE[d.type] ?? DEFAULT_HOURS_PER_DELIVERABLE;
    return sum + perDeliv;
  }, 0);
  return {
    tasksCompleted,
    messagesSent,
    reviewsPerformed,
    artifactsGenerated,
    hoursSaved,
  };
}

// ease-out counter for stat cells
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = display;
    startedAtRef.current = performance.now();
    let raf = 0;
    const duration = 380;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const rounded = Math.round(display);
  return (
    <span className="font-mono text-2xl font-light tabular-nums text-foreground">
      {rounded}
    </span>
  );
}

type RunStatsPanelProps = {
  stats: RunStats;
  hasStarted: boolean;
  isComplete: boolean;
};

export function RunStatsPanel({
  stats,
  hasStarted,
  isComplete,
}: RunStatsPanelProps) {
  return (
    <PanelShell
      title="Run Statistics"
      subtitle="Aggregated crew output"
      icon={<Sparkles className="size-3.5" strokeWidth={1.75} />}
      badge={
        <Badge
          variant="outline"
          className={cn(
            "h-5 border-blueprint/30 bg-blueprint/10 font-mono text-[10px] text-blueprint",
            isComplete && "border-accent-green/40 bg-accent-green/10 text-accent-green"
          )}
        >
          {isComplete ? "Complete" : hasStarted ? "Live" : "Standby"}
        </Badge>
      }
      className="min-h-[160px]"
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCell
          label="Tasks Completed"
          value={stats.tasksCompleted}
          Icon={ClipboardCheck}
        />
        <StatCell
          label="Messages Sent"
          value={stats.messagesSent}
          Icon={MessageSquare}
        />
        <StatCell
          label="Reviews Performed"
          value={stats.reviewsPerformed}
          Icon={ShieldCheck}
        />
        <StatCell
          label="Artifacts Generated"
          value={stats.artifactsGenerated}
          Icon={FileText}
        />
        <StatCell
          label="Time Saved (hrs)"
          value={stats.hoursSaved}
          Icon={Clock}
          hint="Estimated vs a manual team, based on standard per-deliverable hours."
        />
      </ul>
    </PanelShell>
  );
}

function StatCell({
  label,
  value,
  Icon,
  hint,
}: {
  label: string;
  value: number;
  Icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <li
      className="flex flex-col items-start gap-1 rounded-md border border-border/40 bg-card/40 px-3 py-2.5"
      title={hint}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3 text-blueprint" />
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <AnimatedNumber value={value} />
    </li>
  );
}

type CompletionCelebrationProps = {
  isComplete: boolean;
  stats: RunStats;
};

const CELEBRATION_HOLD_MS = 2600;

export function CompletionCelebration({
  isComplete,
  stats,
}: CompletionCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);
  const controls = useAnimation();

  useEffect(() => {
    if (isComplete && !shownRef.current) {
      shownRef.current = true;
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), CELEBRATION_HOLD_MS);
      return () => clearTimeout(timer);
    }
    if (!isComplete) {
      shownRef.current = false;
    }
  }, [isComplete]);

  // Restart the badge tick every time we show.
  useEffect(() => {
    if (!visible) return;
    controls.start({
      scale: [0.7, 1.08, 1],
      opacity: [0, 1, 1],
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    });
  }, [visible, controls]);

  // Memoise the summary so the numbers don't rerender inside the animation.
  const summary = useMemo(
    () =>
      `${stats.artifactsGenerated} artifacts \u00b7 ${stats.reviewsPerformed} reviews \u00b7 ${stats.messagesSent} messages`,
    [stats]
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="pointer-events-none fixed top-6 left-1/2 z-40 -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 rounded-full border border-accent-green/30 bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur-sm">
            <motion.span
              animate={controls}
              className="rounded-full border border-accent-green/40 bg-accent-green/10 p-1 text-accent-green"
            >
              <CheckCircle2 className="size-4" strokeWidth={1.8} />
            </motion.span>
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-[11px] tracking-[0.28em] text-accent-green uppercase">
                Dashboard Unlocked
              </span>
              <span className="mt-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                Full company view · {summary}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
