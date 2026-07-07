"use client";

// post-devops cinematic overlay before product reveal
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Package,
  Rocket,
  Terminal,
  Upload,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Phases + timing
// ---------------------------------------------------------------------------

export type DeploymentPhase =
  | "idle"
  | "deploying"
  | "tests"
  | "packaging"
  | "uploading"
  | "complete"
  | "done";

/** Duration each phase holds (ms). Total ~4.4s, plus 200ms fade-out. */
const PHASE_MS: Partial<Record<DeploymentPhase, number>> = {
  deploying: 700,
  tests: 1100,
  packaging: 900,
  uploading: 900,
  complete: 800,
};

const PHASES_IN_ORDER: DeploymentPhase[] = [
  "deploying",
  "tests",
  "packaging",
  "uploading",
  "complete",
];

// ---------------------------------------------------------------------------
// Scripted terminal output
// ---------------------------------------------------------------------------

/**
 * Terminal lines shown during the ``tests`` phase. Realistic pytest-style
 * output with fake but plausible timings. All lines pre-scripted; there is
 * no test runner here.
 */
const TERMINAL_LINES: Array<{ text: string; kind: "info" | "ok" | "meta" }> = [
  { text: "$ ci run --pipeline release", kind: "info" },
  { text: "collecting  test_orchestrator.py  (12 tests)", kind: "meta" },
  { text: "collecting  test_agents.py         (18 tests)", kind: "meta" },
  { text: "collecting  test_memory.py         ( 9 tests)", kind: "meta" },
  { text: "PASS  test_orchestrator.py::test_full_run  (312 ms)", kind: "ok" },
  { text: "PASS  test_agents.py::test_engineer_review  (188 ms)", kind: "ok" },
  { text: "PASS  test_memory.py::test_similar_projects  ( 44 ms)", kind: "ok" },
  { text: "PASS  39 passed  0 failed  0 skipped", kind: "ok" },
];

// ---------------------------------------------------------------------------
// Presentational overlay
// ---------------------------------------------------------------------------

type DeploymentSequenceProps = {
  phase: DeploymentPhase;
  productName: string;
};

export function DeploymentSequence({ phase, productName }: DeploymentSequenceProps) {
  const visible = phase !== "idle" && phase !== "done";

  // Position in the ordered phase list, used to drive progress + lights.
  const phaseIndex = useMemo(() => {
    const i = PHASES_IN_ORDER.indexOf(phase);
    return i < 0 ? 0 : i;
  }, [phase]);

  const percentComplete = useMemo(() => {
    if (phase === "complete") return 100;
    // Each phase gets equal weight in the bar.
    const perStep = 100 / PHASES_IN_ORDER.length;
    return Math.min(100, Math.round((phaseIndex + 1) * perStep));
  }, [phase, phaseIndex]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="deployment-sequence"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 backdrop-blur-md"
          aria-live="polite"
          aria-label="Deployment in progress"
        >
          {/* Blueprint grid backdrop for atmosphere */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(to right, oklch(0.72 0.11 210) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.72 0.11 210) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />

          <motion.div
            initial={{ scale: 0.98, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-[min(94vw,720px)] overflow-hidden rounded-lg border border-blueprint/40 bg-card/90 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <Rocket className="size-3.5 text-blueprint" strokeWidth={1.75} />
                <span className="font-mono text-[10px] tracking-[0.28em] text-blueprint uppercase">
                  Deployment Pipeline
                </span>
              </div>
              <PhaseLabel phase={phase} />
            </div>

            {/* Company network mini-pulse */}
            <NetworkPulse activeIndex={phaseIndex} />

            {/* Status lights row */}
            <StatusLights phase={phase} />

            {/* Progress bar */}
            <div className="px-5 py-3">
              <div className="mb-1 flex items-center justify-between font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                <span>Progress</span>
                <span className="tabular-nums text-blueprint">
                  {percentComplete}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full border border-border/40 bg-background/40">
                <motion.div
                  animate={{ width: `${percentComplete}%` }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-blueprint/60 to-blueprint"
                />
              </div>
            </div>

            {/* Terminal */}
            <TerminalPane phase={phase} />

            {/* Footer / CEO announcement on complete */}
            <AnimatePresence>
              {phase === "complete" && (
                <motion.div
                  key="ceo-line"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="border-t border-emerald-500/30 bg-emerald-500/5 px-5 py-3"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className="size-4 text-emerald-400"
                      strokeWidth={1.75}
                    />
                    <span className="font-mono text-[10px] tracking-[0.28em] text-emerald-400 uppercase">
                      Deployment Complete
                    </span>
                  </div>
                  <p className="mt-1.5 pl-6 font-mono text-xs leading-relaxed text-foreground">
                    <span className="text-blueprint">Aria Chen (CEO):</span>{" "}
                    &quot;The build is complete. {productName} is ready for review.&quot;
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Phase label (the header caption on the right)
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<DeploymentPhase, string> = {
  idle: "Idle",
  deploying: "Deploying...",
  tests: "Running Tests...",
  packaging: "Packaging...",
  uploading: "Uploading...",
  complete: "Deployment Complete",
  done: "",
};

function PhaseLabel({ phase }: { phase: DeploymentPhase }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={phase}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        className={cn(
          "font-mono text-xs tracking-tight tabular-nums",
          phase === "complete" ? "text-emerald-400" : "text-foreground"
        )}
      >
        {PHASE_LABEL[phase]}
      </motion.span>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Status lights (one per phase)
// ---------------------------------------------------------------------------

const LIGHT_ROW: Array<{ phase: DeploymentPhase; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { phase: "deploying", label: "Deploy", Icon: Rocket },
  { phase: "tests", label: "Tests", Icon: Wrench },
  { phase: "packaging", label: "Package", Icon: Package },
  { phase: "uploading", label: "Upload", Icon: Upload },
];

function StatusLights({ phase }: { phase: DeploymentPhase }) {
  const currentIdx = PHASES_IN_ORDER.indexOf(phase);
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-background/30 px-5 py-3">
      {LIGHT_ROW.map((light, i) => {
        const state =
          currentIdx > i ? "done" : currentIdx === i ? "active" : "pending";
        return (
          <div key={light.phase} className="flex flex-1 items-center gap-2">
            <div className="relative">
              <motion.span
                animate={
                  state === "active"
                    ? { scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }
                    : { scale: 1, opacity: 1 }
                }
                transition={
                  state === "active"
                    ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
                    : {}
                }
                className={cn(
                  "flex size-6 items-center justify-center rounded-md border",
                  state === "done"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : state === "active"
                    ? "border-blueprint/60 bg-blueprint/15 text-blueprint"
                    : "border-border/40 bg-background/40 text-muted-foreground"
                )}
              >
                {state === "done" ? (
                  <CheckCircle2 className="size-3" strokeWidth={2} />
                ) : (
                  <light.Icon className="size-3" strokeWidth={1.75} />
                )}
              </motion.span>
            </div>
            <span
              className={cn(
                "font-mono text-[9px] tracking-widest uppercase",
                state === "done"
                  ? "text-emerald-400"
                  : state === "active"
                  ? "text-blueprint"
                  : "text-muted-foreground/70"
              )}
            >
              {light.label}
            </span>
            {i < LIGHT_ROW.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1 transition-colors duration-300",
                  state === "done"
                    ? "bg-emerald-500/40"
                    : state === "active"
                    ? "bg-blueprint/40"
                    : "bg-border/40"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal pane (progressive line reveal)
// ---------------------------------------------------------------------------

function TerminalPane({ phase }: { phase: DeploymentPhase }) {
  const [revealed, setRevealed] = useState<number>(0);

  // Progressively reveal terminal lines during the "tests" phase; hold the
  // full log during subsequent phases. Reset to 0 whenever the sequence
  // hasn't reached the tests phase yet.
  useEffect(() => {
    if (phase === "idle" || phase === "deploying") {
      setRevealed(0);
      return;
    }
    if (phase !== "tests") {
      setRevealed(TERMINAL_LINES.length);
      return;
    }
    // Tests phase runs for PHASE_MS.tests ms; spread the lines over it.
    const testsDuration = PHASE_MS.tests ?? 1100;
    const perLine = testsDuration / TERMINAL_LINES.length;
    setRevealed(0);
    const timers: number[] = [];
    for (let i = 1; i <= TERMINAL_LINES.length; i++) {
      const id = window.setTimeout(() => setRevealed(i), i * perLine * 0.9);
      timers.push(id);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [phase]);

  return (
    <div className="border-b border-border/40 bg-black/70 px-5 py-3">
      <div className="mb-1 flex items-center gap-2">
        <Terminal className="size-3 text-blueprint/70" strokeWidth={1.75} />
        <span className="font-mono text-[9px] tracking-widest text-blueprint/70 uppercase">
          ci.forgeos.log
        </span>
      </div>
      <div
        className="h-24 overflow-hidden font-mono text-[11px] leading-relaxed"
        role="log"
      >
        {TERMINAL_LINES.slice(0, revealed).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.14 }}
            className={cn(
              "whitespace-pre",
              line.kind === "ok"
                ? "text-emerald-400"
                : line.kind === "info"
                ? "text-blueprint"
                : "text-muted-foreground"
            )}
          >
            {line.text}
          </motion.div>
        ))}
        {revealed < TERMINAL_LINES.length && phase === "tests" && (
          <motion.span
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
            className="inline-block font-mono text-blueprint"
          >
            _
          </motion.span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Network mini-pulse (6 nodes, one edge highlight per phase)
// ---------------------------------------------------------------------------

const NETWORK_NODES = [
  { role: "CEO", initials: "AC" },
  { role: "PM", initials: "EV" },
  { role: "Eng", initials: "MW" },
  { role: "Sec", initials: "IN" },
  { role: "QA", initials: "TP" },
  { role: "Ops", initials: "DR" },
];

function NetworkPulse({ activeIndex }: { activeIndex: number }) {
  // Six nodes in a row; the active edge lights up progressively.
  return (
    <div className="border-b border-border/40 bg-background/20 px-5 py-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
        <span>Company network</span>
        <span className="tabular-nums text-blueprint/70">
          {NETWORK_NODES.length} nodes
        </span>
      </div>
      <div className="flex items-center justify-between gap-1">
        {NETWORK_NODES.map((node, i) => {
          const isActive = i === activeIndex + 1; // one node ahead of phase
          const isPast = i <= activeIndex;
          return (
            <div key={node.role} className="flex flex-1 items-center gap-1">
              <motion.div
                animate={
                  isActive
                    ? {
                        boxShadow: [
                          "0 0 0 0 oklch(0.72 0.11 210 / 0)",
                          "0 0 0 6px oklch(0.72 0.11 210 / 0.3)",
                          "0 0 0 0 oklch(0.72 0.11 210 / 0)",
                        ],
                      }
                    : {}
                }
                transition={
                  isActive
                    ? { repeat: Infinity, duration: 1.4, ease: "easeInOut" }
                    : {}
                }
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[9px]",
                  isPast || isActive
                    ? "border-blueprint/60 bg-blueprint/15 text-blueprint"
                    : "border-border/40 bg-background/40 text-muted-foreground"
                )}
                title={node.role}
              >
                {node.initials}
              </motion.div>
              {i < NETWORK_NODES.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 transition-colors duration-500",
                    isPast
                      ? "bg-blueprint/50"
                      : "bg-border/40"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Hook: useDeploymentSequence
// ===========================================================================

export type DeploymentSequenceState = {
  phase: DeploymentPhase;
  /** True after the sequence has run to completion at least once. */
  finished: boolean;
};

export const initialDeploymentSequenceState: DeploymentSequenceState = {
  phase: "idle",
  finished: false,
};

/**
 * Runs the deployment sequence on demand. Caller invokes ``start()`` when
 * DevOps completes. Once the sequence finishes it sets ``finished`` so the
 * dashboard can gate the Product Showcase reveal on both the backend
 * ``isComplete`` flag AND the sequence being played.
 *
 * Guaranteed single-run per orchestration cycle: additional ``start()``
 * calls while the sequence is playing are ignored. To play the sequence
 * again (e.g. after a new run) call ``reset()``.
 */
export function useDeploymentSequence(): {
  state: DeploymentSequenceState;
  start: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<DeploymentSequenceState>(
    initialDeploymentSequenceState
  );
  const runningRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  const clearTimeouts = useCallback(() => {
    for (const t of timeoutsRef.current) window.clearTimeout(t);
    timeoutsRef.current = [];
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    if (state.finished) return; // already done for this cycle
    runningRef.current = true;

    // Schedule the phase transitions in a single forward chain.
    let cumulative = 0;
    const enqueue = (phase: DeploymentPhase, delayMs: number) => {
      const id = window.setTimeout(() => {
        setState((prev) => ({ ...prev, phase }));
      }, delayMs);
      timeoutsRef.current.push(id);
    };

    for (const phase of PHASES_IN_ORDER) {
      enqueue(phase, cumulative);
      cumulative += PHASE_MS[phase] ?? 0;
    }
    // Terminal: dismiss and mark finished.
    const terminalId = window.setTimeout(() => {
      setState({ phase: "done", finished: true });
      runningRef.current = false;
    }, cumulative + 200);
    timeoutsRef.current.push(terminalId);
  }, [state.finished]);

  const reset = useCallback(() => {
    clearTimeouts();
    runningRef.current = false;
    setState(initialDeploymentSequenceState);
  }, [clearTimeouts]);

  // Cleanup on unmount.
  useEffect(() => clearTimeouts, [clearTimeouts]);

  return { state, start, reset };
}
