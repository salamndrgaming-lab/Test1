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
  abbr,
  record,
  score,
  winner,
  isFav,
  onToggleFav,
}: {
  name: string;
  abbr: string;
  record?: string;
  score?: number;
  winner: boolean;
  isFav?: boolean;
  onToggleFav?: (abbr: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-baseline gap-2">
        {onToggleFav && (
          <button
            onClick={() => onToggleFav(abbr)}
            aria-label={isFav ? "Unfavorite" : "Favorite"}
            className={classNames(
              "self-center text-sm leading-none transition-colors",
              isFav ? "text-amber-400" : "text-[var(--muted-2)] hover:text-amber-400",
            )}
          >
            {isFav ? "★" : "☆"}
          </button>
        )}
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
  favorites,
  onToggleFavorite,
}: {
  game: Game;
  odds?: MarketOdds;
  favorites?: string[];
  onToggleFavorite?: (abbr: string) => void;
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
        abbr={game.away.abbreviation}
        record={game.away.record}
        score={game.awayScore}
        winner={awayWins}
        isFav={favorites?.includes(game.away.abbreviation)}
        onToggleFav={onToggleFavorite}
      />
      <Row
        name={game.home.name}
        abbr={game.home.abbreviation}
        record={game.home.record}
        score={game.homeScore}
        winner={homeWins}
        isFav={favorites?.includes(game.home.abbreviation)}
        onToggleFav={onToggleFavorite}
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
