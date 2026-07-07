"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity } from "lucide-react";
import type { ActivityEntry } from "@/lib/orchestration-types";
import { Badge } from "@/components/ui/badge";
import { PanelShell } from "@/components/forgeos/panel-shell";

type LiveActivityPanelProps = {
  activities: ActivityEntry[];
  isRunning: boolean;
  hasStarted: boolean;
};

export function LiveActivityPanel({
  activities,
  isRunning,
  hasStarted,
}: LiveActivityPanelProps) {
  return (
    <PanelShell
      title="Live Activity"
      subtitle="Real-time agent operations"
      icon={<Activity className="size-3.5" strokeWidth={1.75} />}
      badge={
        <Badge
          variant="outline"
          className={`h-5 border-accent-green/30 bg-accent-green/10 font-mono text-[10px] text-accent-green ${
            isRunning ? "animate-pulse" : ""
          }`}
        >
          {isRunning ? "LIVE" : hasStarted ? "IDLE" : "STANDBY"}
        </Badge>
      }
      fixedHeight
    >
      <ul className="space-y-3">
        <AnimatePresence initial={false} mode="popLayout">
          {activities.map((item) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, x: -12, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="group flex items-start gap-3 overflow-hidden rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border/40 hover:bg-muted/20"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blueprint" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{item.agent}</span>
                  <span className="text-muted-foreground"> — {item.action}</span>
                </p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {item.time}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {!hasStarted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-md border border-dashed border-blueprint/20 bg-blueprint/5 px-3 py-2 text-center"
        >
          <p className="font-mono text-[10px] tracking-wider text-blueprint/70 uppercase">
            Awaiting company launch
          </p>
        </motion.div>
      )}
    </PanelShell>
  );
}
