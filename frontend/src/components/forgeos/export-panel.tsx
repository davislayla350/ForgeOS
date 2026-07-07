"use client";

/**
 * ExportPanel
 * ===========
 *
 * The buttons that let a user take the generated company output home.
 * Sits at the bottom of the Product Showcase, replacing the old
 * "View Code / Download Project (disabled) / Open Preview (disabled)" row.
 *
 * Buttons
 * -------
 *   * Download ZIP        -- full bundle as .zip
 *   * Export README       -- README.md only
 *   * Export Architecture -- Architecture + API Spec
 *   * Export PRD          -- PRD only
 *   * Export Source Code  -- code files only (as .zip)
 *   * Push to GitHub      -- disabled placeholder, feature-detected
 *
 * Each button reflects the *actual* bundle: if the run didn't produce a
 * PRD, the PRD button is disabled with a tooltip explaining why. This
 * avoids "button clicks but nothing happens" bugs when the LLM path was
 * off and only some artifacts landed.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Archive,
  Cloud,
  Code2,
  Download,
  FileArchive,
  FileCode2,
  FileText,
  GitBranch,
  Layers,
} from "lucide-react";
import type { OrchestrationState } from "@/lib/orchestration-types";
import { buildProjectBundle, type BundleCategory } from "@/lib/project-bundle";
import {
  downloadBundleAsZip,
  downloadBundleCategory,
  isGitHubExportAvailable,
} from "@/lib/export-transports";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Small toast for post-download feedback
// ---------------------------------------------------------------------------

type ToastState =
  | { kind: "none" }
  | { kind: "ok"; label: string }
  | { kind: "err"; label: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ExportPanelProps = {
  state: OrchestrationState;
  /** Called when the user hits "View Code" (opens the code explorer). */
  onOpenCodeExplorer?: () => void;
};

export function ExportPanel({ state, onOpenCodeExplorer }: ExportPanelProps) {
  // Assemble the bundle once per render of relevant state. The bundle is
  // small and cheap; re-memoising is fine.
  const bundle = useMemo(() => buildProjectBundle(state), [state]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ kind: "none" });

  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    if (next.kind !== "none") {
      window.setTimeout(() => setToast({ kind: "none" }), 2500);
    }
  }, []);

  // Wrap a single export action with busy-state + toast + error handling.
  const runAction = useCallback(
    async (id: string, label: string, action: () => Promise<void> | void) => {
      if (busy) return;
      setBusy(id);
      try {
        await action();
        showToast({ kind: "ok", label: `${label} downloaded` });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Export failed. Please try again.";
        showToast({ kind: "err", label: msg });
      } finally {
        setBusy(null);
      }
    },
    [busy, showToast]
  );

  const has = useCallback(
    (category: BundleCategory) => bundle.categories[category].length > 0,
    [bundle.categories]
  );

  const githubAvailable = isGitHubExportAvailable();

  return (
    <div className="flex flex-col gap-3 border-t border-border/40 bg-card/40 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-blueprint/70 uppercase">
            Export
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {bundle.files.length} files ready · {bundle.projectName}
          </p>
        </div>
        <Toast state={toast} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* View Code (opens explorer; kept from the old row) */}
        {onOpenCodeExplorer && (
          <ExportButton
            id="view-code"
            label="View Code"
            Icon={FileCode2}
            busy={busy === "view-code"}
            variant="primary"
            onClick={() => onOpenCodeExplorer()}
          />
        )}

        {/* Download the whole thing */}
        <ExportButton
          id="download-zip"
          label="Download ZIP"
          Icon={FileArchive}
          busy={busy === "download-zip"}
          variant="primary"
          onClick={() =>
            runAction("download-zip", "Project ZIP", () =>
              downloadBundleAsZip(bundle)
            )
          }
        />

        {/* Category exports */}
        <ExportButton
          id="export-readme"
          label="Export README"
          Icon={FileText}
          busy={busy === "export-readme"}
          disabled={!has("readme")}
          disabledReason={!has("readme") ? "No README in this bundle." : undefined}
          onClick={() =>
            runAction("export-readme", "README", () =>
              downloadBundleCategory(bundle, "readme")
            )
          }
        />
        <ExportButton
          id="export-architecture"
          label="Export Architecture"
          Icon={Layers}
          busy={busy === "export-architecture"}
          disabled={!has("architecture")}
          disabledReason={
            !has("architecture")
              ? "This run did not produce an Architecture document."
              : undefined
          }
          onClick={() =>
            runAction("export-architecture", "Architecture", () =>
              downloadBundleCategory(bundle, "architecture")
            )
          }
        />
        <ExportButton
          id="export-prd"
          label="Export PRD"
          Icon={FileText}
          busy={busy === "export-prd"}
          disabled={!has("prd")}
          disabledReason={
            !has("prd") ? "This run did not produce a PRD document." : undefined
          }
          onClick={() =>
            runAction("export-prd", "PRD", () =>
              downloadBundleCategory(bundle, "prd")
            )
          }
        />
        <ExportButton
          id="export-source"
          label="Export Source Code"
          Icon={Code2}
          busy={busy === "export-source"}
          disabled={!has("source_code")}
          disabledReason={
            !has("source_code")
              ? "No source code files produced. Check that the Engineer ran."
              : undefined
          }
          onClick={() =>
            runAction("export-source", "Source code", () =>
              downloadBundleCategory(bundle, "source_code")
            )
          }
        />

        {/* Reserved for future GitHub integration */}
        <ExportButton
          id="push-github"
          label="Push to GitHub"
          Icon={GitBranch}
          disabled
          disabledReason={
            githubAvailable
              ? "GitHub push is available."
              : "Coming soon: push this bundle straight to a GitHub repo."
          }
          onClick={() => {
            /* wired when isGitHubExportAvailable() becomes true */
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ExportButtonProps = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "primary" | "secondary";
};

function ExportButton({
  label,
  Icon,
  onClick,
  busy = false,
  disabled = false,
  disabledReason,
  variant = "secondary",
}: ExportButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={disabled ? disabledReason ?? "Unavailable" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
        variant === "primary"
          ? "border-blueprint/40 bg-blueprint/10 text-blueprint hover:bg-blueprint/20"
          : "border-border/40 bg-background/40 text-foreground hover:border-blueprint/40 hover:bg-blueprint/5",
        (isDisabled) && "cursor-not-allowed opacity-50 hover:bg-transparent",
        busy && "animate-pulse"
      )}
    >
      {busy ? (
        <Archive className="size-3.5 animate-pulse" strokeWidth={1.75} />
      ) : (
        <Icon className="size-3.5" strokeWidth={1.75} />
      )}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toast (inline, not a fixed overlay)
// ---------------------------------------------------------------------------

function Toast({ state }: { state: ToastState }) {
  if (state.kind === "none") return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-md border px-2 py-1 font-mono text-[10px] tracking-wider uppercase",
        state.kind === "ok"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-rose-500/40 bg-rose-500/10 text-rose-400"
      )}
    >
      {state.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Unused import placeholders (kept for the tooltip-only Cloud button variant
// if we later want a "Sync to cloud" transport). Deleting them would trigger
// unused-var lint warnings if the icon set changes; keeping them near the
// export interface documents the design intent.
// ---------------------------------------------------------------------------
export const __reserved_icons = { Cloud, Download };
