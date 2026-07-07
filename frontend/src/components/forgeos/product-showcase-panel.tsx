"use client";

/**
 * ProductShowcasePanel
 * ====================
 *
 * The "Version 1.0 shipped" moment. Appears once ``state.isComplete`` flips
 * to true (after CEO announces via ``project_published``, followed by
 * ``run_completed``). Slides up with Framer Motion. Contents:
 *
 *   1. Hero row: product name (derived from CEO plan or prompt), tagline,
 *      status pill ("Build Successful"), estimated completion time, and the
 *      six AI employees who worked on it.
 *   2. Tech stack chips from ``projectPlan.recommendedStack``, or the
 *      template's fallback list if the CEO didn't specify.
 *   3. Deployment status row.
 *   4. Realistic application preview: a fake-browser-chrome mock of a
 *      dashboard whose contents are chosen by keyword classifier over the
 *      user's prompt.
 *   5. "Generated Files" list. Clicking a file opens the shared Dialog with
 *      a syntax-highlighted view of realistic starter code.
 *   6. CTAs: View Code (scrolls the code list into view), Download Project
 *      (disabled), Open Preview (disabled).
 *
 * Everything else on the dashboard stays where it is. This panel slots in
 * ABOVE the Company Network in the completion phase so it's the first thing
 * the audience sees after the celebration badge dismisses.
 */

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock,
  FileCode2,
  Rocket,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { OrchestrationState } from "@/lib/orchestration-types";
import { resolveShowcaseData } from "@/lib/showcase-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CodeExplorer } from "@/components/forgeos/code-explorer";
import { ExportPanel } from "@/components/forgeos/export-panel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(completedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return "—";
  }
  const seconds = Math.max(1, Math.round((endMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return remSec === 0 ? `${mins}m` : `${mins}m ${remSec}s`;
}

import type { ProductTemplate } from "@/lib/product-templates";
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ProductShowcasePanelProps = {
  state: OrchestrationState;
};

export function ProductShowcasePanel({ state }: ProductShowcasePanelProps) {
  // Explorer state: whether the Code Explorer overlay is open, and the path
  // that should be focused when it opens (a click on a specific file card).
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerPath, setExplorerPath] = useState<string | null>(null);
  const openExplorerAt = useCallback((path: string | null) => {
    setExplorerPath(path);
    setExplorerOpen(true);
  }, []);
  const handleExplorerOpenChange = useCallback((next: boolean) => {
    setExplorerOpen(next);
    if (!next) setExplorerPath(null);
  }, []);

  // Classifier + naming: derived from prompt and CEO plan.
  const { template, productName, tagline, stack, files, filesFromLlm } = useMemo(
    () => resolveShowcaseData(state),
    [state]
  );

  const elapsed = useMemo(
    () => formatElapsed(state.startedAt, state.completedAt),
    [state.startedAt, state.completedAt]
  );

  return (
    <AnimatePresence>
      {state.isComplete && (
        <motion.section
          key="product-showcase"
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{
            // Match the celebration timing: the badge holds ~2.6s; the
            // showcase enters cleanly after its own paint.
            duration: 0.55,
            ease: [0.22, 1, 0.36, 1],
            delay: 0.15,
          }}
          className="relative overflow-hidden rounded-lg border border-blueprint/40 bg-card/60 backdrop-blur-sm"
        >
          {/* Blueprint corner mark */}
          <div className="pointer-events-none absolute top-2 left-3 font-mono text-[9px] tracking-[0.28em] text-blueprint/60 uppercase">
            Product Showcase · Version 1.0
          </div>

          {/* Hero */}
          <div className="border-b border-border/40 px-6 pt-8 pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.35 }}
                  className="font-mono text-2xl font-medium tracking-tight text-foreground sm:text-3xl"
                >
                  {productName}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.35 }}
                  className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground"
                >
                  {tagline}
                </motion.p>
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45, duration: 0.3 }}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1"
              >
                <CheckCircle2 className="size-3.5 text-emerald-400" strokeWidth={1.75} />
                <span className="font-mono text-[11px] tracking-widest text-emerald-400 uppercase">
                  Build Successful
                </span>
              </motion.div>
            </div>

            {/* Metadata row */}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <MetaBlock
                Icon={Clock}
                label="Estimated completion"
                value={elapsed}
              />
              <MetaBlock
                Icon={Rocket}
                label="Deployment"
                value="Production, us-east-1"
                success
              />
              <MetaBlock
                Icon={Users}
                label="AI employees involved"
                value={`${state.employees.length} of 6`}
              />
            </div>

            {/* Employees */}
            <div className="mt-5 flex flex-wrap gap-1.5">
              {state.employees.map((e) => (
                <span
                  key={e.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 px-2.5 py-0.5"
                  title={`${e.name}, ${e.role}`}
                >
                  <span className="flex size-4 items-center justify-center rounded-full border border-blueprint/30 bg-blueprint/10 font-mono text-[8px] font-medium text-blueprint">
                    {e.initials}
                  </span>
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    {e.role}
                  </span>
                </span>
              ))}
            </div>

            {/* Stack */}
            <div className="mt-5">
              <p className="mb-1.5 font-mono text-[9px] tracking-widest text-blueprint/70 uppercase">
                Tech stack
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stack.map((tech) => (
                  <Badge
                    key={tech}
                    variant="outline"
                    className="h-5 border-blueprint/30 bg-blueprint/5 font-mono text-[10px] text-blueprint"
                  >
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Application preview */}
          <div className="px-6 py-6">
            <p className="mb-2 font-mono text-[10px] tracking-widest text-blueprint/70 uppercase">
              Application preview
            </p>
            <ApplicationPreview template={template} productName={productName} />
          </div>

          {/* Generated files */}
          <div className="border-t border-border/40 px-6 py-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[10px] tracking-widest text-blueprint/70 uppercase">
                  Generated files
                </p>
                {filesFromLlm && (
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] tracking-widest text-emerald-400 uppercase">
                    AI-authored
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {files.length} files
              </span>
            </div>
            <ul id="generated-files-list" className="grid gap-1 sm:grid-cols-2">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => openExplorerAt(f.path)}
                    className="group flex w-full items-center gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-left transition-colors hover:border-blueprint/40 hover:bg-blueprint/5"
                  >
                    <FileCode2 className="size-3.5 shrink-0 text-blueprint" strokeWidth={1.75} />
                    <span className="truncate font-mono text-xs text-foreground">
                      {f.path}
                    </span>
                    <span className="ml-auto font-mono text-[9px] tracking-widest text-muted-foreground uppercase opacity-0 transition-opacity group-hover:opacity-100">
                      {f.language}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Export panel */}
          <ExportPanel
            state={state}
            onOpenCodeExplorer={() => openExplorerAt(files[0]?.path ?? null)}
          />

          {/* Code Explorer */}
          <CodeExplorer
            files={files}
            open={explorerOpen}
            onOpenChange={handleExplorerOpenChange}
            initialPath={explorerPath}
            projectName={productName}
          />
        </motion.section>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Metadata block
// ---------------------------------------------------------------------------

function MetaBlock({
  Icon,
  label,
  value,
  success,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
          success
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-blueprint/30 bg-blueprint/10 text-blueprint"
        )}
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate font-mono text-xs tabular-nums",
            success ? "text-emerald-400" : "text-foreground"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Application preview (fake dashboard)
// ---------------------------------------------------------------------------

function ApplicationPreview({
  template,
  productName,
}: {
  template: ProductTemplate;
  productName: string;
}) {
  const { preview } = template;
  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-background shadow-xl">
      {/* Fake browser chrome */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
        <div className="flex gap-1">
          <span className="size-2 rounded-full bg-rose-400/60" />
          <span className="size-2 rounded-full bg-amber-400/60" />
          <span className="size-2 rounded-full bg-emerald-400/60" />
        </div>
        <div className="ml-2 flex-1 truncate rounded-md border border-border/50 bg-background/60 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {preview.urlHost}
        </div>
      </div>

      {/* App layout: nav + main */}
      <div className="grid grid-cols-[140px_1fr] gap-0">
        <nav className="border-r border-border/50 bg-muted/10 px-2 py-3">
          <p className="mb-2 px-1 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
            {productName.split(" ")[0]}
          </p>
          <ul className="space-y-0.5">
            {preview.nav.map((item, i) => (
              <li
                key={item.label}
                className={cn(
                  "flex items-center justify-between rounded px-2 py-1 text-[11px]",
                  i === 0
                    ? "bg-blueprint/10 text-blueprint"
                    : "text-muted-foreground"
                )}
              >
                <span>{item.label}</span>
                {typeof item.count === "number" && (
                  <span className="font-mono text-[9px] tabular-nums text-muted-foreground/60">
                    {item.count}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {preview.pageTitle}
              </h3>
              {preview.pageSubtitle && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {preview.pageSubtitle}
                </p>
              )}
            </div>
            {preview.primaryCta && (
              <button
                type="button"
                className="pointer-events-none rounded-md bg-blueprint px-2.5 py-1 font-mono text-[10px] text-blueprint-foreground"
              >
                {preview.primaryCta}
              </button>
            )}
          </div>

          <div className="mb-3 grid gap-1.5 sm:grid-cols-3">
            {preview.stats.map((s) => (
              <div
                key={s.label}
                className="rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5"
              >
                <p className="font-mono text-[8px] tracking-widest text-muted-foreground uppercase">
                  {s.label}
                </p>
                <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
                  {s.value}
                </p>
                {s.delta && (
                  <p className="font-mono text-[9px] tabular-nums text-blueprint">
                    {s.delta}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-md border border-border/50">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-b border-border/40 bg-muted/20 px-2.5 py-1">
              {preview.tableColumns.map((c) => (
                <span
                  key={c}
                  className="font-mono text-[8px] tracking-widest text-muted-foreground uppercase"
                >
                  {c}
                </span>
              ))}
            </div>
            <ul>
              {preview.tableRows.map((row, i) => (
                <li
                  key={i}
                  className={cn(
                    "grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-2.5 py-1 text-[11px]",
                    i !== preview.tableRows.length - 1 &&
                      "border-b border-border/30"
                  )}
                >
                  <span className="truncate text-foreground">{row.primary}</span>
                  <span className="truncate text-muted-foreground">
                    {row.secondary}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">
                    {row.metric}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

