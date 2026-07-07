"use client";

// full-screen product ready reveal after run completes
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Code2,
  FileArchive,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import type { OrchestrationState } from "@/lib/orchestration-types";
import {
  estimateBuildEconomics,
  resolveShowcaseData,
} from "@/lib/showcase-data";
import { buildStartupPitch } from "@/lib/startup-pitch";
import { templateForCategory } from "@/components/forgeos/live-preview-templates";
import { InteractivePreviewShell } from "@/components/forgeos/interactive-preview-shell";
import { CodeExplorer } from "@/components/forgeos/code-explorer";
import { buildProjectBundle } from "@/lib/project-bundle";
import { downloadBundleAsZip } from "@/lib/export-transports";
import { cn } from "@/lib/utils";

type ProductReadyRevealProps = {
  visible: boolean;
  state: OrchestrationState;
  onDismiss: () => void;
};

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ProductReadyReveal({
  visible,
  state,
  onDismiss,
}: ProductReadyRevealProps) {
  const showcase = useMemo(() => resolveShowcaseData(state), [state]);
  const economics = useMemo(() => estimateBuildEconomics(state), [state]);
  const pitch = useMemo(() => buildStartupPitch(state, showcase), [state, showcase]);
  const PreviewComponent = useMemo(
    () => templateForCategory(showcase.template.category),
    [showcase.template.category]
  );

  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerPath, setExplorerPath] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const openExplorer = useCallback((path: string | null) => {
    setExplorerPath(path);
    setExplorerOpen(true);
  }, []);

  const handleDownloadZip = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const bundle = buildProjectBundle(state);
      await downloadBundleAsZip(bundle);
    } finally {
      setDownloading(false);
    }
  }, [downloading, state]);

  const highlightFiles = showcase.files.slice(0, 8);
  const moreFileCount = Math.max(0, showcase.files.length - highlightFiles.length);

  return (
    <>
      <AnimatePresence>
        {visible && (
          <>
            {/* Backdrop: darken + blur the operating dashboard */}
            <motion.div
              key="product-ready-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="fixed inset-0 z-[75] bg-background/70 backdrop-blur-md"
              aria-hidden
            />

            {/* Hero drawer */}
            <motion.div
              key="product-ready-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-ready-title"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[96vh] flex-col overflow-hidden rounded-t-xl border border-blueprint/40 bg-card/95 shadow-2xl backdrop-blur-xl"
            >
              {/* Blueprint grid atmosphere */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, oklch(0.72 0.11 210) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.72 0.11 210) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />

              {/* Top bar */}
              <div className="relative flex shrink-0 items-center justify-between border-b border-border/40 px-5 py-3 sm:px-8">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-blueprint" strokeWidth={1.75} />
                  <span className="font-mono text-[10px] tracking-[0.32em] text-blueprint uppercase">
                    Product Ready
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-md border border-border/50 p-1.5 text-muted-foreground transition-colors hover:border-blueprint/40 hover:text-foreground"
                  aria-label="View full dashboard"
                >
                  <X className="size-4" strokeWidth={1.75} />
                </button>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
                {/* Hero copy */}
                <div className="shrink-0 border-b border-border/30 px-5 py-6 text-center sm:px-8 sm:py-8">
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.45 }}
                  >
                    <div className="mx-auto mb-4 h-px w-24 bg-gradient-to-r from-transparent via-blueprint/50 to-transparent" />
                    <h2
                      id="product-ready-title"
                      className="font-mono text-3xl font-medium tracking-tight text-foreground sm:text-4xl md:text-5xl"
                    >
                      {showcase.productName}
                    </h2>
                    <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                      Your AI company successfully built an MVP ready for review.
                    </p>
                    <p className="mt-1 font-mono text-[11px] tracking-wider text-blueprint/80">
                      {showcase.tagline}
                    </p>
                    <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-blueprint/50 to-transparent" />
                  </motion.div>
                </div>

                {/* Almost-fullscreen browser preview */}
                <div className="shrink-0 px-4 py-4 sm:px-8 sm:py-5">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.35, duration: 0.5 }}
                    className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-border/60 bg-background shadow-2xl"
                  >
                    <div className="flex items-center gap-2 border-b border-border/50 bg-muted/25 px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <span className="size-2.5 rounded-full bg-rose-400/70" />
                        <span className="size-2.5 rounded-full bg-amber-400/70" />
                        <span className="size-2.5 rounded-full bg-emerald-400/70" />
                      </div>
                      <div className="ml-3 flex-1 truncate rounded-md border border-border/50 bg-background/70 px-3 py-1 font-mono text-[11px] text-muted-foreground">
                        {showcase.template.preview.urlHost}
                      </div>
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] tracking-widest text-emerald-400 uppercase">
                        Live
                      </span>
                    </div>
                    <div className="min-h-[380px] bg-background/90 px-3 py-3 sm:min-h-[460px] sm:px-5 sm:py-4">
                      <InteractivePreviewShell
                        productName={showcase.productName}
                        urlHost={showcase.template.preview.urlHost}
                      >
                        <PreviewComponent />
                      </InteractivePreviewShell>
                    </div>
                  </motion.div>
                  <p className="mt-2 text-center font-mono text-[10px] tracking-wider text-muted-foreground">
                    Sign in · explore · checkout — try the full flow
                  </p>
                </div>

                {/* Startup pitch — investor snapshot */}
                <div className="shrink-0 border-t border-border/30 px-4 py-5 sm:px-8">
                  <div className="mb-4 flex items-center gap-2">
                    <TrendingUp className="size-3.5 text-blueprint" strokeWidth={1.75} />
                    <p className="font-mono text-[10px] tracking-widest text-blueprint/70 uppercase">
                      Investor snapshot
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-border/40 bg-card/40 p-4">
                      <PitchRow label="Market" value={pitch.marketSize} />
                      <PitchRow label="Target customer" value={pitch.targetCustomer} />
                      <PitchRow label="Revenue model" value={pitch.revenueModel} />
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                            Year 1 ARR
                          </p>
                          <p className="mt-0.5 font-mono text-sm tabular-nums text-emerald-400">
                            {pitch.projectedArrYearOne}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                            Year 3 ARR
                          </p>
                          <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
                            {pitch.projectedArrYearThree}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-card/40 p-4">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Target className="size-3 text-blueprint" strokeWidth={1.75} />
                        <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                          Core features
                        </p>
                      </div>
                      <ul className="space-y-2">
                        {pitch.features.map((f) => (
                          <li key={f.title} className="border-l-2 border-blueprint/30 pl-2.5">
                            <p className="text-xs font-medium text-foreground">{f.title}</p>
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                              {f.description}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-border/40 bg-card/40 p-4">
                    <p className="mb-3 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                      Roadmap
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {pitch.roadmap.map((item) => (
                        <div
                          key={item.quarter}
                          className="rounded-md border border-border/30 bg-background/40 px-3 py-2"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] tracking-widest text-blueprint">
                              {item.quarter}
                            </span>
                            <RoadmapStatus status={item.status} />
                          </div>
                          <p className="text-xs leading-snug text-foreground">
                            {item.milestone}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Files + stack row */}
                <div className="grid shrink-0 gap-4 border-t border-border/30 px-4 py-5 sm:grid-cols-2 sm:px-8">
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45, duration: 0.4 }}
                  >
                    <p className="mb-3 font-mono text-[10px] tracking-widest text-blueprint/70 uppercase">
                      Files generated
                    </p>
                    <ul className="space-y-1.5">
                      {highlightFiles.map((f, i) => (
                        <motion.li
                          key={f.path}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + i * 0.04 }}
                        >
                          <button
                            type="button"
                            onClick={() => openExplorer(f.path)}
                            className="group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-blueprint/30 hover:bg-blueprint/5"
                          >
                            <Check className="size-3.5 shrink-0 text-emerald-400" strokeWidth={2} />
                            <span className="truncate font-mono text-xs text-foreground">
                              {f.path}
                            </span>
                          </button>
                        </motion.li>
                      ))}
                      {moreFileCount > 0 && (
                        <li className="pl-6 font-mono text-[10px] text-muted-foreground">
                          +{moreFileCount} more in bundle
                        </li>
                      )}
                    </ul>
                    {showcase.filesFromLlm && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[8px] tracking-widest text-emerald-400 uppercase">
                        <CheckCircle2 className="size-3" />
                        Engineer-authored
                      </span>
                    )}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45, duration: 0.4 }}
                  >
                    <p className="mb-3 font-mono text-[10px] tracking-widest text-blueprint/70 uppercase">
                      Tech stack
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {showcase.stack.map((tech, i) => (
                        <motion.span
                          key={tech}
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.52 + i * 0.05 }}
                          className="rounded-md border border-blueprint/30 bg-blueprint/5 px-3 py-1.5 font-mono text-xs text-blueprint"
                        >
                          {tech}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                </div>

                {/* Economics + CTAs */}
                <div className="mt-auto shrink-0 border-t border-border/40 bg-background/40 px-4 py-5 sm:px-8">
                  <div className="mb-5 grid gap-3 sm:grid-cols-3">
                    <EconomicsCell
                      label="Estimated build cost"
                      sublabel="Development"
                      value={formatUsd(economics.developmentUsd)}
                    />
                    <EconomicsCell
                      label="Hosting"
                      sublabel="Monthly"
                      value={`${formatUsd(economics.hostingMonthlyUsd)}/mo`}
                    />
                    <EconomicsCell
                      label="Launch readiness"
                      sublabel="Quality gates passed"
                      value={`${economics.launchReadinessPct}%`}
                      highlight
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <CtaButton
                      label="Download ZIP"
                      Icon={FileArchive}
                      variant="primary"
                      busy={downloading}
                      onClick={handleDownloadZip}
                    />
                    <CtaButton
                      label="Open Code Explorer"
                      Icon={Code2}
                      variant="primary"
                      onClick={() => openExplorer(showcase.files[0]?.path ?? null)}
                    />
                    <button
                      type="button"
                      onClick={onDismiss}
                      className="ml-auto font-mono text-[10px] tracking-widest text-muted-foreground uppercase underline-offset-4 hover:text-foreground hover:underline"
                    >
                      View full dashboard
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CodeExplorer
        files={showcase.files}
        open={explorerOpen}
        onOpenChange={setExplorerOpen}
        initialPath={explorerPath}
        projectName={showcase.productName}
      />
    </>
  );
}

function CtaButton({
  label,
  Icon,
  onClick,
  busy,
  variant = "secondary",
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  busy?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-4 py-2 font-mono text-[11px] tracking-wider uppercase transition-colors",
        variant === "primary"
          ? "border-blueprint/50 bg-blueprint/15 text-blueprint hover:bg-blueprint/25"
          : "border-border/40 bg-background/40 text-foreground hover:border-blueprint/40",
        busy && "animate-pulse opacity-80"
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}

function PitchRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-foreground">{value}</p>
    </div>
  );
}

function RoadmapStatus({
  status,
}: {
  status: "shipped" | "in_progress" | "planned";
}) {
  const styles = {
    shipped: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    in_progress: "border-blueprint/30 bg-blueprint/10 text-blueprint",
    planned: "border-border/40 bg-background/40 text-muted-foreground",
  };
  const labels = {
    shipped: "Shipped",
    in_progress: "Building",
    planned: "Planned",
  };
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[8px] tracking-widest uppercase",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

function EconomicsCell({
  label,
  sublabel,
  value,
  highlight,
}: {
  label: string;
  sublabel: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-card/50 px-4 py-3">
      <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-blueprint/70">{sublabel}</p>
      <p
        className={cn(
          "mt-1 font-mono text-lg tabular-nums",
          highlight ? "text-emerald-400" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
