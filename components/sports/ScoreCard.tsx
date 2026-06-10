import type { Game, MarketOdds } from "@/types";
import { classNames, formatOdds } from "@/lib/format";

function statusLabel(g: Game): string {
  if (g.status === "final") return "Final";
  if (g.status === "in") return "Live";
  return new Date(g.startTime).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Row({
  name,
  record,
  score,
  winner,
}: {
  name: string;
  record?: string;
  score?: number;
  winner: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-baseline gap-2">
        <span className={classNames("font-medium", winner && "text-[var(--accent)]")}>
          {name}
        </span>
        {record && <span className="text-xs text-[var(--muted)]">{record}</span>}
      </div>
      {score !== undefined && (
        <span className={classNames("tabular-nums", winner && "font-bold")}>
          {score}
        </span>
      )}
    </div>
  );
}

export function ScoreCard({
  game,
  odds,
}: {
  game: Game;
  odds?: MarketOdds;
}) {
  const homeWins =
    game.status === "final" &&
    (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWins =
    game.status === "final" &&
    (game.awayScore ?? 0) > (game.homeScore ?? 0);

  const hasOdds =
    odds &&
    (odds.spread != null || odds.total != null || odds.homeMoneyline != null);

  return (
    <div className="card card-hover">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 font-semibold tracking-wide">
          {game.league}
        </span>
        <span
          className={classNames(
            game.status === "in" && "font-semibold text-red-400",
            game.status === "final" && "text-[var(--muted)]",
          )}
        >
          {game.status === "in" && "● "}
          {statusLabel(game)}
        </span>
      </div>
      <Row
        name={game.away.name}
        record={game.away.record}
        score={game.awayScore}
        winner={awayWins}
      />
      <Row
        name={game.home.name}
        record={game.home.record}
        score={game.homeScore}
        winner={homeWins}
      />
      {game.venue && (
        <p className="mt-1.5 text-[0.65rem] text-[var(--muted)]">{game.venue}</p>
      )}
      {hasOdds && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--border-soft)] pt-2 text-[0.65rem] text-[var(--muted)]">
          {odds!.spread != null && (
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
              {game.home.abbreviation}{" "}
              {odds!.spread > 0 ? `+${odds!.spread}` : odds!.spread}
            </span>
          )}
          {odds!.total != null && (
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
              O/U {odds!.total}
            </span>
          )}
          {odds!.homeMoneyline != null && odds!.awayMoneyline != null && (
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
              ML {formatOdds(odds!.awayMoneyline)}/{formatOdds(odds!.homeMoneyline)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
