import { NextRequest, NextResponse } from "next/server";
import type { League } from "@/types";
import { fetchGameSnapshot, type EspnGameSnapshot } from "@/lib/providers/espn";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Settle pending predictions: the client posts the games it's waiting on and
 * we return each game's final score AND the line the market closed at.
 *
 * Both come from the same request, because they answer two different
 * questions about the same pick. The score says whether it won — high
 * variance, hundreds of picks before it means anything. The closing line says
 * whether the market moved toward us — low variance, useful within tens of
 * picks. Scores stay server-side-fetched; the client owns the prediction log,
 * so no database is needed.
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
    return NextResponse.json({
      results: [],
      closingLines: [],
      fetchedAt: new Date().toISOString(),
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const settled = await Promise.allSettled(
      pending.map((p) => fetchGameSnapshot(p.league, p.gameId, controller.signal)),
    );
    const snapshots = settled
      .filter(
        (r): r is PromiseFulfilledResult<EspnGameSnapshot> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    return NextResponse.json({
      results: snapshots.map((s) => s.result).filter((r) => r !== null),
      closingLines: snapshots.map((s) => s.closing).filter((c) => c !== null),
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      results: [],
      closingLines: [],
      fetchedAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timer);
  }
}
