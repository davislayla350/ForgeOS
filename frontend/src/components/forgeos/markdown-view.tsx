"use client";

/**
 * MarkdownView -- renders artifact content with a blueprint-aesthetic prose
 * style and prism-react-renderer for fenced code blocks.
 *
 * Approach: split the raw markdown on fenced blocks (```) so code and prose are
 * handled separately. Prose gets parsed by ``marked`` and sanitised by
 * DOMPurify (defensive; artifact content is authored by our own agents but
 * belt-and-braces is cheap). Code gets prism-react-renderer with a custom
 * theme that borrows the blueprint palette.
 *
 * Why not react-markdown: pulls in unified/remark/rehype (~120kB gzipped for
 * the tree we'd end up with). marked + DOMPurify is a fraction of that and
 * gives us all the control we actually need.
 */

import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { cn } from "@/lib/utils";

// ForgeOS blueprint palette expressed as a Prism theme.
export const BLUEPRINT_THEME: PrismTheme = {
  plain: {
    color: "oklch(0.90 0.02 220)",
    backgroundColor: "transparent",
  },
  styles: [
    { types: ["comment", "prolog", "cdata"], style: { color: "oklch(0.55 0.03 220)", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "oklch(0.70 0.04 220)" } },
    { types: ["property", "tag", "boolean", "number", "constant", "symbol", "deleted"], style: { color: "oklch(0.75 0.14 40)" } },
    { types: ["selector", "attr-name", "string", "char", "builtin", "inserted"], style: { color: "oklch(0.78 0.13 150)" } },
    { types: ["operator", "entity", "url", "variable"], style: { color: "oklch(0.75 0.10 220)" } },
    { types: ["atrule", "attr-value", "keyword"], style: { color: "oklch(0.72 0.11 210)" } },
    { types: ["function", "class-name"], style: { color: "oklch(0.80 0.14 80)" } },
    { types: ["regex", "important"], style: { color: "oklch(0.72 0.16 15)" } },
  ],
};

type Segment =
  | { kind: "prose"; content: string }
  | { kind: "code"; language: string; content: string };

/** Split markdown into prose segments and fenced-code segments. */
function segmentMarkdown(source: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(source)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "prose", content: source.slice(lastIndex, match.index) });
    }
    segments.push({
      kind: "code",
      language: match[1] || "text",
      content: match[2].replace(/\n$/, ""),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    segments.push({ kind: "prose", content: source.slice(lastIndex) });
  }
  return segments;
}

/** Parse a prose chunk to sanitised HTML. */
function renderProseHtml(prose: string): string {
  // marked v12 returns a Promise if the async option is set; default is sync
  // string, which is what we want.
  const raw = marked.parse(prose, { async: false }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

type MarkdownViewProps = {
  source: string;
  className?: string;
};

export function MarkdownView({ source, className }: MarkdownViewProps) {
  const segments = useMemo(() => segmentMarkdown(source), [source]);

  return (
    <article
      className={cn(
        "prose-forgeos font-sans text-sm leading-relaxed text-foreground",
        className
      )}
    >
      {segments.map((seg, i) =>
        seg.kind === "code" ? (
          <CodeBlock key={i} language={seg.language} content={seg.content} />
        ) : (
          <ProseChunk key={i} content={seg.content} />
        )
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Prose chunk (headings, lists, tables, paragraphs)
// ---------------------------------------------------------------------------

function ProseChunk({ content }: { content: string }) {
  const html = useMemo(() => renderProseHtml(content), [content]);
  return (
    <div
      className={cn(
        "space-y-3",
        // Headings
        "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:font-mono [&_h1]:text-xl [&_h1]:font-medium [&_h1]:tracking-tight [&_h1]:text-foreground",
        "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-mono [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-blueprint",
        "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-mono [&_h3]:text-sm [&_h3]:font-medium [&_h3]:tracking-wide [&_h3]:text-foreground",
        // Paragraphs and inline
        "[&_p]:my-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground",
        "[&_strong]:font-medium [&_strong]:text-foreground",
        "[&_em]:italic [&_em]:text-foreground/90",
        // Lists
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:text-muted-foreground",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-sm [&_ol]:text-muted-foreground",
        "[&_li]:my-0.5",
        "[&_ul>li::marker]:text-blueprint/70",
        "[&_ol>li::marker]:text-blueprint/70 [&_ol>li::marker]:font-mono [&_ol>li::marker]:text-xs",
        // Inline code
        "[&_code]:rounded [&_code]:border [&_code]:border-blueprint/20 [&_code]:bg-blueprint/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-blueprint",
        // Links, blockquotes, hr, tables
        "[&_a]:text-blueprint [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-blueprint/80",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-blueprint/50 [&_blockquote]:pl-3 [&_blockquote]:font-mono [&_blockquote]:text-[13px] [&_blockquote]:text-foreground/80 [&_blockquote]:italic",
        "[&_hr]:my-4 [&_hr]:border-border/40",
        "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-border/40 [&_table]:text-sm",
        "[&_th]:border [&_th]:border-border/40 [&_th]:bg-blueprint/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-mono [&_th]:text-[11px] [&_th]:tracking-wider [&_th]:text-blueprint [&_th]:uppercase",
        "[&_td]:border [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ---------------------------------------------------------------------------
// Code block (prism-react-renderer)
// ---------------------------------------------------------------------------

function CodeBlock({ language, content }: { language: string; content: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-md border border-blueprint/20 bg-blueprint/5">
      <div className="flex items-center justify-between border-b border-blueprint/15 bg-blueprint/10 px-3 py-1">
        <span className="font-mono text-[9px] tracking-widest text-blueprint/80 uppercase">
          {language}
        </span>
      </div>
      <Highlight code={content} language={language} theme={BLUEPRINT_THEME}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "overflow-x-auto p-3 font-mono text-[12px] leading-relaxed",
              className
            )}
            style={{ ...style, background: "transparent" }}
          >
            {tokens.map((line, i) => {
              const lineProps = getLineProps({ line });
              return (
                <div key={i} {...lineProps}>
                  <span className="mr-3 inline-block w-6 text-right text-[10px] text-muted-foreground/50 select-none">
                    {i + 1}
                  </span>
                  {line.map((token, j) => (
                    <span key={j} {...getTokenProps({ token })} />
                  ))}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
