import type { BookPrice, League } from "@/types";
import { americanToDecimal, impliedProbability } from "@/lib/sgp";
import { isBookmaker, isPlausibleAmerican } from "@/lib/market";
import type { DiscreteDist } from "@/lib/distributions";

/**
 * Edge that does not require out-forecasting the market.
 *
 * Everything else in this model has run into the same wall: the closing line
 * aggregates lineups, injuries and sharp money, our inputs are a strict
 * subset of public season data, and the backtest exists precisely because
 * claiming to out-predict that should be measured rather than asserted.
 *
 * But "beat the market" has three other meanings, and all of them are real:
 *
 *  1. **Arbitrage.** Two books price the same two-way market such that their
 *     best prices sum to under 100%. Backing both sides returns a profit
 *     whatever happens. No forecast involved — it is an inconsistency between
 *     two prices, and it either exists or it doesn't.
 *  2. **Middles.** Two books post different LINES. Buy the low side at one
 *     and the high side at the other and there is a band of outcomes where
 *     both bets win. This is where the distribution work finally pays for
 *     itself: the exact probability of landing in that band is computable
 *     from the discrete pmf, including push mass and key numbers, which a
 *     normal-curve approximation gets wrong precisely at the integer margins
 *     middles live on.
 *  3. **Stale books.** When most books have moved and one has not, that one
 *     is offering yesterday's price. The feed timestamps every bookmaker, so
 *     this is observable rather than inferred.
 *
 * None of these need the model to be smarter than the market. They need it to
 * notice when the market disagrees with itself.
 */

export interface ArbOpportunity {
  market: "moneyline" | "spread" | "total";
  sideA: { label: string; book: string; american: number };
  sideB: { label: string; book: string; american: number };
  /** Guaranteed profit per $1 of total stake, ignoring bet limits. */
  guaranteedReturn: number;
  /** Share of the total stake that belongs on side A. */
  stakeShareA: number;
}

export interface MiddleOpportunity {
  market: "spread" | "total";
  /** The side that wins ABOVE its line. */
  lowSide: { label: string; book: string; american: number; line: number };
  /** The side that wins BELOW its line. */
  highSide: { label: string; book: string; american: number; line: number };
  /** Outcomes strictly inside this band win BOTH bets. */
  gapFrom: number;
  gapTo: number;
  /** Exact probability of landing in the band, from the discrete pmf. */
  middleProbability: number;
  /** Expected profit per $1 of total stake, with pushes handled exactly. */
  expectedValue: number;
}

export interface StaleBook {
  book: string;
  /** How far behind the freshest surveyed book, in minutes. */
  minutesBehind: number;
  /** Its price's distance from the consensus, in probability points. */
  deviation: number;
}

export interface MarketOpportunities {
  arbitrage: ArbOpportunity[];
  middles: MiddleOpportunity[];
  stale: StaleBook[];
}

/** The best (highest-paying) price on one side across books. */
function best(
  books: BookPrice[],
  pick: (b: BookPrice) => number | undefined,
): { book: string; american: number } | null {
  let out: { book: string; american: number } | null = null;
  for (const b of books) {
    /*
     * The same two guards the consensus uses, applied here too, because this
     * is the module that reports RISK-FREE profit and so is the one that must
     * not be fooled.
     *
     * Both failures were observed on real historical data: an exchange whose
     * quotes were not American odds at all produced a two-way "arbitrage"
     * paying 15% guaranteed, and the apparent arbitrage rate fell from 8.1%
     * of games to 2.2% once exchanges and impossible prices were excluded.
     * Every one of the removed opportunities was fictional.
     */
    if (!isBookmaker(b.book)) continue;
    const v = pick(b);
    if (!isPlausibleAmerican(v)) continue;
    if (!out || v > out.american) out = { book: b.book, american: v };
  }
  return out;
}

/**
 * A two-way market whose best prices sum to under 100% implied.
 *
 * This is the one genuinely risk-free result in the whole model, so it is
 * also the one most likely to be an artifact: a misparsed line, a price a
 * book has already pulled, or two quotes at different lines treated as the
 * same bet. The caller is responsible for only passing prices at a matched
 * line, and the UI states that limits and speed decide whether it is real.
 */
export function findArbitrage(
  market: ArbOpportunity["market"],
  books: BookPrice[],
  sideA: { label: string; pick: (b: BookPrice) => number | undefined },
  sideB: { label: string; pick: (b: BookPrice) => number | undefined },
): ArbOpportunity | null {
  const a = best(books, sideA.pick);
  const b = best(books, sideB.pick);
  if (!a || !b) return null;
  // The same book on both sides is its own market, not an inconsistency
  // between two markets — and a book pricing itself under 100% is a mistake
  // it will correct, not an opportunity two books created.
  if (a.book === b.book) return null;

  const impliedA = impliedProbability(americanToDecimal(a.american));
  const impliedB = impliedProbability(americanToDecimal(b.american));
  const total = impliedA + impliedB;
  if (!(total < 0.999)) return null;

  return {
    market,
    sideA: { label: sideA.label, book: a.book, american: a.american },
    sideB: { label: sideB.label, book: b.book, american: b.american },
    guaranteedReturn: Number((1 / total - 1).toFixed(4)),
    stakeShareA: Number((impliedA / total).toFixed(4)),
  };
}

/**
 * Expected value of a middle, priced off the real distribution.
 *
 * Stakes are split evenly and every outcome is enumerated over the pmf, so
 * pushes on either boundary are handled exactly rather than approximated —
 * which matters because a middle's whole value sits on the integer outcomes
 * between two half-point lines.
 */
function priceMiddle(
  dist: DiscreteDist,
  lowLine: number,
  lowDecimal: number,
  highLine: number,
  highDecimal: number,
): { middleProbability: number; expectedValue: number } {
  const stake = 0.5;
  let ev = 0;
  let middle = 0;

  for (const { k, p } of dist.support()) {
    if (p <= 0) continue;
    // The "low" bet wins above its line; the "high" bet wins below its line.
    const lowWin = k > lowLine;
    const lowPush = k === lowLine;
    const highWin = k < highLine;
    const highPush = k === highLine;

    const payout =
      stake * (lowWin ? lowDecimal : lowPush ? 1 : 0) +
      stake * (highWin ? highDecimal : highPush ? 1 : 0);
    ev += p * payout;
    if (lowWin && highWin) middle += p;
  }

  return {
    middleProbability: Number(middle.toFixed(4)),
    expectedValue: Number((ev - 1).toFixed(4)),
  };
}

/**
 * Pairs of books whose lines differ enough to leave a winning band.
 *
 * Only pairs where the gap actually contains an achievable outcome are
 * returned — two books half a point apart leave nothing to win.
 */
export function findMiddles(
  market: MiddleOpportunity["market"],
  books: BookPrice[],
  dist: DiscreteDist,
  lineOf: (b: BookPrice) => number | undefined,
  lowPrice: (b: BookPrice) => number | undefined,
  highPrice: (b: BookPrice) => number | undefined,
  labels: { low: (line: number) => string; high: (line: number) => string },
): MiddleOpportunity[] {
  const out: MiddleOpportunity[] = [];

  // Same guards as findArbitrage: an exchange's non-American quotes or an
  // impossible price would otherwise invent a middle that cannot be placed.
  const usable = books.filter((b) => isBookmaker(b.book));
  for (const a of usable) {
    for (const b of usable) {
      if (a.book === b.book) continue;
      const lowLine = lineOf(a);
      const highLine = lineOf(b);
      const lowOdds = lowPrice(a);
      const highOdds = highPrice(b);
      if (
        lowLine == null || highLine == null ||
        !Number.isFinite(lowLine) || !Number.isFinite(highLine) ||
        !isPlausibleAmerican(lowOdds) || !isPlausibleAmerican(highOdds)
      ) {
        continue;
      }
      // A middle needs the low side's line BELOW the high side's.
      if (!(lowLine < highLine)) continue;

      const priced = priceMiddle(
        dist,
        lowLine,
        americanToDecimal(lowOdds),
        highLine,
        americanToDecimal(highOdds),
      );
      // No achievable outcome in the band means there is no middle.
      if (priced.middleProbability <= 0) continue;

      out.push({
        market,
        lowSide: { label: labels.low(lowLine), book: a.book, american: lowOdds, line: lowLine },
        highSide: { label: labels.high(highLine), book: b.book, american: highOdds, line: highLine },
        gapFrom: lowLine,
        gapTo: highLine,
        ...priced,
      });
    }
  }

  // Best expected value first; a middle with negative EV is still reported so
  // the cost of chasing one is visible rather than hidden.
  return out.sort((x, y) => y.expectedValue - x.expectedValue).slice(0, 4);
}

/**
 * How stale is each book, and how far from the consensus?
 *
 * Staleness is measured against the FRESHEST surveyed book rather than the
 * clock, deliberately. Our own slate is cached for up to four hours, so
 * comparing to "now" would mark every book stale whenever the cache was warm.
 * Comparing books to each other asks the question that matters: has this one
 * moved since the others did?
 */
export function findStaleBooks(
  books: BookPrice[],
  consensusHomeProb: number | null,
): StaleBook[] {
  const stamped = books.filter(
    (b) =>
      isBookmaker(b.book) &&
      b.lastUpdate &&
      Number.isFinite(Date.parse(b.lastUpdate)),
  );
  if (stamped.length < 2) return [];

  const times = stamped.map((b) => Date.parse(b.lastUpdate as string));
  const freshest = Math.max(...times);

  const out: StaleBook[] = [];
  for (const b of stamped) {
    const t = Date.parse(b.lastUpdate as string);
    const minutesBehind = (freshest - t) / 60_000;
    // A couple of minutes is ordinary jitter between feeds.
    if (minutesBehind < 5) continue;

    let deviation = 0;
    if (
      consensusHomeProb != null &&
      b.homeMoneyline != null &&
      b.awayMoneyline != null
    ) {
      const raw = [
        impliedProbability(americanToDecimal(b.homeMoneyline)),
        impliedProbability(americanToDecimal(b.awayMoneyline)),
      ];
      const sum = raw[0] + raw[1];
      if (sum > 0) deviation = raw[0] / sum - consensusHomeProb;
    }

    out.push({
      book: b.book,
      minutesBehind: Number(minutesBehind.toFixed(0)),
      deviation: Number(deviation.toFixed(4)),
    });
  }

  // Most stale first, and only books that are actually behind.
  return out
    .sort((a, b) => b.minutesBehind - a.minutesBehind)
    .slice(0, 5);
}

/** Leagues whose markets are thin enough that softness is plausible. */
export const SOFTER_MARKETS: League[] = ["NCAAB", "NCAAF", "NHL"];
