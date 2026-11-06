import { NextResponse } from "next/server";
import type { League } from "@/types";
import {
  fetchEventProps,
  propCreditCost,
  PROP_MARKETS,
  PROP_FIT_MARKETS,
  type PropOutcome,
} from "@/lib/providers/oddsapi";
import { buildConsensus, isBookmaker, isPlausibleAmerican } from "@/lib/market";
import { americanToDecimal, impliedProbability, removeVigShin } from "@/lib/sgp";

export const dynamic = "force-dynamic";

/**
 * Player props for one game, priced the only way this project trusts.
 *
 * Props are fetched here and nowhere else, on an explicit request for a
 * single game, because the per-event endpoint bills per market per event:
 * four markets across a twenty-game board would cost eighty credits against
 * the three a whole league's main lines cost.
 *
 * There is NO model probability on a prop and there will not be one. The
 * model projects a team's margin and total; it has no player-level
 * distribution and inventing one would be exactly the fiction this project
 * exists to avoid. What props get instead is the thing that has actually
 * tested positive: multi-book price edge, through the same de-vigging and
 * consensus code the main board uses.
 *
 * That is not a consolation. Props are a softer market than sides — more
 * lines, less money policing each one — so the price inconsistency the rest
 * of the app hunts should, in theory, be larger here. Whether it is remains
 * untested, and the UI says so.
 */

export interface PropLine {
  player: string;
  market: string;
  line: number;
  /** Over/Under priced across every book quoting this exact line. */
  over?: PricedSide;
  under?: PricedSide;
  books: number;
}

interface PricedSide {
  bestAmerican: number;
  bestBook: string;
  fairProbability: number;
  priceEdge: number;
  edgeSignificance: number;
  standardError: number;
}

/**
 * Group raw outcomes into two-way markets at a matched line.
 *
 * Only an Over and an Under at the SAME number from the SAME book form a
 * quote — the identical rule the main board uses, for the identical reason:
 * comparing an over 24.5 against an under 26.5 manufactures edge out of two
 * different bets.
 */
function priceProps(raw: PropOutcome[]): PropLine[] {
  // player | market | line -> book -> { over, under }
  const byLine = new Map<string, Map<string, { over?: number; under?: number }>>();
  for (const o of raw) {
    const key = `${o.player}|${o.market}|${o.line}`;
    let books = byLine.get(key);
    if (!books) { books = new Map(); byLine.set(key, books); }
    const cell = books.get(o.book) ?? {};
    const side = o.side.toLowerCase();
    if (side.startsWith("over")) cell.over = o.american;
    else if (side.startsWith("under")) cell.under = o.american;
    books.set(o.book, cell);
  }

  const out: PropLine[] = [];
  for (const [key, books] of byLine) {
    const [player, market, lineStr] = key.split("|");
    const quotes = [...books.entries()]
      .filter(([, c]) => c.over != null && c.under != null)
      .map(([book, c]) => ({ book, home: c.over as number, away: c.under as number }));
    if (quotes.length < 2) continue; // one book cannot form a consensus

    const con = buildConsensus(quotes);
    const side = (s: typeof con.home): PricedSide | undefined =>
      s && {
        bestAmerican: s.bestAmerican,
        bestBook: s.bestBook,
        fairProbability: s.fairProbability,
        priceEdge: s.priceEdge,
        edgeSignificance: s.edgeSignificance,
        standardError: s.standardError,
      };
    out.push({
      player,
      market,
      line: Number(lineStr),
      over: side(con.home),
      under: side(con.away),
      books: quotes.length,
    });
  }
  // Best price edge on either side first.
  return out.sort(
    (a, b) =>
      Math.max(b.over?.priceEdge ?? -1, b.under?.priceEdge ?? -1) -
      Math.max(a.over?.priceEdge ?? -1, a.under?.priceEdge ?? -1),
  );
}

/** One player's priced numbers, for fitting rather than for edge. */
export interface PropFitQuotes {
  player: string;
  market: string;
  /** De-vigged over probability at each distinct posted number. */
  quotes: { line: number; pOver: number; books: number }[];
}

/**
 * The same board, grouped for fitting a distribution instead of pricing edge.
 *
 * These are two different jobs and they need two different filters, which I
 * got wrong by reusing one for both.
 *
 * Price edge needs at least TWO BOOKS on the SAME NUMBER: a consensus is a
 * disagreement between books about one identical bet, and without a second
 * book there is no benchmark to beat. `priceProps` is right to drop
 * everything else.
 *
 * Fitting a player's distribution needs something else entirely — at least
 * two DISTINCT NUMBERS, from however many books. One book posting over 14.5
 * and over 17.5 on the same player pins down that player's spread perfectly
 * well, and `priceProps` was throwing exactly those away before the
 * simulation ever saw them. A live college game returned twelve prop prices
 * from a single book and the simulator was handed nothing at all.
 *
 * Each probability is de-vigged from ONE book's own two-sided price, which is
 * the only honest way to read a single book: Shin on that book's pair, no
 * pooling of raw prices across books that hold differently. Where more than
 * one book quotes the same number their fair probabilities are averaged, and
 * `books` records how many stood behind it.
 */
function fitQuotes(raw: PropOutcome[]): PropFitQuotes[] {
  // player | market | line -> book -> both sides
  const byLine = new Map<string, Map<string, { over?: number; under?: number }>>();
  for (const o of raw) {
    const key = `${o.player}|${o.market}|${o.line}`;
    let books = byLine.get(key);
    if (!books) { books = new Map(); byLine.set(key, books); }
    const cell = books.get(o.book) ?? {};
    const side = o.side.toLowerCase();
    if (side.startsWith("over")) cell.over = o.american;
    else if (side.startsWith("under")) cell.under = o.american;
    books.set(o.book, cell);
  }

  const byPlayer = new Map<string, PropFitQuotes>();
  for (const [key, books] of byLine) {
    const [player, market, lineStr] = key.split("|");
    const line = Number(lineStr);
    const fairs: number[] = [];
    for (const [book, c] of books) {
      if (c.over == null || c.under == null) continue;
      if (!isBookmaker(book)) continue;
      if (!isPlausibleAmerican(c.over) || !isPlausibleAmerican(c.under)) continue;
      const dv = removeVigShin([
        impliedProbability(americanToDecimal(c.over)),
        impliedProbability(americanToDecimal(c.under)),
      ]);
      if (!Number.isFinite(dv.fair[0])) continue;
      fairs.push(dv.fair[0]);
    }
    if (fairs.length === 0) continue;
    const pOver = fairs.reduce((a, b) => a + b, 0) / fairs.length;
    const pk = `${player}|${market}`;
    const g = byPlayer.get(pk) ?? { player, market, quotes: [] };
    g.quotes.push({ line, pOver, books: fairs.length });
    byPlayer.set(pk, g);
  }

  for (const g of byPlayer.values()) g.quotes.sort((a, b) => a.line - b.line);
  // Most numbers first: those are the players a fit can actually identify.
  return [...byPlayer.values()].sort((a, b) => b.quotes.length - a.quotes.length);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const league = url.searchParams.get("league") as League | null;
  const eventId = url.searchParams.get("eventId");
  /*
   * Two callers wanting two different market sets. The props board wants the
   * standard one-number-per-player markets it can price an edge on; the
   * simulator wants the alternate-line ladder, because one number cannot
   * identify a spread and fitting is the whole point.
   */
  const purpose = url.searchParams.get("purpose") === "fit" ? "fit" : "edge";
  const wanted =
    purpose === "fit" ? PROP_FIT_MARKETS[league as League] : PROP_MARKETS[league as League];
  if (!league || !eventId || !wanted) {
    return NextResponse.json(
      {
        error:
          purpose === "fit"
            ? "no-fittable-market-in-this-league"
            : "bad-request",
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const { props, cost, reason } = await fetchEventProps(
      league,
      eventId,
      controller.signal,
      purpose,
    );
    if (reason && props.length === 0) {
      return NextResponse.json(
        {
          error: reason,
          wouldCost: purpose === "fit" ? wanted.length : propCreditCost(league),
          lines: [],
        },
        { status: reason === "no-key" || reason === "budget" ? 503 : 200 },
      );
    }
    /*
     * Say WHICH stage came up empty.
     *
     * "No props" has three quite different causes and they were all
     * reported as an empty list: the feed returned nothing for this event
     * at all, or it returned plenty of lines but no two books landed on the
     * same number, or the books it returned are ones we do not price. The
     * first is the feed's coverage, the second is a real finding about this
     * game's market, and the third is our own filter. Collapsing them cost
     * an evening of looking in the wrong place.
     */
    const lines = priceProps(props);
    const fits = fitQuotes(props);
    const books = new Set(props.map((p) => p.book));
    const identifiable = fits.filter((f) => f.quotes.length >= 2).length;
    return NextResponse.json({
      lines,
      fitQuotes: fits,
      creditsUsed: cost,
      markets: wanted,
      purpose,
      feed: {
        outcomes: props.length,
        books: books.size,
        pricedLines: lines.length,
        players: fits.length,
        identifiablePlayers: identifiable,
      },
      ...(lines.length === 0 && identifiable === 0
        ? {
            error:
              props.length === 0
                ? "feed-returned-no-props"
                : "no-two-books-on-the-same-number",
          }
        : {}),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "timeout" : "network", lines: [] },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
