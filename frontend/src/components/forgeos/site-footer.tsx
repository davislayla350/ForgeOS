import Link from "next/link";

/** Inline brand glyphs; lucide-react v1 no longer ships brand icons. */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

/**
 * SiteFooter
 *
 * Global footer rendered on every page via the root layout. Matches the
 * existing blueprint design system: hairline top border, mono microtype,
 * muted foreground, blueprint accent on hover.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-10 shrink-0 border-t border-border/40 bg-background px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <p className="font-mono text-[11px] tracking-wide text-foreground/80">
            ForgeOS &copy; 2026 LayLa Davis
          </p>
          <p className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            AI-powered product planning and prototyping agent
          </p>
        </div>

        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
        >
          <a
            href="https://github.com/davislayla350"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-blueprint"
          >
            <GitHubIcon className="size-3.5" />
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/layla-davis3/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-blueprint"
          >
            <LinkedInIcon className="size-3.5" />
            LinkedIn
          </a>
          <Link
            href="/privacy"
            className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-blueprint"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-blueprint"
          >
            Terms of Service
          </Link>
        </nav>
      </div>

      <p className="mt-3 text-center font-mono text-[10px] tracking-[0.25em] text-muted-foreground/70 uppercase">
        Precision-built software, blueprint by blueprint
      </p>
    </footer>
  );
}
