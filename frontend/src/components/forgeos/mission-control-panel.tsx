"use client";

/**
 * Mission Control communication feed.
 *
 * Shows every inter-agent message as a live chat. Two visual pieces:
 *
 *   1. A role-lane header ("CEO -> PM -> Engineer -> Security -> QA -> DevOps")
 *      that mirrors the intended workflow. Each lane pulses when its role has
 *      recent activity, so you can read the workflow at a glance without
 *      scanning the whole feed.
 *
 *   2. The feed itself: every message renders as a chat bubble with sender,
 *      recipient, HH:MM:SS timestamp, and a Slack-style status pill
 *      (delivered / seen). New messages slide in from the bottom (translateY +
 *      opacity) via Framer Motion.
 *
 * Performance:
 *   * Animate only the last ANIMATED_TAIL messages -- older ones render as
 *     plain markup. This keeps the DOM cheap on runs with hundreds of messages.
 *   * `key` is stable (backend seq -> "mcm-<seq>"), so React doesn't remount
 *     rows on every state update.
 *   * Auto-scroll to bottom only when the user was already near the bottom
 *     ("stick-to-bottom" pattern). If they've scrolled up to read history,
 *     new arrivals don't yank the view.
 *
 * Design: reuses PanelShell + blueprint accent + font-mono labels + emerald
 * live dot -- same tokens as every other panel.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, MessageSquare, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import type { MissionControlMessage, MissionControlMessageKind }
  from "@/lib/mission-control-types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PanelShell } from "@/components/forgeos/panel-shell";

/** How many trailing messages get Framer Motion; older render as static DOM. */
const ANIMATED_TAIL = 40;

/** The role sequence rendered as the header lanes -- reference workflow. */
const ROLE_LANES: Array<{ role: string; label: string; short: string }> = [
  { role: "CEO", label: "CEO", short: "CEO" },
  { role: "Product Manager", label: "Product Manager", short: "PM" },
  { role: "Engineer", label: "Engineer", short: "ENG" },
  { role: "Security", label: "Security", short: "SEC" },
  { role: "QA", label: "QA", short: "QA" },
  { role: "DevOps", label: "DevOps", short: "OPS" },
];

/** Kind -> icon + tint for the bubble's accent stripe. */
const KIND_STYLES: Record<
  MissionControlMessageKind,
  { icon: React.ComponentType<{ className?: string }>; tint: string; label: string }
> = {
  message:        { icon: MessageSquare, tint: "text-blueprint",       label: "Message" },
  broadcast:      { icon: AtSign,        tint: "text-blueprint",       label: "Broadcast" },
  review_request: { icon: MessageSquare, tint: "text-amber-400",       label: "Review request" },
  approval:       { icon: ThumbsUp,      tint: "text-emerald-400",     label: "Approval" },
  rejection:      { icon: ThumbsDown,    tint: "text-rose-400",        label: "Rejection" },
  escalation:     { icon: ShieldAlert,   tint: "text-orange-400",      label: "Escalation" },
};

type MissionControlPanelProps = {
  messages: MissionControlMessage[];
  hasStarted: boolean;
  isRunning: boolean;
};

export function MissionControlPanel({
  messages,
  hasStarted,
  isRunning,
}: MissionControlPanelProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  // Roles currently pulsing in the header lane (sent OR received a message
  // within the last ~5 messages).
  const activeRoles = useMemo(() => {
    const recent = messages.slice(-5);
    const set = new Set<string>();
    for (const m of recent) {
      set.add(m.senderRole);
      if (m.recipientRole !== "*") set.add(m.recipientRole);
    }
    return set;
  }, [messages]);

  // Auto-scroll only when the user is near the bottom. Runs BEFORE paint so it
  // feels immediate; otherwise you see a flash of "old bottom" before scroll.
  useLayoutEffect(() => {
    const el = feedRef.current;
    if (!el || !stickToBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, stickToBottom]);

  // Track scroll position to decide whether to keep sticking to bottom.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStickToBottom(distanceFromBottom < 48);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Split messages: earlier ones render as static DOM (cheap), the tail as
  // motion elements so animations only cost what's on screen.
  const splitIndex = Math.max(0, messages.length - ANIMATED_TAIL);
  const staticMessages = messages.slice(0, splitIndex);
  const tailMessages = messages.slice(splitIndex);

  return (
    <PanelShell
      title="Mission Control"
      subtitle="Cross-crew communication feed"
      icon={<MessageSquare className="size-3.5" strokeWidth={1.75} />}
      badge={
        <Badge
          variant="outline"
          className={cn(
            "h-5 border-blueprint/30 bg-blueprint/10 font-mono text-[10px] text-blueprint",
            isRunning && "animate-pulse"
          )}
        >
          {messages.length} msg
        </Badge>
      }
      className="min-h-[280px]"
    >
      {/* Role lane header -- the reference workflow */}
      <div className="mb-3 flex items-center gap-1 overflow-x-auto pb-1">
        {ROLE_LANES.map((lane, idx) => {
          const isActive = activeRoles.has(lane.role);
          return (
            <div key={lane.role} className="flex shrink-0 items-center gap-1">
              <motion.div
                animate={
                  isActive
                    ? { borderColor: "oklch(0.72 0.11 210 / 0.5)" }
                    : { borderColor: "oklch(0.72 0.11 210 / 0.15)" }
                }
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1",
                  isActive ? "bg-blueprint/10" : "bg-transparent"
                )}
              >
                <motion.span
                  animate={
                    isActive
                      ? { scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }
                      : { scale: 1, opacity: 0.4 }
                  }
                  transition={
                    isActive
                      ? { repeat: Infinity, duration: 1.8 }
                      : { duration: 0.3 }
                  }
                  className={cn(
                    "size-1.5 rounded-full",
                    isActive ? "bg-blueprint" : "bg-muted-foreground/40"
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[9px] tracking-wider uppercase",
                    isActive ? "text-blueprint" : "text-muted-foreground"
                  )}
                >
                  {lane.short}
                </span>
              </motion.div>
              {idx < ROLE_LANES.length - 1 && (
                <span className="font-mono text-[9px] text-muted-foreground/50">
                  &#8594;
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="max-h-[420px] min-h-[180px] overflow-y-auto pr-1"
      >
        {!hasStarted ? (
          <div className="rounded-md border border-dashed border-blueprint/20 bg-blueprint/5 px-3 py-6 text-center">
            <p className="font-mono text-[10px] tracking-wider text-blueprint/70 uppercase">
              Awaiting first transmission
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/40 px-3 py-6 text-center">
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Feed silent -- no crew messages yet
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {staticMessages.map((m) => (
              <MessageRow key={m.id} message={m} animated={false} />
            ))}
            <AnimatePresence initial={false}>
              {tailMessages.map((m) => (
                <MessageRow key={m.id} message={m} animated />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Message row
// ---------------------------------------------------------------------------

function MessageRow({
  message,
  animated,
}: {
  message: MissionControlMessage;
  animated: boolean;
}) {
  const styles = KIND_STYLES[message.kind];
  const Icon = styles.icon;
  const isBroadcast = message.recipientRole === "*";

  const body = (
    <div
      className={cn(
        "group flex items-start gap-2.5 rounded-md border border-border/40 bg-card/40 px-2.5 py-2",
        "transition-colors hover:bg-card/60"
      )}
    >
      <Avatar className="mt-0.5 size-7 shrink-0 border border-border/60">
        <AvatarFallback className="bg-blueprint/10 font-mono text-[10px] text-blueprint">
          {message.senderInitials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {/* Header row: sender -> recipient, kind, timestamp */}
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">
            {message.senderName}
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/70">
            &#8594;
          </span>
          <span
            className={cn(
              "text-sm",
              isBroadcast ? "text-blueprint" : "text-foreground/80"
            )}
          >
            {isBroadcast ? "all hands" : message.recipientName}
          </span>
          <Icon className={cn("ml-1 size-3 shrink-0", styles.tint)} />
          <span className={cn("font-mono text-[9px] uppercase", styles.tint)}>
            {styles.label}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {message.timestamp}
          </span>
        </div>
        {/* Body */}
        <p className="mt-0.5 text-sm leading-snug break-words text-muted-foreground">
          {message.content}
        </p>
        {/* Status pill */}
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-[9px] tracking-wider uppercase",
              message.status === "seen"
                ? "text-emerald-400/80"
                : "text-muted-foreground/60"
            )}
          >
            {message.status === "seen" ? "seen" : "delivered"}
          </span>
        </div>
      </div>
    </div>
  );

  if (!animated) return <li>{body}</li>;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {body}
    </motion.li>
  );
}
