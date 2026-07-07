"use client";

/**
 * IntelligencePanel
 * =================
 *
 * A live executive-command-center-style dashboard that reads from the same
 * ``OrchestrationState`` the rest of the dashboard consumes and derives
 * seven top-level metrics plus a per-agent utilization row.
 *
 * The tiles are intentionally dense: a Bloomberg-terminal-adjacent feel,
 * not a flashy hero. Every number is computed by ``computeCompanyMetrics``
 * in ``lib/intelligence-metrics.ts`` — nothing here is hand-tuned or
 * hallucinated. Tooltips on each tile print the formula.
 *
 * Numbers animate by tweening the *displayed* value toward the true value
 * whenever the true value changes. This is the "ticker" feel the executive
 * dashboard aesthetic asks for: a metric doesn't snap from 72 to 96, it
 * runs the intermediate integers over ~500 ms.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Braces,
  Clock,
  FileCheck2,
  Gauge,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Zap,
} from "lucide-react";
import type { OrchestrationState } from "@/lib/orchestration-types";
import {
  computeCompanyMetrics,
  type CompanyMetrics,
  type RiskLevel,
} from "@/lib/intelligence-metrics";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

/**
 * Tween the displayed number toward ``target`` over ``duration`` ms.
 * Cancels prior tweens on target change so rapid updates don't queue.
 */
function useAnimatedNumber(target: number, duration = 500): number {
  const [displayed, setDisplayed] = useState<number>(target);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(target);
  const startRef = useRef<number>(0);

  useEffect(() => {
    // No change: nothing to animate.
    if (Math.round(displayed) === Math.round(target)) {
      setDisplayed(target);
      return;
    }
    fromRef.current = displayed;
    startRef.current = performance.now();
    const from = fromRef.current;
    const start = startRef.current;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Cubic ease-out: fast start, gentle finish.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setDisplayed(next);
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return displayed;
}

// ---------------------------------------------------------------------------
// Tile primitives
// ---------------------------------------------------------------------------

type TileProps = {
  title: string;
  value: React.ReactNode;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  subline?: string;
  accent?: "blueprint" | "emerald" | "amber" | "rose";
  formula?: string;
};

const ACCENT: Record<NonNullable<TileProps["accent"]>, { border: string; text: string; bg: string }> = {
  blueprint: {
    border: "border-blueprint/30",
    text: "text-blueprint",
    bg: "bg-blueprint/5",
  },
  emerald: {
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    bg: "bg-emerald-500/5",
  },
  amber: {
    border: "border-amber-500/30",
    text: "text-amber-400",
    bg: "bg-amber-500/5",
  },
  rose: {
    border: "border-rose-500/30",
    text: "text-rose-400",
    bg: "bg-rose-500/5",
  },
};

function Tile({ title, value, Icon, subline, accent = "blueprint", formula }: TileProps) {
  const style = ACCENT[accent];
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-background/40 p-3",
        style.border
      )}
      title={formula}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3", style.text)} strokeWidth={1.75} />
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
          {title}
        </p>
      </div>
      <p
        className={cn(
          "font-mono text-2xl font-medium tabular-nums leading-tight",
          style.text
        )}
      >
        {value}
      </p>
      {subline && (
        <p className="font-mono text-[9px] tracking-wider text-muted-foreground">
          {subline}
        </p>
      )}
    </div>
  );
}

function PercentTile({
  title,
  percent,
  Icon,
  subline,
  accent,
  formula,
}: {
  title: string;
  percent: number;
  Icon: TileProps["Icon"];
  subline?: string;
  accent?: TileProps["accent"];
  formula?: string;
}) {
  const displayed = useAnimatedNumber(percent);
  const rounded = Math.round(displayed);
  return (
    <Tile
      title={title}
      Icon={Icon}
      accent={accent}
      subline={subline}
      formula={formula}
      value={
        <span>
          {rounded}
          <span className="text-sm font-normal opacity-70">%</span>
        </span>
      }
    />
  );
}

function CountTile({
  title,
  value,
  Icon,
  subline,
  accent,
  formula,
}: {
  title: string;
  value: number;
  Icon: TileProps["Icon"];
  subline?: string;
  accent?: TileProps["accent"];
  formula?: string;
}) {
  const displayed = useAnimatedNumber(value, 350);
  return (
    <Tile
      title={title}
      Icon={Icon}
      accent={accent}
      subline={subline}
      formula={formula}
      value={<span>{Math.round(displayed)}</span>}
    />
  );
}

// ---------------------------------------------------------------------------
// Risk tile (labelled, not percent)
// ---------------------------------------------------------------------------

const RISK_STYLE: Record<RiskLevel, { accent: TileProps["accent"]; Icon: TileProps["Icon"]; label: string }> = {
  low: { accent: "emerald", Icon: ShieldCheck, label: "Low" },
  medium: { accent: "amber", Icon: ShieldAlert, label: "Medium" },
  high: { accent: "rose", Icon: ShieldX, label: "High" },
};

function SecurityRiskTile({ risk }: { risk: RiskLevel }) {
  const style = RISK_STYLE[risk];
  return (
    <Tile
      title="Security Risk"
      Icon={style.Icon}
      accent={style.accent}
      subline="STRIDE-derived"
      formula={
        "low = 0 rejections from Security. medium = 1. high = 2+."
      }
      value={<span>{style.label}</span>}
    />
  );
}

// ---------------------------------------------------------------------------
// Agent utilization row
// ---------------------------------------------------------------------------

/** Order agents by their canonical run order. */
const AGENT_ORDER = ["CEO", "Product Manager", "Engineer", "Security", "QA", "DevOps"] as const;

/** Shorten role names for the compact bar row. */
const SHORT_NAME: Record<string, string> = {
  CEO: "CEO",
  "Product Manager": "PM",
  Engineer: "Engineer",
  Security: "Security",
  QA: "QA",
  DevOps: "DevOps",
};

function AgentUtilizationRow({
  utilization,
}: {
  utilization: Record<string, number>;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <BarChart3 className="size-3 text-blueprint" strokeWidth={1.75} />
        <p className="font-mono text-[9px] tracking-widest text-blueprint uppercase">
          Agent Utilization
        </p>
      </div>
      <ul className="space-y-1.5">
        {AGENT_ORDER.map((role) => {
          const pct = utilization[role] ?? 0;
          return <UtilizationBar key={role} label={SHORT_NAME[role]} percent={pct} />;
        })}
      </ul>
    </div>
  );
}

function UtilizationBar({ label, percent }: { label: string; percent: number }) {
  const displayed = useAnimatedNumber(percent, 600);
  const rounded = Math.round(displayed);
  return (
    <li className="grid grid-cols-[64px_1fr_36px] items-center gap-2">
      <span className="truncate font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="h-2 overflow-hidden rounded-full border border-border/40 bg-background/60">
        <motion.div
          animate={{ width: `${Math.max(2, displayed)}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "h-full rounded-full",
            rounded >= 60
              ? "bg-blueprint"
              : rounded >= 30
              ? "bg-blueprint/70"
              : "bg-blueprint/50"
          )}
        />
      </div>
      <span className="text-right font-mono text-[10px] tabular-nums text-foreground">
        {rounded}%
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type IntelligencePanelProps = {
  state: OrchestrationState;
  hasStarted: boolean;
};

export function IntelligencePanel({ state, hasStarted }: IntelligencePanelProps) {
  // Recompute every render. If the run is live, force a re-render every
  // 500ms so the elapsed-time-dependent metrics (engineering velocity,
  // agent utilization) update smoothly. We do this with a tiny state
  // counter tied to a setInterval.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!state.isRunning) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [state.isRunning]);

  const metrics: CompanyMetrics = useMemo(
    () => computeCompanyMetrics(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, tick]
  );

  if (!hasStarted) return null;

  const elapsedLabel = formatElapsed(metrics.elapsedSeconds);

  // Colour cues for headline metrics.
  const healthAccent: TileProps["accent"] =
    metrics.companyHealth >= 80
      ? "emerald"
      : metrics.companyHealth >= 60
      ? "amber"
      : "rose";
  const velocityAccent: TileProps["accent"] =
    metrics.engineeringVelocity >= 80
      ? "emerald"
      : metrics.engineeringVelocity >= 50
      ? "amber"
      : "rose";
  const testsAccent: TileProps["accent"] =
    metrics.testsPassing >= 90 ? "emerald" : metrics.testsPassing >= 70 ? "amber" : "rose";
  const confidenceAccent: TileProps["accent"] =
    metrics.deploymentConfidence >= 80
      ? "emerald"
      : metrics.deploymentConfidence >= 60
      ? "amber"
      : "rose";

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-blueprint/40 bg-card/60 backdrop-blur-sm"
      aria-labelledby="intelligence-heading"
    >
      {/* Blueprint corner mark + live pill */}
      <div className="pointer-events-none absolute top-2 left-3 font-mono text-[9px] tracking-[0.28em] text-blueprint/60 uppercase">
        Intelligence · Executive View
      </div>

      <div className="flex items-center justify-between border-b border-border/40 px-6 pt-7 pb-3">
        <div>
          <h2
            id="intelligence-heading"
            className="font-mono text-sm tracking-tight text-foreground"
          >
            Company Intelligence
          </h2>
          <p className="mt-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
            Live metrics · derived from orchestration state
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/40 px-2 py-0.5">
          <Clock className="size-3 text-blueprint" strokeWidth={1.75} />
          <span className="font-mono text-[10px] tabular-nums text-foreground">
            {elapsedLabel}
          </span>
          {state.isRunning && (
            <span className="ml-1 flex items-center gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-mono text-[9px] tracking-widest text-emerald-400 uppercase">
                Live
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Grid: 5 headline tiles + 2 counters */}
      <div className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <PercentTile
          title="Company Health"
          percent={metrics.companyHealth}
          Icon={Activity}
          subline="First-pass approval rate"
          accent={healthAccent}
          formula="approvals / (approvals + rejections) * 100"
        />
        <PercentTile
          title="Engineering Velocity"
          percent={metrics.engineeringVelocity}
          Icon={Zap}
          subline={`${metrics.artifactsProduced} artifacts / ${elapsedLabel}`}
          accent={velocityAccent}
          formula="(artifacts / (elapsed / 60)) / 6 target * 100"
        />
        <SecurityRiskTile risk={metrics.securityRisk} />
        <PercentTile
          title="Tests Passing"
          percent={metrics.testsPassing}
          Icon={FileCheck2}
          subline="approval rate across all reviews"
          accent={testsAccent}
          formula="approvals / (approvals + rejections) * 100"
        />
        <PercentTile
          title="Deployment Confidence"
          percent={metrics.deploymentConfidence}
          Icon={Gauge}
          subline="composite of health, tests, risk"
          accent={confidenceAccent}
          formula="0.4 * health + 0.3 * tests + 0.3 * inverse_risk"
        />

        <CountTile
          title="Messages Exchanged"
          value={metrics.messagesExchanged}
          Icon={MessageSquare}
          subline="inter-agent transmissions"
        />
        <CountTile
          title="Artifacts Produced"
          value={metrics.artifactsProduced}
          Icon={Braces}
          subline="deliverables shipped"
        />
      </div>

      {/* Agent utilization row */}
      <div className="border-t border-border/40 px-6 py-4">
        <AgentUtilizationRow utilization={metrics.agentUtilization} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Elapsed-time formatter
// ---------------------------------------------------------------------------

function formatElapsed(seconds: number): string {
  if (seconds < 1) return "0s";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
