"use client";

import { motion } from "framer-motion";
import { GitBranch } from "lucide-react";
import type { TimelineEvent } from "@/lib/orchestration-types";
import { cn } from "@/lib/utils";
import { PanelShell } from "@/components/forgeos/panel-shell";

const statusStyles = {
  complete: {
    dot: "border-accent-green bg-accent-green",
    line: "bg-accent-green/40",
    text: "text-accent-green",
  },
  active: {
    dot: "border-blueprint bg-blueprint",
    line: "bg-blueprint/30",
    text: "text-blueprint",
  },
  pending: {
    dot: "border-border bg-muted",
    line: "bg-border/50",
    text: "text-muted-foreground",
  },
} as const;

type TimelinePanelProps = {
  events: TimelineEvent[];
  hasStarted: boolean;
};

export function TimelinePanel({ events, hasStarted }: TimelinePanelProps) {
  return (
    <PanelShell
      title="Timeline"
      subtitle="Project phase tracker"
      icon={<GitBranch className="size-3.5" strokeWidth={1.75} />}
      fixedHeight
    >
      {!hasStarted ? (
        <div className="rounded-md border border-dashed border-blueprint/20 bg-blueprint/5 px-3 py-6 text-center">
          <p className="font-mono text-[10px] tracking-wider text-blueprint/70 uppercase">
            Timeline will populate on launch
          </p>
        </div>
      ) : (
        <ol className="relative space-y-0">
          {events.map((item, index) => {
            const styles = statusStyles[item.status];
            const isLast = index === events.length - 1;

            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                {!isLast && (
                  <span
                    className={cn(
                      "absolute top-5 left-[7px] h-[calc(100%-12px)] w-px",
                      styles.line
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 mt-1 size-3.5 shrink-0 rounded-full border-2",
                    styles.dot,
                    item.status === "active" && "animate-pulse"
                  )}
                />
                <div className="min-w-0 pt-0">
                  <div className="flex items-center gap-2">
                    <p className={cn("font-mono text-xs font-medium uppercase", styles.text)}>
                      {item.phase}
                    </p>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {item.timestamp}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.label}</p>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </PanelShell>
  );
}
