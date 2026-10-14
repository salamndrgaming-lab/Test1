"use client";

import { useLibrary } from "@/lib/useLibrary";
import { readingDiversity } from "@/lib/diversity";

const GRADE_COLOR: Record<string, string> = {
  Broad: "#22c55e",
  Mixed: "#f59e0b",
  Narrow: "#ef4444",
};

/** A radial gauge for the 0-100 diversity score. */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--surface-3)" strokeWidth={9} />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth={9}
        strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="42" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text)">
        {score}
      </text>
      <text x="44" y="56" textAnchor="middle" fontSize="9" fill="#93a0b4">
        / 100
      </text>
    </svg>
  );
}

/**
 * How varied the user's reading is — the companion to My News Bias. Bias says
 * which way you lean; this says how narrow the diet is.
 */
export function SourceDiversity() {
  const { history } = useLibrary();
  const d = readingDiversity(history);

  if (!d.enough) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Read a handful of stories and we&apos;ll score how varied your sources
        are — how many outlets you actually read, and how evenly you span the
        spectrum.
      </p>
    );
  }

  const color = GRADE_COLOR[d.grade];

  return (
    <div>
      <div className="flex items-center gap-4">
        <ScoreRing score={d.score} color={color} />
        <div className="min-w-0">
          <p className="font-serif text-lg font-medium" style={{ color }}>
            {d.grade} diet
          </p>
          <p className="text-sm text-[var(--muted)]">
            {d.outlets} outlets across {d.leansCovered} of 3 sides, over{" "}
            {d.articles} reads.
          </p>
          {d.topOutlet && d.topOutlet.share > 0.3 && (
            <p className="mt-1 text-xs text-[var(--muted-2)]">
              {Math.round(d.topOutlet.share * 100)}% of your reading comes from{" "}
              <span className="font-semibold text-[var(--text)]">
                {d.topOutlet.name}
              </span>
              .
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-[var(--surface-2)] p-2">
          <p className="text-[var(--muted-2)]">Effective outlets</p>
          <p className="text-base font-semibold tabular-nums">
            {d.effectiveOutlets}
          </p>
          <p className="text-[0.65rem] text-[var(--muted-2)]">
            of {d.outlets} read — weighted by how often
          </p>
        </div>
        <div className="rounded-lg bg-[var(--surface-2)] p-2">
          <p className="text-[var(--muted-2)]">Spectrum balance</p>
          <p className="text-base font-semibold tabular-nums">
            {Math.round(d.leanBalance * 100)}%
          </p>
          <p className="text-[0.65rem] text-[var(--muted-2)]">
            100% = even across left, center, right
          </p>
        </div>
      </div>
    </div>
  );
}
