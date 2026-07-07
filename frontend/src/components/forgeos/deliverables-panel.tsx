"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Package } from "lucide-react";
import type { Deliverable } from "@/lib/orchestration-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PanelShell } from "@/components/forgeos/panel-shell";

type DeliverablesPanelProps = {
  deliverables: Deliverable[];
  hasStarted: boolean;
};

export function DeliverablesPanel({ deliverables, hasStarted }: DeliverablesPanelProps) {
  return (
    <PanelShell
      title="Deliverables"
      subtitle="Output artifacts & progress"
      icon={<Package className="size-3.5" strokeWidth={1.75} />}
      badge={
        <Badge variant="outline" className="h-5 font-mono text-[10px]">
          {deliverables.length} items
        </Badge>
      }
      fixedHeight
    >
      {!hasStarted ? (
        <div className="rounded-md border border-dashed border-blueprint/20 bg-blueprint/5 px-3 py-6 text-center">
          <p className="font-mono text-[10px] tracking-wider text-blueprint/70 uppercase">
            Deliverables will appear during orchestration
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {deliverables.map((item) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground uppercase">
                      {item.type}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-blueprint tabular-nums">
                    {item.progress}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      item.progress > 0 ? "bg-blueprint" : "bg-border"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.progress}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </PanelShell>
  );
}
