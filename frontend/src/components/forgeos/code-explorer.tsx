"use client";

/**
 * CodeExplorer
 * ============
 *
 * A VS-Code-shaped file explorer overlay that opens from the Product
 * Showcase. Three panes stacked in a modal shell:
 *
 *   Header   -- current path, language tag, copy button, close button.
 *   Sidebar  -- folder tree built from the flat list of file paths.
 *   Content  -- line-numbered, syntax-highlighted view of the active file.
 *
 * Reused primitives
 * -----------------
 *   * Base UI Dialog for the modal shell (backdrop, focus trap, escape).
 *   * Framer Motion for the enter/exit and file swap transitions.
 *   * prism-react-renderer's ``Highlight`` with our exported blueprint
 *     theme, so colours match everything else in ForgeOS.
 *
 * Design intent
 * -------------
 *   * Feel VS-Code-y without pretending to be it. No LSP, no tabs, no
 *     Command Palette. Judges recognise the shape immediately, but the
 *     surface is honest about what it is: a viewer for the six starter
 *     files ForgeOS just generated.
 *   * Folder tree is derived from paths, not from a hand-authored structure.
 *     Adding a new file to the bundle later needs zero explorer changes.
 *   * Every path a user could click on the tree resolves to a real file.
 *     No dead nodes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog } from "@base-ui/react/dialog";
import { Highlight, type Language } from "prism-react-renderer";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  File as FileIcon,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  X,
} from "lucide-react";
import type { GeneratedFile } from "@/lib/generated-files";
import { buildTree, collectDirPaths, type TreeFile, type TreeNode } from "@/lib/code-tree";
import { cn } from "@/lib/utils";
import { BLUEPRINT_THEME } from "@/components/forgeos/markdown-view";

// ---------------------------------------------------------------------------
// Language mapping for the Prism highlighter
// ---------------------------------------------------------------------------

/**
 * Map our GeneratedFile language tags to Prism languages. Prism has a
 * built-in list; anything we don't map falls through to ``markup`` which
 * still renders plain text safely.
 */
function toPrismLanguage(language: GeneratedFile["language"]): Language {
  switch (language) {
    case "tsx":
      return "tsx";
    case "ts":
      return "typescript";
    case "python":
      return "python";
    case "sql":
      return "sql";
    case "json":
      return "json";
    case "markdown":
      return "markdown";
    case "text":
    default:
      return "markup";
  }
}

/** Icon per language, so the tree feels file-typed. */
function iconFor(node: TreeFile): React.ComponentType<{ className?: string; strokeWidth?: number }> {
  if (node.language === "json") return FileJson;
  if (node.language === "markdown") return FileText;
  if (
    node.language === "tsx" ||
    node.language === "ts" ||
    node.language === "python" ||
    node.language === "sql"
  ) {
    return FileCode;
  }
  return FileIcon;
}

// ---------------------------------------------------------------------------
// Copy button (with success state)
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // clipboard permission denied; nothing we can do gracefully
    }
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy file contents"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase transition-colors",
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-blueprint/30 bg-blueprint/5 text-blueprint hover:bg-blueprint/10"
      )}
    >
      {copied ? (
        <>
          <Check className="size-3" strokeWidth={2} />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" strokeWidth={1.75} />
          Copy
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tree row (file or folder)
// ---------------------------------------------------------------------------

type TreeRowProps = {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
};

function TreeRow({ node, depth, activePath, expanded, onToggle, onSelect }: TreeRowProps) {
  if (node.kind === "dir") {
    const isOpen = expanded.has(node.path);
    return (
      <li>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="flex w-full items-center gap-1 px-2 py-0.5 text-left transition-colors hover:bg-muted/30"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {isOpen ? (
            <ChevronDown className="size-3 text-muted-foreground" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" strokeWidth={1.75} />
          )}
          {isOpen ? (
            <FolderOpen className="size-3.5 text-blueprint/70" strokeWidth={1.75} />
          ) : (
            <Folder className="size-3.5 text-blueprint/70" strokeWidth={1.75} />
          )}
          <span className="font-mono text-[11px] text-foreground">{node.name}</span>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {node.children.map((child) => (
                <TreeRow
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  activePath={activePath}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </li>
    );
  }
  const Icon = iconFor(node);
  const isActive = activePath === node.path;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-0.5 text-left transition-colors",
          isActive
            ? "bg-blueprint/15 text-blueprint"
            : "text-foreground hover:bg-muted/30"
        )}
        style={{ paddingLeft: 8 + depth * 12 + 12 }}
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
        <span className="truncate font-mono text-[11px]">{node.name}</span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Code pane
// ---------------------------------------------------------------------------

function CodePane({ file }: { file: GeneratedFile }) {
  const language = toPrismLanguage(file.language);
  return (
    <motion.div
      key={file.path}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="h-full overflow-auto bg-background/30 font-mono text-[12px] leading-relaxed"
    >
      <Highlight code={file.content} language={language} theme={BLUEPRINT_THEME}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "m-0 flex min-h-full p-0",
              className
            )}
            style={{ ...style, backgroundColor: "transparent" }}
          >
            {/* Gutter */}
            <div
              aria-hidden
              className="sticky left-0 shrink-0 select-none border-r border-border/40 bg-background/70 px-3 py-4 text-right font-mono text-[10px] text-muted-foreground/60 backdrop-blur-sm"
            >
              {tokens.map((_, i) => (
                <div key={i} className="tabular-nums leading-relaxed">
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Code */}
            <code className="block px-4 py-4">
              {tokens.map((line, i) => {
                // getLineProps returns the pre-line span props including a
                // class; we spread and override styling minimally.
                const lineProps = getLineProps({ line });
                return (
                  <div key={i} {...lineProps} className={cn(lineProps.className, "whitespace-pre")}>
                    {line.map((token, j) => (
                      <span key={j} {...getTokenProps({ token })} />
                    ))}
                  </div>
                );
              })}
            </code>
          </pre>
        )}
      </Highlight>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Explorer
// ---------------------------------------------------------------------------

type CodeExplorerProps = {
  files: GeneratedFile[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Path to focus on open. Falls back to the first file if not present. */
  initialPath?: string | null;
  /** Optional project name for the sidebar header. */
  projectName?: string;
};

export function CodeExplorer({
  files,
  open,
  onOpenChange,
  initialPath,
  projectName,
}: CodeExplorerProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const fileByPath = useMemo(() => {
    const map = new Map<string, GeneratedFile>();
    for (const f of files) map.set(f.path, f);
    return map;
  }, [files]);

  const firstPath = files[0]?.path ?? null;
  const [activePath, setActivePath] = useState<string | null>(
    initialPath ?? firstPath
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectDirPaths(tree))
  );

  // Re-focus the requested file every time the explorer is opened. Without
  // this, opening the explorer, clicking a different file, closing, and
  // opening from a different card would land on the wrong file.
  useEffect(() => {
    if (!open) return;
    if (initialPath && fileByPath.has(initialPath)) {
      setActivePath(initialPath);
    } else if (!activePath && firstPath) {
      setActivePath(firstPath);
    }
    // Ensure every directory on the ancestry of the active file is expanded.
    const target = initialPath ?? activePath;
    if (target) {
      const parts = target.split("/").filter(Boolean);
      const parents: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        parents.push(parts.slice(0, i).join("/"));
      }
      if (parents.length > 0) {
        setExpanded((prev) => {
          const next = new Set(prev);
          for (const p of parents) next.add(p);
          return next;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const select = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  const activeFile = activePath ? fileByPath.get(activePath) ?? null : null;

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
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[min(96vw,1080px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-blueprint/40 bg-card shadow-2xl"
            />
          }
        >
          {/* Header (VS Code-ish title bar) */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card/80 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-2 min-w-0">
              <span className="pointer-events-none font-mono text-[9px] tracking-[0.28em] text-blueprint/60 uppercase">
                Code Explorer
              </span>
              {activeFile && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <Dialog.Title
                    render={
                      <span className="truncate font-mono text-[11px] text-foreground" />
                    }
                  >
                    {activeFile.path}
                  </Dialog.Title>
                  <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                    {activeFile.language}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeFile && <CopyButton text={activeFile.content} />}
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
          </div>

          {/* Body: sidebar + code pane */}
          <div className="flex min-h-0 flex-1">
            {/* Sidebar */}
            <aside className="flex w-56 shrink-0 flex-col border-r border-border/50 bg-card/40">
              <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2">
                <Folder className="size-3 text-blueprint" strokeWidth={1.75} />
                <span className="truncate font-mono text-[10px] tracking-widest text-blueprint uppercase">
                  {projectName ?? "Explorer"}
                </span>
              </div>
              <ul className="flex-1 overflow-y-auto py-2">
                {tree.map((node) => (
                  <TreeRow
                    key={node.path}
                    node={node}
                    depth={0}
                    activePath={activePath}
                    expanded={expanded}
                    onToggle={toggle}
                    onSelect={select}
                  />
                ))}
              </ul>
              <div className="border-t border-border/40 px-3 py-2 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                {files.length} file{files.length === 1 ? "" : "s"}
              </div>
            </aside>

            {/* Code */}
            <section className="min-w-0 flex-1 overflow-hidden">
              {activeFile ? (
                <AnimatePresence mode="wait">
                  <CodePane key={activeFile.path} file={activeFile} />
                </AnimatePresence>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground/70 uppercase">
                    Select a file to view its contents
                  </p>
                </div>
              )}
            </section>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
