"use client";

import { AlertTriangle, FlaskConical } from "lucide-react";

/**
 * FallbackNotice
 *
 * Shown when a launch fails via both the WebSocket and REST paths. Replaces
 * a broken/empty page with a clear, professional explanation and next step.
 */
export function FallbackNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-destructive uppercase">
            ForgeOS is temporarily unavailable
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * DemoModeBadge
 *
 * Shown when the backend generated this run from built-in templates because
 * the AI provider was unavailable (no key, exhausted credits, or downtime).
 * Keeps the demo honest: the run is real orchestration, sample content.
 */
export function DemoModeBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-blueprint/25 bg-blueprint/5 px-3 py-1">
      <FlaskConical className="size-3 text-blueprint" aria-hidden="true" />
      <span className="font-mono text-[11px] tracking-wider text-blueprint uppercase">
        Demo mode: sample output, AI provider unavailable
      </span>
    </div>
  );
}
