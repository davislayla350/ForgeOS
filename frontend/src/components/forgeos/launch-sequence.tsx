"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck } from "lucide-react";

const COUNTDOWN_START = 3;
const COUNTDOWN_STEP_MS = 700;
const ONLINE_HOLD_MS = 900;

type LaunchSequencePhase = "countdown" | "online" | "done";

type LaunchSequenceProps = {
  visible: boolean;
  phase: LaunchSequencePhase;
  countdown: number;
};

export function LaunchSequence({
  visible,
  phase,
  countdown,
}: LaunchSequenceProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="launch-sequence"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/85 backdrop-blur-sm"
        >
          {/* Very subtle scan line, a nod to the blueprint aesthetic */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              initial={{ y: "-100%" }}
              animate={{ y: "200%" }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-blueprint/[0.04] to-transparent"
            />
          </div>

          <div className="relative flex flex-col items-center gap-6">
            <AnimatePresence mode="wait">
              {phase === "countdown" && (
                <motion.div
                  key={`count-${countdown}`}
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center"
                >
                  <span className="font-mono text-[10px] tracking-[0.32em] text-blueprint/60 uppercase">
                    Initializing crew
                  </span>
                  <span className="mt-4 font-mono text-7xl font-light text-foreground tabular-nums sm:text-8xl">
                    {countdown}
                  </span>
                  <span className="mt-3 font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
                    Standby
                  </span>
                </motion.div>
              )}

              {phase === "online" && (
                <motion.div
                  key="online"
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center"
                >
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      delay: 0.05,
                      duration: 0.4,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="rounded-full border border-blueprint/40 bg-blueprint/10 p-3 text-blueprint"
                  >
                    <CircleCheck className="size-7" strokeWidth={1.5} />
                  </motion.span>
                  <motion.span
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                    className="mt-4 font-mono text-xs tracking-[0.32em] text-blueprint uppercase"
                  >
                    Company Online
                  </motion.span>
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.3 }}
                    className="mt-1.5 font-mono text-[10px] tracking-[0.28em] text-muted-foreground uppercase"
                  >
                    Six agents ready
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export type LaunchSequenceState = {
  visible: boolean;
  phase: LaunchSequencePhase;
  countdown: number;
};

export const initialLaunchSequenceState: LaunchSequenceState = {
  visible: false,
  phase: "countdown",
  countdown: COUNTDOWN_START,
};

// countdown hook; calls onLaunch when the sequence finishes
export function useLaunchSequence(onLaunch: () => void): {
  state: LaunchSequenceState;
  start: () => void;
} {
  const [state, setState] = useState<LaunchSequenceState>(
    initialLaunchSequenceState
  );
  const startRef = useRef(false);

  const start = () => {
    if (startRef.current) return;
    startRef.current = true;

    let count = COUNTDOWN_START;
    setState({ visible: true, phase: "countdown", countdown: count });

    const tickTimer = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(tickTimer);
        setState({ visible: true, phase: "online", countdown: 0 });
        setTimeout(() => {
          setState({ visible: false, phase: "done", countdown: 0 });
          startRef.current = false;
          onLaunch();
        }, ONLINE_HOLD_MS);
        return;
      }
      setState({ visible: true, phase: "countdown", countdown: count });
    }, COUNTDOWN_STEP_MS);
  };

  return { state, start };
}
