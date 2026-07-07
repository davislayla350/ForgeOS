import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelShellProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  /** fixed height for equal-sized dashboard panels */
  fixedHeight?: boolean;
};

export function PanelShell({
  title,
  subtitle,
  icon,
  badge,
  children,
  className,
  fixedHeight = false,
}: PanelShellProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/60 backdrop-blur-sm",
        fixedHeight && "h-[320px]",
        className
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-blueprint/30 bg-blueprint/5 text-blueprint">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate font-mono text-xs font-medium tracking-wider text-foreground uppercase">
              {title}
            </h2>
            {subtitle && (
              <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {badge}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  );
}
