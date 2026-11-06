import { NextResponse } from "next/server";
import type { League } from "@/types";
import {
  fetchEventProps,
  propCreditCost,
  PROP_MARKETS,
  type PropOutcome,
} from "@/lib/providers/oddsapi";
import { buildConsensus } from "@/lib/market";

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const league = url.searchParams.get("league") as League | null;
  const eventId = url.searchParams.get("eventId");
  const wanted = PROP_MARKETS[league as League];
  if (!league || !eventId || !wanted) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const { props, cost, reason } = await fetchEventProps(
      league,
      eventId,
      controller.signal,
    );
    if (reason && props.length === 0) {
      return NextResponse.json(
        {
          error: reason,
          wouldCost: propCreditCost(league),
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
    const books = new Set(props.map((p) => p.book));
    return NextResponse.json({
      lines,
      creditsUsed: cost,
      markets: wanted,
      feed: {
        outcomes: props.length,
        books: books.size,
        pricedLines: lines.length,
      },
      ...(lines.length === 0
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
