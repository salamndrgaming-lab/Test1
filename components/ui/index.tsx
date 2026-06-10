import type { ReactNode } from "react";
import type { BiasLean, DataSourceKind } from "@/types";
import { LEAN_LABEL } from "@/lib/bias";
import { classNames } from "@/lib/format";

export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={classNames("card", hover && "card-hover", className)}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-[var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      {label}
    </div>
  );
}

/** Shimmering placeholder used while live data loads. */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="flex gap-2">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-20" />
          </div>
          <div className="skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      ))}
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
        live ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300",
      )}
    >
      <span
        className={classNames(
          "h-2 w-2 rounded-full",
          live ? "bg-green-400" : "bg-red-400",
        )}
      />
      {live ? "Live" : "Unavailable"}
    </span>
  );
}

/** Shown when a live source can't be reached — no sample data is substituted. */
export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-[var(--muted)]">
        {message ?? "Couldn't load live data right now."}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          Retry
        </button>
      )}
    </div>
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
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="gradient-text text-[1.75rem] font-extrabold leading-tight tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-prose text-sm text-[var(--muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="shrink-0 pt-1">{right}</div>}
    </header>
  );
}
