import type { Confidence, Game, MarketOdds, SgpLeg, SgpRecommendation } from "@/types";
import { formatOdds } from "@/lib/format";

export const SGP_DISCLAIMER =
  "For informational and educational purposes only. This is not betting or " +
  "financial advice and does not guarantee any outcome. Odds and stats are " +
  "illustrative. Must be 21+ (or legal age in your jurisdiction). If you or " +
  "someone you know has a gambling problem, call 1-800-GAMBLER.";

/** American odds -> decimal odds. */
export function americanToDecimal(american: number): number {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

/** Decimal odds -> American odds. */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

/** Implied probability from decimal odds. */
export function impliedProbability(decimal: number): number {
  return 1 / decimal;
}

/** Combine independent legs into a parlay's decimal odds. */
export function combineLegs(legs: SgpLeg[]): number {
  return legs.reduce(
    (acc, leg) => acc * americanToDecimal(leg.americanOdds),
    1,
  );
}

export interface PayoutBreakdown {
  stake: number;
  decimalOdds: number;
  americanOdds: number;
  payout: number; // total returned
  profit: number; // payout - stake
  impliedProbability: number;
}

export function calculatePayout(stake: number, legs: SgpLeg[]): PayoutBreakdown {
  const decimalOdds = combineLegs(legs);
  const payout = stake * decimalOdds;
  return {
    stake,
    decimalOdds: Number(decimalOdds.toFixed(2)),
    americanOdds: decimalToAmerican(decimalOdds),
    payout: Number(payout.toFixed(2)),
    profit: Number((payout - stake).toFixed(2)),
    impliedProbability: Number(impliedProbability(decimalOdds).toFixed(4)),
  };
}

/**
 * Transparent "edge" score for a leg: how much the model's estimated
 * probability exceeds the odds-implied probability. Higher = better value.
 */
export function legEdge(leg: SgpLeg): number {
  const implied = impliedProbability(americanToDecimal(leg.americanOdds));
  return Number((leg.modelProbability - implied).toFixed(4));
}

/**
 * Build a recommendation from a candidate pool: rank by edge, take top N (>=6),
 * and compute combined odds/probabilities. Pure + deterministic for a given pool.
 */
export function buildRecommendation(
  candidates: SgpLeg[],
  minLegs = 6,
  cap = 10,
): SgpRecommendation {
  const ranked = [...candidates].sort((a, b) => legEdge(b) - legEdge(a));
  const target = Math.min(cap, Math.max(minLegs, Math.min(8, ranked.length)));
  const legs = ranked.slice(0, target);
  const combinedDecimalOdds = combineLegs(legs);
  const modelProbability = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  return {
    id: `sgp-${legs.map((l) => l.id).join("-").slice(0, 40)}`,
    title: `${legs.length}-Leg Cross-Game Research Slip`,
    legs,
    combinedDecimalOdds: Number(combinedDecimalOdds.toFixed(2)),
    combinedAmericanOdds: decimalToAmerican(combinedDecimalOdds),
    impliedProbability: Number(
      impliedProbability(combinedDecimalOdds).toFixed(4),
    ),
    modelProbability: Number(modelProbability.toFixed(4)),
    disclaimer: SGP_DISCLAIMER,
  };
}

// ---------- Build legs from REAL, current ESPN games + odds ----------

/** Wins / total games from a record like "41-15" or "34-16-5" (NHL). */
function winPct(record?: string): number | null {
  if (!record) return null;
  const nums = record.split("-").map((n) => Number(n.trim()));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return nums[0] / total;
}

function confidenceFor(modelProb: number, hasRecords: boolean): Confidence {
  if (hasRecords && modelProb >= 0.66) return "high";
  if (modelProb >= 0.57) return "medium";
  return "low";
}

/**
 * Turn upcoming/live games with real odds into moneyline-favorite research
 * legs. The model probability is a TRANSPARENT heuristic that blends the
 * odds-implied probability with the teams' season win% and home advantage —
 * disclosed, not a black box — so the "edge" shown is honest and reproducible.
 */
export function legsFromGames(
  games: Game[],
  odds: MarketOdds[],
  gameLinks: Record<string, string> = {},
): SgpLeg[] {
  const oddsByGame = new Map(odds.map((o) => [o.gameId, o]));
  const legs: SgpLeg[] = [];

  for (const g of games) {
    if (g.status === "final") continue; // only recent/upcoming
    const o = oddsByGame.get(g.id);
    if (!o) continue;

    const matchup = `${g.away.abbreviation} @ ${g.home.abbreviation}`;
    const ref = gameLinks[g.id]
      ? { label: "ESPN — Game preview & odds", url: gameLinks[g.id] }
      : { label: "ESPN — Scoreboard", url: "https://www.espn.com/" };

    // determine favorite side from available signals
    const favIsHome =
      o.favorite === "home"
        ? true
        : o.favorite === "away"
          ? false
          : o.homeMoneyline != null && o.awayMoneyline != null
            ? o.homeMoneyline <= o.awayMoneyline
            : (o.spread ?? 0) <= 0;
    const favTeam = favIsHome ? g.home : g.away;
    const dogTeam = favIsHome ? g.away : g.home;

    const favWp = winPct(favTeam.record);
    const dogWp = winPct(dogTeam.record);
    const hasRecords = favWp !== null && dogWp !== null;
    const recordLine = hasRecords
      ? ` Season records: ${favTeam.record} vs ${dogTeam.record}.`
      : "";

    // ---- Moneyline leg (favorite) ----
    const favMl = favIsHome ? o.homeMoneyline : o.awayMoneyline;
    if (favMl != null) {
      const implied = impliedProbability(americanToDecimal(favMl));
      const relStrength = hasRecords
        ? favWp! / (favWp! + dogWp!) + (favIsHome ? 0.03 : 0)
        : implied;
      const modelProbability = Math.max(
        0.05,
        Math.min(0.97, 0.55 * implied + 0.45 * relStrengthClamp(relStrength)),
      );
      legs.push({
        id: `${g.id}-ml`,
        gameId: g.id,
        league: g.league,
        matchup,
        market: "Moneyline",
        selection: `${favTeam.name} ML`,
        americanOdds: favMl,
        modelProbability: Number(modelProbability.toFixed(3)),
        confidence: confidenceFor(modelProbability, hasRecords),
        rationale:
          `${favTeam.name} are the market favorite at ${formatOdds(favMl)} ` +
          `${favIsHome ? "at home" : "on the road"} vs ${dogTeam.name}.` +
          recordLine,
        supportingStats: [
          { label: "Moneyline", value: formatOdds(favMl) },
          { label: "Implied win%", value: `${(implied * 100).toFixed(1)}%` },
          { label: `${favTeam.abbreviation} rec`, value: favTeam.record ?? "N/A" },
          { label: `${dogTeam.abbreviation} rec`, value: dogTeam.record ?? "N/A" },
        ],
        references: [ref],
      });
    }

    // ---- Spread leg (favorite, standard -110) ----
    if (o.spread != null && Number.isFinite(o.spread)) {
      const favSpread = favIsHome ? o.spread : -o.spread;
      const spreadStr = `${favSpread > 0 ? "+" : ""}${favSpread}`;
      const implied = impliedProbability(americanToDecimal(-110));
      legs.push({
        id: `${g.id}-spread`,
        gameId: g.id,
        league: g.league,
        matchup,
        market: "Spread",
        selection: `${favTeam.name} ${spreadStr}`,
        americanOdds: -110,
        modelProbability: Number(
          Math.min(0.62, 0.5 + (hasRecords ? (favWp! - dogWp!) * 0.2 : 0)).toFixed(
            3,
          ),
        ),
        confidence: hasRecords ? "medium" : "low",
        rationale:
          `Market spread has ${favTeam.name} at ${spreadStr} vs ${dogTeam.name}.` +
          recordLine,
        supportingStats: [
          { label: "Spread", value: `${favTeam.abbreviation} ${spreadStr}` },
          { label: "Implied", value: `${(implied * 100).toFixed(1)}%` },
        ],
        references: [ref],
      });
    }

    // ---- Total leg (Over, standard -110) ----
    if (o.total != null && Number.isFinite(o.total)) {
      const implied = impliedProbability(americanToDecimal(-110));
      legs.push({
        id: `${g.id}-total`,
        gameId: g.id,
        league: g.league,
        matchup,
        market: "Total",
        selection: `Over ${o.total}`,
        americanOdds: -110,
        modelProbability: Number(implied.toFixed(3)), // neutral: posted line
        confidence: "low",
        rationale: `Posted game total is ${o.total}. Shown as a research option; no directional model is applied to the total.`,
        supportingStats: [{ label: "Total", value: String(o.total) }],
        references: [ref],
      });
    }
  }

  return legs;
}

function relStrengthClamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
