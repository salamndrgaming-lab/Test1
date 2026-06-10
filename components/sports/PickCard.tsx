import type { SgpLeg } from "@/types";
import { formatOdds, formatPct, classNames } from "@/lib/format";
import { legEdge } from "@/lib/sgp";

const CONF_CLASS = {
  high: "bg-green-500/15 text-green-300",
  medium: "bg-amber-500/15 text-amber-300",
  low: "bg-slate-500/15 text-slate-300",
};

export function PickCard({
  leg,
  selected,
  onToggle,
}: {
  leg: SgpLeg;
  selected: boolean;
  onToggle: () => void;
}) {
  const edge = legEdge(leg);
  return (
    <div
      className={classNames(
        "card transition-colors",
        selected ? "border-sky-400/60" : "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{leg.matchup}</span>
            <span>·</span>
            <span>{leg.market}</span>
          </div>
          <h4 className="font-semibold leading-snug">{leg.selection}</h4>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-semibold tabular-nums">
          {formatOdds(leg.americanOdds)}
        </span>
        <span className={classNames("rounded px-2 py-0.5", CONF_CLASS[leg.confidence])}>
          {leg.confidence} confidence
        </span>
        <span
          className={classNames(
            "rounded px-2 py-0.5 tabular-nums",
            edge >= 0 ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300",
          )}
          title="Model probability minus odds-implied probability"
        >
          edge {edge >= 0 ? "+" : ""}
          {formatPct(edge)}
        </span>
      </div>

      <p className="mt-2 text-sm text-[var(--muted)]">{leg.rationale}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {leg.supportingStats.map((s) => (
          <span
            key={s.label}
            className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[0.7rem]"
          >
            <span className="text-[var(--muted)]">{s.label}: </span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </span>
        ))}
      </div>

      {leg.references.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem]">
          <span className="text-[var(--muted)]">Sources:</span>
          {leg.references.map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline underline-offset-2"
            >
              {r.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
