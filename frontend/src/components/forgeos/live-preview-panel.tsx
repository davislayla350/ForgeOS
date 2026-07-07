"use client";

/**
 * LivePreviewPanel
 * ================
 *
 * Renders an interactive React "product" the AI company just shipped.
 * Not a screenshot, not a static mock -- a real component with real state
 * that the judge can click on. Chosen by the same classifier that powers
 * the rest of the Product Showcase, so a "budgeting app" prompt yields the
 * expense dashboard; "kanban board" yields the task manager; and so on.
 *
 * The panel is designed to slide in *after* the Product Showcase's hero
 * has landed -- so the reveal sequence reads:
 *
 *   1. Company Online celebration        (existing)
 *   2. Run stats                         (existing)
 *   3. Product Showcase hero + code      (existing)
 *   4. Live Preview                      (this file)
 *
 * Where it goes on the page is decided by the dashboard; this component
 * only owns the enter animation and the frame.
 */

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Rocket } from "lucide-react";
import type { OrchestrationState } from "@/lib/orchestration-types";
import { classifyProject, deriveProductName } from "@/lib/product-templates";
import { templateForCategory } from "@/components/forgeos/live-preview-templates";
import { InteractivePreviewShell } from "@/components/forgeos/interactive-preview-shell";

type LivePreviewPanelProps = {
  state: OrchestrationState;
};

export function LivePreviewPanel({ state }: LivePreviewPanelProps) {
  const template = useMemo(
    () => classifyProject(state.projectIdea),
    [state.projectIdea]
  );
  const productName = useMemo(
    () =>
      deriveProductName(state.projectIdea, template, state.projectPlan?.companyName),
    [state.projectIdea, template, state.projectPlan?.companyName]
  );

  const PreviewComponent = useMemo(
    () => templateForCategory(template.category),
    [template.category]
  );

  return (
    <AnimatePresence>
      {state.isComplete && (
        <motion.section
          key="live-preview"
          initial={{ opacity: 0, y: 50, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30 }}
          // Stagger after the Product Showcase (0.15s + 0.55s intrinsic).
          transition={{
            duration: 0.6,
            ease: [0.22, 1, 0.36, 1],
            delay: 0.35,
          }}
          className="relative overflow-hidden rounded-lg border border-blueprint/40 bg-card/60 backdrop-blur-sm"
        >
          {/* Blueprint corner mark */}
          <div className="pointer-events-none absolute top-2 left-3 font-mono text-[9px] tracking-[0.28em] text-blueprint/60 uppercase">
            Live Preview · Version 1.0
          </div>

          {/* Header row */}
          <div className="flex items-center justify-between border-b border-border/40 px-6 pt-7 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Rocket className="size-3.5 text-blueprint" strokeWidth={1.75} />
                <h2 className="font-mono text-sm tracking-tight text-foreground">
                  {productName}
                </h2>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] tracking-widest text-emerald-400 uppercase">
                  Live
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] tracking-wider text-muted-foreground">
                Interactive preview · click anywhere to try it
              </p>
            </div>
          </div>

          {/* Fake browser chrome + the interactive app */}
          <div className="px-6 py-5">
            <div className="overflow-hidden rounded-md border border-border/60 bg-background/40 shadow-xl">
              {/* Chrome */}
              <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
                <div className="flex gap-1">
                  <span className="size-2 rounded-full bg-rose-400/60" />
                  <span className="size-2 rounded-full bg-amber-400/60" />
                  <span className="size-2 rounded-full bg-emerald-400/60" />
                </div>
                <div className="ml-2 flex-1 truncate rounded-md border border-border/50 bg-background/60 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {template.preview.urlHost}
                </div>
                <span className="rounded border border-blueprint/30 bg-blueprint/5 px-1.5 py-0.5 font-mono text-[8px] tracking-widest text-blueprint uppercase">
                  {template.category.replace("_", " ")}
                </span>
              </div>

              {/* App body */}
              <div className="h-[420px] px-4 py-3">
                <InteractivePreviewShell
                  productName={productName}
                  urlHost={template.preview.urlHost}
                >
                  <PreviewComponent />
                </InteractivePreviewShell>
              </div>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
