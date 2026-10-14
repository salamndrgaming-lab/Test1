import type { SgpLeg } from "@/types";
import { LEAGUE_MODEL } from "@/lib/sgp";

interface Shape {
  /** Centre of the projected distribution. */
  mean: number;
  sigma: number;
  /** The value the outcome must clear. */
  boundary: number;
  /** True when the leg wins above the boundary. */
  winAbove: boolean;
  /** Axis description for the caption. */
  caption: React.ReactNode;
}

/**
 * Draws the model's projected distribution for a leg and shades the region
 * where the leg wins. Turns an invisible number into something you can
 * actually inspect: where the line sits, how far the projection is from it,
 * and how much of the curve that leaves you.
 *
 * Handles both axes the model works on — a game's margin, and its total.
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
      mean: m,
      sigma: meta.sigma,
      // Both constraints are expressed on the HOME margin axis.
      boundary: isHome ? (meta.threshold ?? 0) : -(meta.threshold ?? 0),
      winAbove: isHome,
      caption: (
        <>
          Projected margin{" "}
          <span className="font-semibold text-[var(--text)]">
            {Math.abs(m).toFixed(1)} {unit}
          </span>{" "}
          toward the {m >= 0 ? "home" : "away"} team, σ {meta.sigma} {unit}.
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
      mean: meta.totalMean,
      sigma: meta.totalSigma,
      boundary: meta.totalLine,
      winAbove: meta.side !== "under",
      caption: (
        <>
          Projected total{" "}
          <span className="font-semibold text-[var(--text)]">
            {meta.totalMean.toFixed(1)} {unit}
          </span>{" "}
          against a posted {meta.totalLine}, σ {meta.totalSigma} {unit}.
        </>
      ),
    };
  }

  if (!shape) return null;

  const { mean: m, sigma, boundary, winAbove } = shape;

  const W = 320;
  const H = 110;
  const pad = 14;
  const xmin = m - 3.2 * sigma;
  const xmax = m + 3.2 * sigma;
  const span = xmax - xmin || 1;

  const toX = (v: number) => pad + ((v - xmin) / span) * (W - pad * 2);
  const pdf = (v: number) => Math.exp(-0.5 * ((v - m) / sigma) ** 2);
  const toY = (v: number) => H - pad - pdf(v) * (H - pad * 2);

  const N = 140;
  const xs = Array.from({ length: N + 1 }, (_, i) => xmin + (span * i) / N);
  const curve = xs.map((v) => `${toX(v).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  // Shade only the winning side of the boundary.
  const winXs = xs.filter((v) => (winAbove ? v >= boundary : v <= boundary));
  const baseY = H - pad;
  const shade =
    winXs.length > 1
      ? `M ${toX(winXs[0]).toFixed(1)},${baseY} ` +
        winXs.map((v) => `L ${toX(v).toFixed(1)},${toY(v).toFixed(1)}`).join(" ") +
        ` L ${toX(winXs[winXs.length - 1]).toFixed(1)},${baseY} Z`
      : "";

  const clampedBoundaryX = toX(Math.max(xmin, Math.min(xmax, boundary)));
  const projX = toX(m);

  return (
    <div className="mt-2 rounded-lg bg-[var(--surface-2)] p-2.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Projected distribution; leg wins ${(leg.modelProbability * 100).toFixed(0)}% of the time`}>
        {shade && <path d={shade} fill="var(--accent)" opacity={0.22} />}
        <polyline points={curve} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {/* baseline */}
        <line x1={pad} y1={baseY} x2={W - pad} y2={baseY} stroke="#283143" strokeWidth={1} />
        {/* the line you must beat */}
        <line
          x1={clampedBoundaryX} y1={pad - 6} x2={clampedBoundaryX} y2={baseY}
          stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3"
        />
        {/* model projection */}
        <line
          x1={projX} y1={pad - 2} x2={projX} y2={baseY}
          stroke="#e7ecf3" strokeWidth={1.5} opacity={0.75}
        />
        <text x={clampedBoundaryX} y={pad - 8} fontSize={9} fill="#f59e0b" textAnchor="middle">
          line
        </text>
        <text x={projX} y={H - 2} fontSize={9} fill="#93a0b4" textAnchor="middle">
          proj
        </text>
      </svg>
      <p className="mt-1 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
        {shape.caption} The shaded area —{" "}
        <span className="font-semibold text-[var(--accent)]">
          {(leg.modelProbability * 100).toFixed(1)}%
        </span>{" "}
        of outcomes — is where this leg wins.
      </p>
    </div>
  );
}
