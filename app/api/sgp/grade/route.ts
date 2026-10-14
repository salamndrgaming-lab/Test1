import { NextRequest, NextResponse } from "next/server";
import type { League } from "@/types";
import { fetchGameResult, type EspnGameResult } from "@/lib/providers/espn";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Grade pending predictions: the client posts the games it's waiting on, we
 * look up final scores. Scores stay server-side-fetched; the client owns the
 * prediction log, so no database is needed.
 */
export async function POST(req: NextRequest) {
  let pending: { gameId: string; league: League }[] = [];
  try {
    const body = await req.json();
    pending = Array.isArray(body?.pending) ? body.pending.slice(0, 25) : [];
  } catch {
    /* ignore */
  }
  if (pending.length === 0) {
    return NextResponse.json({ results: [], fetchedAt: new Date().toISOString() });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const settled = await Promise.allSettled(
      pending.map((p) => fetchGameResult(p.league, p.gameId, controller.signal)),
    );
    const results = settled
      .filter(
        (r): r is PromiseFulfilledResult<EspnGameResult | null> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value)
      .filter((v): v is EspnGameResult => v !== null);

    return NextResponse.json({
      results,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ results: [], fetchedAt: new Date().toISOString() });
  } finally {
    clearTimeout(timer);
  }
}
