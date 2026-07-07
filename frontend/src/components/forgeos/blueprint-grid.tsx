import { cn } from "@/lib/utils";

type BlueprintGridProps = {
  className?: string;
};

export function BlueprintGrid({ className }: BlueprintGridProps) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="blueprint-grid absolute inset-0 opacity-40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--blueprint-glow)_0%,_transparent_60%)]" />
      <div className="blueprint-corner absolute top-4 left-4 size-8 border-t border-l border-blueprint/50" />
      <div className="blueprint-corner absolute top-4 right-4 size-8 border-t border-r border-blueprint/50" />
      <div className="blueprint-corner absolute bottom-4 left-4 size-8 border-b border-l border-blueprint/50" />
      <div className="blueprint-corner absolute bottom-4 right-4 size-8 border-b border-r border-blueprint/50" />
    </div>
  );
}
