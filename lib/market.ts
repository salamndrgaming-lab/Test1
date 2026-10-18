import type { BookPrice, League } from "@/types";
import { americanToDecimal, impliedProbability, removeVigShin } from "@/lib/sgp";

/**
 * Multi-book consensus and best-price selection.
 *
 * This module exists because of an uncomfortable truth about the rest of the
 * model: against a single book's de-vigged price, a model built on free season
 * aggregates will not find positive expected value, and it should not pretend
 * to. The market's fair price is the best public forecast of the game, our
 * projection is a shrunken minority vote against it, and the book's hold sits
 * on top. Every leg comes out slightly negative, which is the correct answer.
 *
 * Real edge available to a small operator does not come from forecasting
 * better. It comes from **paying a better price than the consensus fair
 * value** — the same bet, at a number one book has moved and others have not.
 * That requires more than one price, which is what this module assembles.
 *
 * Two distinct quantities, deliberately kept apart:
 *
 *  - **Consensus fair probability.** Each book's prices are de-vigged on their
 *    own, then averaged with more weight on the tighter books. A book with a
 *    2% hold is a sharper estimate of the truth than one with 8%, so it should
 *    count for more. This is the benchmark.
 *  - **Best available price.** The most generous number any surveyed book
 *    offers on that side. This is what you would actually be paid.
 *
 * Edge is the gap between them. When only one book is surveyed the two
 * collapse onto the same number, the gap becomes exactly the hold, and the
 * honest output is that no line shopping was possible — which the UI says
 * rather than hiding.
 */

/**
 * Floor on the hold used for inverse-vig weighting. Without it, a book
 * quoting a near-zero hold outvotes every sharp book combined.
 */
export const MIN_PLAUSIBLE_VIG = 0.015;
/** A two-way market holding more than this is too loose to inform a benchmark. */
export const MAX_PLAUSIBLE_VIG = 0.15;

/**
 * Providers that are NOT bookmakers.
 *
 * ESPN mixes model and aggregator feeds in with the sportsbooks. Counting a
 * consensus line as an independent quote would be a serious error for the
 * statistics built on top: the consensus is DERIVED from the books, so
 * including it shrinks the measured dispersion and makes fair value look more
 * precisely known than it is — inflating confidence with a number that
 * carries no new information. Prediction models are worse, since they are not
 * prices at all and nothing can be bet into them.
 */
const NON_BOOK_PROVIDERS = [
  "consensus",
  "teamrankings",
  "numberfire",
  "accuscore",
  "fpi",
  "predictor",
  "projection",
  "average",
  "median",
  "aggregate",
];

export function isBookmaker(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return !NON_BOOK_PROVIDERS.some((bad) => n.includes(bad));
}

export interface ConsensusSide {
  /** De-vigged probability across books, inverse-vig weighted. */
  fairProbability: number;
  /** Best American odds available on this side. */
  bestAmerican: number;
  /** Which book is offering it. */
  bestBook: string;
  /** Break-even probability at that best price. */
  bestBreakEven: number;
  /** fairProbability - bestBreakEven. Positive means a real price edge. */
  priceEdge: number;
  /** How many books quoted this market. */
  books: number;
  /** Mean book hold across the surveyed books. */
  meanVig: number;
  /** Spread between the best and worst price available, in probability. */
  priceDispersion: number;
  /**
   * Standard error of the consensus fair probability, from how far the
   * independently de-vigged books disagree with each other.
   *
   * This is the first quantity in the whole model that makes confidence
   * measurable rather than asserted. Every confidence input before it was a
   * hand-picked weight on a heuristic; this one is estimated from data. Five
   * books agreeing within half a point means we know fair value precisely;
   * five books scattered over four points means we do not, whatever the
   * average happens to be.
   */
  standardError: number;
  /**
   * priceEdge / standardError. How many standard errors the price sits away
   * from fair value — i.e. whether an edge is distinguishable from the books
   * simply disagreeing with each other.
   */
  edgeSignificance: number;
}

/**
 * Standard error assumed when only one book is available.
 *
 * With a single quote there is no dispersion to measure, and pretending the
 * error is zero would make every tiny gap look significant. This is the
 * typical book-to-book disagreement on a liquid two-way market, used as a
 * deliberately conservative stand-in — and legs priced this way are capped in
 * confidence anyway, because an unverifiable benchmark is exactly that.
 */
export const UNKNOWN_FAIR_SE = 0.02;

export interface ConsensusMarket {
  home?: ConsensusSide;
  away?: ConsensusSide;
  /** True when more than one book quoted this market. */
  shopped: boolean;
}

/** One two-way market's quotes from a single book. */
interface Quote {
  book: string;
  home: number;
  away: number;
}

function collect(
  books: BookPrice[],
  pick: (b: BookPrice) => [number | undefined, number | undefined],
): Quote[] {
  const out: Quote[] = [];
  for (const b of books) {
    // Defence in depth: the providers are filtered where they are parsed, but
    // the standard error underpinning confidence is computed HERE, so this is
    // where it must not be possible for a derived feed to slip in.
    if (!isBookmaker(b.book)) continue;
    const [home, away] = pick(b);
    if (
      home == null ||
      away == null ||
      !Number.isFinite(home) ||
      !Number.isFinite(away)
    ) {
      continue;
    }
    out.push({ book: b.book, home, away });
  }
  return out;
}

/**
 * Combine a set of two-way quotes into a consensus and a best price.
 *
 * Returns undefined when nothing usable was quoted, so the caller can tell
 * "no market" from "a market with no edge" — those mean different things.
 */
export function buildConsensus(quotes: Quote[]): ConsensusMarket {
  if (quotes.length === 0) return { shopped: false };

  // De-vig each book on its own terms first. Pooling raw prices across books
  // would mix in their differing holds and produce a benchmark that belongs to
  // no one.
  const fair: { home: number; away: number; vig: number; book: string }[] = [];
  for (const q of quotes) {
    const raw = [
      impliedProbability(americanToDecimal(q.home)),
      impliedProbability(americanToDecimal(q.away)),
    ];
    const dv = removeVigShin(raw);
    if (!Number.isFinite(dv.fair[0]) || !Number.isFinite(dv.fair[1])) continue;
    fair.push({ home: dv.fair[0], away: dv.fair[1], vig: dv.vig, book: q.book });
  }
  if (fair.length === 0) return { shopped: false };

  /*
   * An outlier price may set the BEST PRICE but must never move the
   * BENCHMARK — that distinction is the whole point of line shopping, and
   * getting it backwards manufactures edge.
   *
   * Two guards. Books whose two-way market prices below 100% are excluded
   * from the consensus: a sub-100% book is quoting an arbitrage against
   * itself, which in practice means one of its prices is stale or wrong, so
   * it is the LEAST reliable estimate of the truth even though it may be the
   * best thing to bet into. And the inverse-vig weight is floored at a
   * realistic minimum hold, because without a floor a book with a 0.1% hold
   * would outvote every sharp book combined.
   */
  const trustworthy = fair.filter(
    (f) => f.vig >= 0 && f.vig <= MAX_PLAUSIBLE_VIG,
  );
  const forConsensus = trustworthy.length > 0 ? trustworthy : fair;

  let wSum = 0;
  let homeSum = 0;
  let vigSum = 0;
  for (const f of forConsensus) {
    const w = 1 / Math.max(MIN_PLAUSIBLE_VIG, f.vig);
    wSum += w;
    homeSum += w * f.home;
    vigSum += f.vig;
  }
  const fairHome = wSum > 0 ? homeSum / wSum : forConsensus[0].home;
  const meanVig = vigSum / forConsensus.length;

  /*
   * How precisely do we know fair value? Measured from the dispersion of the
   * independently de-vigged books, not assumed.
   *
   * Both sides of a two-way market share one standard error, because they are
   * one estimate: the books disagree about the game, not about each side
   * separately.
   */
  const homeProbs = forConsensus.map((f) => f.home);
  const standardError = (() => {
    if (homeProbs.length < 2) return UNKNOWN_FAIR_SE;
    const mean = homeProbs.reduce((a, b) => a + b, 0) / homeProbs.length;
    const variance =
      homeProbs.reduce((acc, p) => acc + (p - mean) ** 2, 0) /
      (homeProbs.length - 1);
    const measured =
      Math.sqrt(Math.max(0, variance)) / Math.sqrt(homeProbs.length);
    /*
     * A measured standard error from two or three quotes is itself barely
     * measured. Two books that happen to agree to the decimal produce an SE
     * near zero, which made a 7.4pp edge read as 37 standard errors — a
     * precision claim the sample cannot support.
     *
     * So never claim to know fair value better than the typical book
     * disagreement reduced by root-n. With two books that floor is 1.4pp,
     * with nine it is 0.7pp, and a genuinely wide market still reports its
     * own larger dispersion.
     */
    const floor = UNKNOWN_FAIR_SE / Math.sqrt(homeProbs.length);
    return Math.max(floor, measured);
  })();

  const side = (
    which: "home" | "away",
    fairProb: number,
  ): ConsensusSide => {
    let best = quotes[0];
    let bestVal = quotes[0][which];
    let worstVal = quotes[0][which];
    for (const q of quotes) {
      // Higher American odds pay more, on both sides of zero.
      if (q[which] > bestVal) {
        bestVal = q[which];
        best = q;
      }
      if (q[which] < worstVal) worstVal = q[which];
    }
    const bestBreakEven = impliedProbability(americanToDecimal(bestVal));
    const worstBreakEven = impliedProbability(americanToDecimal(worstVal));
    const priceEdge = fairProb - bestBreakEven;
    return {
      fairProbability: Number(fairProb.toFixed(4)),
      bestAmerican: bestVal,
      bestBook: best.book,
      bestBreakEven: Number(bestBreakEven.toFixed(4)),
      priceEdge: Number(priceEdge.toFixed(4)),
      standardError: Number(standardError.toFixed(4)),
      edgeSignificance: Number((priceEdge / standardError).toFixed(2)),
      books: quotes.length,
      meanVig: Number(meanVig.toFixed(4)),
      priceDispersion: Number(
        Math.abs(worstBreakEven - bestBreakEven).toFixed(4),
      ),
    };
  };

  return {
    home: side("home", fairHome),
    away: side("away", 1 - fairHome),
    shopped: quotes.length > 1,
  };
}

/** Consensus across books for each of the three game-level markets. */
export interface GameConsensus {
  moneyline: ConsensusMarket;
  spread: ConsensusMarket;
  total: ConsensusMarket;
  /** Distinct books that quoted anything on this game. */
  books: string[];
  /** The most common posted spread and total across books. */
  modalSpread?: number;
  modalTotal?: number;
}

/** The most frequently quoted value, so one stale book can't move the line. */
function modal(values: (number | undefined)[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  let bestVal: number | undefined;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      bestVal = v;
    }
  }
  return bestVal;
}

export function buildGameConsensus(books: BookPrice[]): GameConsensus {
  // Only compare prices quoted at the SAME line. A -3 at one book and a -4.5
  // at another are different bets, and treating them as one manufactures edge
  // out of thin air — which is exactly the kind of fake number to avoid.
  const modalSpread = modal(books.map((b) => b.spread));
  const modalTotal = modal(books.map((b) => b.total));

  return {
    moneyline: buildConsensus(
      collect(books, (b) => [b.homeMoneyline, b.awayMoneyline]),
    ),
    spread: buildConsensus(
      collect(books, (b) =>
        b.spread === modalSpread ? [b.spreadHomeOdds, b.spreadAwayOdds] : [undefined, undefined],
      ),
    ),
    total: buildConsensus(
      collect(books, (b) =>
        b.total === modalTotal ? [b.overOdds, b.underOdds] : [undefined, undefined],
      ),
    ),
    books: [...new Set(books.map((b) => b.book))],
    modalSpread,
    modalTotal,
  };
}

/** Leagues we survey. Exported so the UI can explain the coverage. */
export const SURVEYED: League[] = [
  "NBA",
  "NFL",
  "NHL",
  "MLB",
  "NCAAF",
  "NCAAB",
];
