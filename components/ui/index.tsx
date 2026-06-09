import type { ReactNode } from "react";
import type { BiasLean, DataSourceKind } from "@/types";
import { LEAN_LABEL } from "@/lib/bias";
import { classNames } from "@/lib/format";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={classNames("card", className)}>{children}</div>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-[var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />
      {label}
    </div>
  );
}

export function SourceBadge({
  source,
  note,
}: {
  source: DataSourceKind;
  note?: string;
}) {
  const live = source === "live";
  return (
    <span
      title={note}
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        live
          ? "bg-green-500/15 text-green-300"
          : "bg-slate-500/15 text-slate-300",
      )}
    >
      <span
        className={classNames(
          "h-2 w-2 rounded-full",
          live ? "bg-green-400" : "bg-slate-400",
        )}
      />
      {live ? "Live" : "Sample data"}
    </span>
  );
}

const LEAN_CLASS: Record<BiasLean, string> = {
  left: "bg-blue-600/20 text-blue-300 border-blue-500/40",
  "lean-left": "bg-sky-500/15 text-sky-300 border-sky-400/40",
  center: "bg-neutral-500/20 text-neutral-300 border-neutral-400/40",
  "lean-right": "bg-red-400/15 text-red-300 border-red-400/40",
  right: "bg-red-600/20 text-red-300 border-red-500/40",
  unknown: "bg-slate-600/20 text-slate-400 border-slate-500/40",
};

export function BiasBadge({ lean }: { lean: BiasLean }) {
  return (
    <span
      className={classNames(
        "rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
        LEAN_CLASS[lean],
      )}
    >
      {LEAN_LABEL[lean]}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      {right}
    </header>
  );
}
