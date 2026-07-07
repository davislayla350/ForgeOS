"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type OrchestrationProgressProps = {
  progress: number;
  isRunning: boolean;
  isComplete: boolean;
};

export function OrchestrationProgress({
  progress,
  isRunning,
  isComplete,
}: OrchestrationProgressProps) {
  if (!isRunning && !isComplete) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative z-10 border-b border-border/40 bg-card/30 px-4 py-3 backdrop-blur-sm sm:px-6"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 rounded-full",
              isComplete ? "bg-accent-green" : "animate-pulse bg-blueprint"
            )}
          />
          <span className="font-mono text-[11px] tracking-wider text-foreground uppercase">
            {isComplete ? "Orchestration complete" : "Orchestrating project workflow"}
          </span>
        </div>
        <span className="font-mono text-xs text-blueprint tabular-nums">{progress}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
        <motion.div
          className="h-full rounded-full bg-blueprint"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.15, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}
