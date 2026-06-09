import type { Game, MarketOdds } from "@/types";
import { formatOdds } from "@/lib/format";

export function OddsTable({
  games,
  odds,
}: {
  games: Game[];
  odds: MarketOdds[];
}) {
  const byGame = new Map(odds.map((o) => [o.gameId, o]));
  const rows = games
    .map((g) => ({ game: g, o: byGame.get(g.id) }))
    .filter((r) => r.o);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No odds available for these games.
      </p>
    );
  }

  return (
    <div className="no-scrollbar overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--muted)]">
            <th className="py-2 pr-2 font-medium">Matchup</th>
            <th className="px-2 py-2 font-medium">Spread</th>
            <th className="px-2 py-2 font-medium">Total</th>
            <th className="px-2 py-2 font-medium">Moneyline</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ game, o }) => (
            <tr key={game.id} className="border-t border-[var(--border)]">
              <td className="py-2 pr-2">
                <div className="font-medium">
                  {game.away.abbreviation} @ {game.home.abbreviation}
                </div>
                <div className="text-xs text-[var(--muted)]">{game.league}</div>
              </td>
              <td className="px-2 py-2 tabular-nums">
                {o!.spread !== undefined
                  ? `${o!.spread > 0 ? "+" : ""}${o!.spread}`
                  : "—"}
              </td>
              <td className="px-2 py-2 tabular-nums">{o!.total ?? "—"}</td>
              <td className="px-2 py-2 tabular-nums">
                {o!.awayMoneyline !== undefined
                  ? formatOdds(o!.awayMoneyline)
                  : "—"}{" "}
                /{" "}
                {o!.homeMoneyline !== undefined
                  ? formatOdds(o!.homeMoneyline)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
