import type { CoverageSnapshot } from "@/lib/useFollows";
import type { LeanColumn } from "@/lib/blindspot";

export interface MomentumPoint {
  label: string;
  left: number;
  center: number;
  right: number;
  total: number;
}

export interface MomentumResult {
  points: MomentumPoint[];
  /** Percent change in total coverage from the first snapshot to the latest. */
  totalChangePct: number | null;
  direction: "rising" | "falling" | "steady" | null;
  /** The lean whose share of coverage moved the most. */
  driver: LeanColumn | null;
  /** Percentage-point change in each lean's SHARE of coverage. */
  shareShift: Record<LeanColumn, number>;
  latestTotal: number;
  enoughData: boolean;
}

const LEANS: LeanColumn[] = ["left", "center", "right"];

function share(s: CoverageSnapshot, lean: LeanColumn): number {
  const total = s.left + s.center + s.right;
  if (total <= 0) return 0;
  return s[lean] / total;
}

/**
 * Turn the dated coverage snapshots of a followed story into a momentum read:
 * is this story growing or fading, and which side is driving the change?
 *
 * Share shift matters more than raw counts — a story can hold steady overall
 * while one side quietly picks it up and another drops it.
 */
export function storyMomentum(snapshots: CoverageSnapshot[]): MomentumResult {
  const sorted = [...snapshots].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const points: MomentumPoint[] = sorted.map((s) => ({
    label: new Date(s.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    left: s.left,
    center: s.center,
    right: s.right,
    total: s.left + s.center + s.right,
  }));

  const empty: Record<LeanColumn, number> = { left: 0, center: 0, right: 0 };
  if (sorted.length < 2) {
    return {
      points,
      totalChangePct: null,
      direction: null,
      driver: null,
      shareShift: empty,
      latestTotal: points.at(-1)?.total ?? 0,
      enoughData: false,
    };
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstTotal = first.left + first.center + first.right;
  const lastTotal = last.left + last.center + last.right;

  const totalChangePct =
    firstTotal > 0 ? ((lastTotal - firstTotal) / firstTotal) * 100 : null;
  const direction =
    totalChangePct === null
      ? null
      : totalChangePct > 15
        ? "rising"
        : totalChangePct < -15
          ? "falling"
          : "steady";

  const shareShift = { ...empty };
  for (const lean of LEANS) {
    shareShift[lean] = (share(last, lean) - share(first, lean)) * 100;
  }
  const driver = LEANS.reduce((a, b) =>
    Math.abs(shareShift[b]) > Math.abs(shareShift[a]) ? b : a,
  );

  return {
    points,
    totalChangePct,
    direction,
    driver: Math.abs(shareShift[driver]) >= 5 ? driver : null,
    shareShift,
    latestTotal: lastTotal,
    enoughData: true,
  };
}
