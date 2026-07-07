"use client";

import { motion } from "framer-motion";
import { Bot, Circle } from "lucide-react";
import type { AIEmployee } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const statusConfig = {
  active: { label: "Working", color: "text-blueprint", dot: "bg-blueprint" },
  reviewing: { label: "Reviewing", color: "text-amber-400", dot: "bg-amber-400" },
  waiting: { label: "Waiting", color: "text-amber-400", dot: "bg-amber-400" },
  blocked: { label: "Blocked", color: "text-rose-400", dot: "bg-rose-400" },
  complete: { label: "Complete", color: "text-emerald-400", dot: "bg-emerald-400" },
  idle: { label: "Idle", color: "text-muted-foreground", dot: "bg-muted-foreground/60" },
  offline: { label: "Offline", color: "text-muted-foreground", dot: "bg-muted-foreground/50" },
} as const;

type AIEmployeesSidebarProps = {
  employees: AIEmployee[];
  onSelectEmployee?: (employee: AIEmployee) => void;
};

export function AIEmployeesSidebar({ employees, onSelectEmployee }: AIEmployeesSidebarProps) {
  const activeCount = employees.filter(
    (e) => e.status === "active" || e.status === "reviewing"
  ).length;

  return (
    <aside className="relative z-10 flex w-full shrink-0 flex-col border-b border-border/60 bg-sidebar/50 backdrop-blur-sm lg:w-72 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-blueprint" strokeWidth={1.75} />
          <h2 className="font-mono text-xs font-medium tracking-wider text-foreground uppercase">
            AI Employees
          </h2>
        </div>
        <Badge
          variant="outline"
          className="h-5 border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-400"
        >
          {activeCount} online
        </Badge>
      </div>

      <Separator className="bg-border/50" />

      <ScrollArea className="h-48 lg:h-auto lg:flex-1">
        <ul className="divide-y divide-border/40">
          {employees.map((employee) => {
            const status = statusConfig[employee.status];
            return (
              <motion.li
                key={employee.id}
                layout
                animate={
                  employee.status === "active"
                    ? { backgroundColor: "oklch(0.72 0.11 210 / 6%)" }
                    : { backgroundColor: "transparent" }
                }
                transition={{ duration: 0.3 }}
              >
                <button
                  type="button"
                  onClick={() => onSelectEmployee?.(employee)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <Avatar className="size-8 border border-border/60">
                    <AvatarFallback
                      className={cn(
                        "font-mono text-[10px]",
                        employee.status === "active"
                          ? "bg-blueprint/20 text-blueprint"
                          : "bg-blueprint/10 text-blueprint"
                      )}
                    >
                      {employee.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {employee.name}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {employee.role}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <motion.span
                      animate={
                        employee.status === "active"
                          ? { scale: [1, 1.3, 1] }
                          : { scale: 1 }
                      }
                      transition={
                        employee.status === "active"
                          ? { repeat: Infinity, duration: 2 }
                          : {}
                      }
                    >
                      <Circle
                        className={cn("size-1.5 fill-current", status.dot, status.color)}
                      />
                    </motion.span>
                    <span
                      className={cn(
                        "hidden font-mono text-[9px] uppercase sm:inline",
                        status.color
                      )}
                    >
                      {status.label}
                    </span>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </ScrollArea>

      <div className="hidden border-t border-border/50 px-4 py-3 font-mono text-[10px] tracking-widest text-muted-foreground uppercase lg:block">
        Crew Capacity: 6 / 12
      </div>
    </aside>
  );
}
