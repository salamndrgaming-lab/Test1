import type { SgpLeg } from "@/types";
import { LEAGUE_MODEL } from "@/lib/sgp";
import {
  buildScoreGrid,
  gridMarginDist,
  gridTotalDist,
  type DiscreteDist,
} from "@/lib/distributions";

const FAMILY_LABEL: Record<string, string> = {
  skellam: "difference of two Poissons",
  "key-number": "key-number weighted",
  normal: "discretized normal",
  poisson: "Poisson",
};

interface Shape {
  dist: DiscreteDist;
  /** The value the outcome must clear. */
  boundary: number;
  /** True when the leg wins above the boundary. */
  winAbove: boolean;
  caption: React.ReactNode;
}

/**
 * The model's actual probability mass for a leg, with the winning side shaded.
 *
 * This draws the real distribution rather than a bell curve, so what the
 * model believes is visible: the spikes at 3 and 7 in a football margin, the
 * handful of discrete outcomes in a hockey game, and the bar sitting exactly
 * on the line that would push.
 */
export function MarginCurve({ leg }: { leg: SgpLeg }) {
  const meta = leg.modelMeta;
  const unit = LEAGUE_MODEL[leg.league]?.unit ?? "pts";
  if (!meta) return null;

  let shape: Shape | null = null;

  if (meta.kind === "margin" && meta.sigma != null) {
    const m = meta.blendedMargin ?? 0;
    const isHome = meta.side === "home";
    shape = {
      // Marginalized from the same joint score grid the model priced with.
      dist: gridMarginDist(
        buildScoreGrid({
          league: leg.league,
          margin: m,
          total: meta.gridTotal ?? m,
          marginSd: meta.sigma,
          totalSd: meta.totalSigma ?? meta.sigma,
          lambdaHome: meta.lambdaHome,
          lambdaAway: meta.lambdaAway,
        }),
      ),
      // Both constraints are expressed on the HOME margin axis.
      boundary: isHome ? (meta.threshold ?? 0) : -(meta.threshold ?? 0),
      winAbove: isHome,
      caption: (
        <>
          Projected margin{" "}
          <span className="font-semibold text-[var(--text)]">
            {Math.abs(m).toFixed(1)} {unit}
          </span>{" "}
          toward the {m >= 0 ? "home" : "away"} team.
        </>
      ),
    };
  } else if (
    meta.kind === "total" &&
    meta.totalMean != null &&
    meta.totalSigma != null &&
    meta.totalLine != null
  ) {
    shape = {
      dist: gridTotalDist(
        buildScoreGrid({
          league: leg.league,
          margin: meta.gridMargin ?? 0,
          total: meta.totalMean,
          marginSd: meta.sigma ?? 1,
          totalSd: meta.totalSigma,
          lambdaHome: meta.lambdaHome,
          lambdaAway: meta.lambdaAway,
        }),
      ),
      boundary: meta.totalLine,
      winAbove: meta.side !== "under",
      caption: (
        <>
          Projected total{" "}
          <span className="font-semibold text-[var(--text)]">
            {meta.totalMean.toFixed(1)} {unit}
          </span>{" "}
          against a posted {meta.totalLine}.
        </>
      ),
    };
  }

  if (!shape) return null;

  const { dist, boundary, winAbove } = shape;

  // Trim the negligible tails so the bars that matter are readable.
  const points = dist.support().filter((d) => d.p > 0.0004);
  if (points.length === 0) return null;
  const peak = Math.max(...points.map((d) => d.p));

  const W = 320;
  const H = 110;
  const pad = 14;
  const baseY = H - pad;
  const plotW = W - pad * 2;
  const barW = Math.max(1.2, plotW / points.length - 0.8);
  const xAt = (i: number) => pad + (i + 0.5) * (plotW / points.length);
  const hAt = (p: number) => (p / peak) * (H - pad * 2);

  // Where the line sits, on the same axis.
  const boundaryIdx = points.findIndex((d) => d.k >= boundary);
  const boundaryX =
    boundaryIdx < 0
      ? W - pad
      : xAt(boundaryIdx) - (Number.isInteger(boundary) ? 0 : plotW / points.length / 2);

  const pushMass = dist.at(boundary);
  const familyNote = FAMILY_LABEL[dist.family] ?? dist.family;

  return (
    <div className="mt-2 rounded-lg bg-[var(--surface-2)] p-2.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Projected distribution; leg wins ${(leg.modelProbability * 100).toFixed(0)}% of the time`}
      >
        {points.map((d, i) => {
          const isPush = Number.isInteger(boundary) && d.k === boundary;
          const wins = winAbove ? d.k > boundary : d.k < boundary;
          return (
            <rect
              key={d.k}
              x={xAt(i) - barW / 2}
              y={baseY - hAt(d.p)}
              width={barW}
              height={hAt(d.p)}
              fill={isPush ? "#f59e0b" : "var(--accent)"}
              opacity={isPush ? 0.9 : wins ? 0.85 : 0.22}
            />
          );
        })}

        <line x1={pad} y1={baseY} x2={W - pad} y2={baseY} stroke="#283143" strokeWidth={1} />
        <line
          x1={boundaryX}
          y1={pad - 6}
          x2={boundaryX}
          y2={baseY}
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        <text x={boundaryX} y={pad - 8} fontSize={9} fill="#f59e0b" textAnchor="middle">
          line
        </text>
      </svg>

      <p className="mt-1 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
        {shape.caption} Each bar is one possible final {meta.kind === "total" ? "total" : "margin"} (
        {familyNote}). The solid bars —{" "}
        <span className="font-semibold text-[var(--accent)]">
          {(leg.modelProbability * 100).toFixed(1)}%
        </span>{" "}
        of outcomes once pushes are excluded — are where this leg wins
        {pushMass > 0.005 ? (
          <>
            , and the amber bar is the{" "}
            <span className="font-semibold text-amber-300">
              {(pushMass * 100).toFixed(1)}%
            </span>{" "}
            chance of landing exactly on the number
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
