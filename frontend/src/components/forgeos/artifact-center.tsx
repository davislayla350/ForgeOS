"use client";

/**
 * Artifact Center.
 *
 * Two pieces:
 *
 *   1. A grid of clickable artifact cards. Each card previews the type, owner,
 *      revision, approval, and creation time. Clicking it opens the viewer.
 *
 *   2. A document viewer (Base UI Dialog) that renders the artifact's real
 *      markdown content with syntax-highlighted code blocks (MarkdownView),
 *      shows the metadata, and offers a download.
 *
 * Backend-produced deliverables ship with real content (see the backend
 * ``agents/tools.py`` functions); the reducer plumbs that through. If content
 * is missing (fallback / pre-launch), the viewer says so gracefully.
 */

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog } from "@base-ui/react/dialog";
import {
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FileCode2,
  FileText,
  Files,
  RefreshCcw,
  ShieldCheck,
  User,
  X,
  XCircle,
} from "lucide-react";
import type { Deliverable } from "@/lib/orchestration-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PanelShell } from "@/components/forgeos/panel-shell";
import { MarkdownView } from "@/components/forgeos/markdown-view";

// ---------------------------------------------------------------------------
// Icons keyed by deliverable type
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Document: FileText,
  Blueprint: FileCode2,
  Technical: FileCode2,
  Audit: ShieldCheck,
  QA: Files,
  Ops: FileCode2,
};

function iconForType(type: string) {
  return TYPE_ICONS[type] ?? FileText;
}

// ---------------------------------------------------------------------------
// Approval styling
// ---------------------------------------------------------------------------

type ApprovalConfig = {
  label: string;
  className: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const APPROVAL_CONFIG: Record<
  NonNullable<Deliverable["approvalStatus"]>,
  ApprovalConfig
> = {
  approved: {
    label: "Approved",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    Icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    Icon: XCircle,
  },
  pending: {
    label: "Pending",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    Icon: Clock,
  },
  not_reviewed: {
    label: "Not required",
    className: "border-border/40 bg-muted/30 text-muted-foreground",
    Icon: Circle,
  },
};

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatCreationTime(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatCreationDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function downloadArtifact(deliverable: Deliverable) {
  const filename = `${sanitizeFilename(deliverable.title || "artifact")}.md`;
  const blob = new Blob([deliverable.content ?? ""], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type ArtifactCenterProps = {
  deliverables: Deliverable[];
  hasStarted: boolean;
};

export function ArtifactCenter({ deliverables, hasStarted }: ArtifactCenterProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Only completed artifacts (progress 100) are clickable; in-progress cards
  // still render but with a "generating" indicator.
  const readyIds = useMemo(
    () => new Set(deliverables.filter((d) => d.progress >= 100).map((d) => d.id)),
    [deliverables]
  );

  const openDeliverable = useMemo(
    () => deliverables.find((d) => d.id === openId) ?? null,
    [deliverables, openId]
  );

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) setOpenId(null);
  }, []);

  return (
    <>
      <PanelShell
        title="Artifact Center"
        subtitle="Generated deliverables, ready to review"
        icon={<Files className="size-3.5" strokeWidth={1.75} />}
        badge={
          <Badge
            variant="outline"
            className="h-5 border-blueprint/30 bg-blueprint/10 font-mono text-[10px] text-blueprint"
          >
            {readyIds.size} ready
          </Badge>
        }
        className="min-h-[220px]"
      >
        {!hasStarted ? (
          <div className="rounded-md border border-dashed border-blueprint/20 bg-blueprint/5 px-3 py-6 text-center">
            <p className="font-mono text-[10px] tracking-wider text-blueprint/70 uppercase">
              Awaiting first artifact
            </p>
          </div>
        ) : deliverables.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/40 px-3 py-6 text-center">
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              No artifacts yet
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {deliverables.map((deliverable) => (
                <motion.li
                  key={deliverable.id}
                  layout="position"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ArtifactCard
                    deliverable={deliverable}
                    ready={readyIds.has(deliverable.id)}
                    onOpen={() => setOpenId(deliverable.id)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </PanelShell>

      <ArtifactViewer
        deliverable={openDeliverable}
        open={openDeliverable !== null}
        onOpenChange={handleOpenChange}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ArtifactCard({
  deliverable,
  ready,
  onOpen,
}: {
  deliverable: Deliverable;
  ready: boolean;
  onOpen: () => void;
}) {
  const Icon = iconForType(deliverable.type);
  const approval =
    APPROVAL_CONFIG[deliverable.approvalStatus ?? "not_reviewed"];
  const ApprovalIcon = approval.Icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!ready}
      className={cn(
        "group relative flex w-full flex-col items-start gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-3 text-left transition-all",
        ready
          ? "cursor-pointer hover:border-blueprint/40 hover:bg-card/70 hover:shadow-[0_0_0_1px_var(--blueprint-glow)]"
          : "cursor-wait opacity-70"
      )}
    >
      {/* Corner mark, blueprint style */}
      <span className="pointer-events-none absolute top-1 left-1 font-mono text-[8px] tracking-[0.2em] text-blueprint/40 uppercase">
        Rev. {String(deliverable.revision ?? 0).padStart(3, "0")}
      </span>

      <div className="flex w-full items-start justify-between gap-2 pt-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 rounded border border-blueprint/25 bg-blueprint/10 p-1.5 text-blueprint">
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {deliverable.title}
            </p>
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {deliverable.type}
            </p>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex w-full flex-wrap items-center gap-2 pt-1 font-mono text-[10px] text-muted-foreground">
        {deliverable.ownerRole && (
          <span className="inline-flex items-center gap-1">
            <User className="size-2.5" />
            {deliverable.ownerRole}
          </span>
        )}
        {deliverable.updatedAt && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-2.5" />
            {formatCreationTime(deliverable.updatedAt)}
          </span>
        )}
      </div>

      {/* Approval + open hint */}
      <div className="flex w-full items-center justify-between gap-2 pt-1">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase",
            approval.className
          )}
        >
          <ApprovalIcon className="size-2.5" />
          {approval.label}
        </span>
        {ready ? (
          <span className="font-mono text-[9px] tracking-widest text-blueprint/70 uppercase opacity-0 transition-opacity group-hover:opacity-100">
            Open
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
            <RefreshCcw className="size-2.5 animate-spin" />
            Generating
          </span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Viewer dialog
// ---------------------------------------------------------------------------

function ArtifactViewer({
  deliverable,
  open,
  onOpenChange,
}: {
  deliverable: Deliverable | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  if (!deliverable) return null;

  const Icon = iconForType(deliverable.type);
  const approval =
    APPROVAL_CONFIG[deliverable.approvalStatus ?? "not_reviewed"];
  const ApprovalIcon = approval.Icon;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          render={
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
            />
          }
        />
        <Dialog.Popup
          render={
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(92vw,880px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border/50 bg-card shadow-2xl"
            />
          }
        >
            {/* Header */}
            <div className="relative shrink-0 border-b border-border/40 bg-card/80 px-6 pt-5 pb-4 backdrop-blur">
              {/* Blueprint corner mark */}
              <div className="pointer-events-none absolute top-2 left-2 font-mono text-[9px] tracking-[0.25em] text-blueprint/50 uppercase">
                Artifact Rev. {String(deliverable.revision ?? 0).padStart(3, "0")}
              </div>
              <div className="flex items-start gap-3 pt-2">
                <span className="mt-0.5 rounded border border-blueprint/30 bg-blueprint/10 p-2 text-blueprint">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Dialog.Title
                    render={
                      <h2 className="font-mono text-lg font-medium tracking-tight text-foreground" />
                    }
                  >
                    {deliverable.title}
                  </Dialog.Title>
                  <p className="mt-0.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                    {deliverable.type}
                    {deliverable.ownerRole ? ` by ${deliverable.ownerRole}` : ""}
                  </p>
                </div>
                <Dialog.Close
                  render={
                    <button
                      type="button"
                      aria-label="Close"
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  }
                />
              </div>

              {/* Metadata row */}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                <MetaCell label="Owner" value={deliverable.ownerRole ?? "not set"} />
                <MetaCell
                  label="Revision"
                  value={String(deliverable.revision ?? 0)}
                />
                <MetaCell
                  label="Created"
                  value={
                    deliverable.updatedAt
                      ? `${formatCreationDate(deliverable.updatedAt)} ${formatCreationTime(deliverable.updatedAt)}`
                      : "not set"
                  }
                />
                <MetaCell
                  label="Approval"
                  render={
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase",
                        approval.className
                      )}
                    >
                      <ApprovalIcon className="size-2.5" />
                      {approval.label}
                      {deliverable.approvedBy && deliverable.approvalStatus === "approved"
                        ? ` ${deliverable.approvedBy}`
                        : null}
                    </span>
                  }
                />
              </dl>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {deliverable.reasoningTrace && deliverable.reasoningTrace.trim() && (
                <div className="mb-4 rounded-md border border-blueprint/30 bg-blueprint/5 px-3 py-2.5">
                  <p className="mb-1 flex items-center gap-1.5 font-mono text-[9px] tracking-widest text-blueprint/80 uppercase">
                    Author reasoning
                  </p>
                  <p className="text-xs leading-relaxed text-foreground">
                    {deliverable.reasoningTrace.trim()}
                  </p>
                </div>
              )}
              {deliverable.content ? (
                <MarkdownView source={deliverable.content} />
              ) : (
                <div className="rounded-md border border-dashed border-border/40 bg-muted/10 px-4 py-8 text-center">
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    No content available yet
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-border/40 bg-card/60 px-6 py-3">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                Signed off by {deliverable.approvedBy ?? "not set"}
              </span>
              <button
                type="button"
                onClick={() => downloadArtifact(deliverable)}
                disabled={!deliverable.content}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border border-blueprint/30 bg-blueprint/10 px-3 py-1.5 font-mono text-[11px] tracking-wider text-blueprint uppercase transition-colors",
                  "hover:bg-blueprint/20 disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <Download className="size-3.5" />
                Download .md
              </button>
            </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Small metadata cell
// ---------------------------------------------------------------------------

function MetaCell({
  label,
  value,
  render,
}: {
  label: string;
  value?: string;
  render?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-xs text-foreground">
        {render ?? value}
      </dd>
    </div>
  );
}
