"use client";

import { useMemo, useState } from "react";
import type {
  Game,
  League,
  MarketOdds,
  SgpRecommendation,
  Standing,
} from "@/types";
import { useProvider } from "@/lib/useProvider";
import { usePersistentState } from "@/lib/usePersistentState";
import { PageHeader, SourceBadge, Spinner, Card, ErrorState } from "@/components/ui";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { ScoreCard } from "@/components/sports/ScoreCard";
import { OddsTable } from "@/components/sports/OddsTable";
import { OddsBarChart } from "@/components/charts/OddsBarChart";
import { SgpBuilder } from "@/components/sports/SgpBuilder";
import { StandingsTable } from "@/components/sports/StandingsTable";
import { classNames } from "@/lib/format";
import { accentVars } from "@/lib/sections";

type Tab = "scores" | "odds" | "standings" | "sgp";
const LEAGUES: (League | "All")[] = [
  "All",
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "NCAAB",
];

export default function SportsPage() {
  const [tab, setTab] = useState<Tab>("scores");
  const [league, setLeague] = useState<League | "All">("All");
  const [favsOnly, setFavsOnly] = useState(false);
  const [favTeams, setFavTeams] = usePersistentState<string[]>(
    "newsscope.favTeams",
    [],
  );
  const q = league === "All" ? "" : `?league=${league}`;
  const games = useProvider<Game[]>(`/api/sports${q}`);
  const odds = useProvider<MarketOdds[]>(`/api/odds${q}`);
  const sgp = useProvider<SgpRecommendation>("/api/sgp");
  // standings needs a concrete league; default to NBA when "All"
  const standingsLeague = league === "All" ? "NBA" : league;
  const standings = useProvider<Standing[]>(
    `/api/sports/standings?league=${standingsLeague}`,
  );

  const toggleFav = (abbr: string) =>
    setFavTeams((prev) =>
      prev.includes(abbr) ? prev.filter((a) => a !== abbr) : [...prev, abbr],
    );

  const visibleGames = useMemo(() => {
    const list = games.data ?? [];
    if (!favsOnly) return list;
    return list.filter(
      (g) =>
        favTeams.includes(g.home.abbreviation) ||
        favTeams.includes(g.away.abbreviation),
    );
  }, [games.data, favsOnly, favTeams]);

  const source = games.result;

  return (
    <div style={accentVars("sports")}>
      <PageHeader
        kicker="Sports"
        title="The Sports Desk"
        subtitle="Scores, market odds, and a data-backed SGP research tool."
        right={source && <SourceBadge source={source.source} note={source.error} />}
      />

      <DisclaimerBanner />

      <div className="no-scrollbar -mx-4 my-4 flex gap-2 overflow-x-auto px-4">
        {(["scores", "odds", "standings", "sgp"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={classNames(
              "chip whitespace-nowrap capitalize",
              tab === t && "chip-active",
            )}
          >
            {t === "sgp" ? "SGP Research" : t}
          </button>
        ))}
      </div>

      {tab !== "sgp" && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          {LEAGUES.map((l) => (
            <button
              key={l}
              onClick={() => setLeague(l)}
              className={classNames(
                "chip text-xs",
                league === l && "chip-active",
              )}
            >
              {l}
            </button>
          ))}
          {tab === "scores" && (
            <button
              onClick={() => setFavsOnly((v) => !v)}
              className={classNames(
                "chip ml-auto whitespace-nowrap text-xs",
                favsOnly && "chip-active",
              )}
            >
              ★ Favorites
            </button>
          )}
        </div>
      )}

      {tab === "scores" && (
        <>
          {games.loading ? (
            <Spinner label="Loading games…" />
          ) : games.error ? (
            <ErrorState
              message={`Couldn't load live scores. ${games.error}`}
              onRetry={games.refetch}
            />
          ) : visibleGames.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              {favsOnly
                ? "No games for your favorite teams right now."
                : "No games scheduled right now."}
            </p>
          ) : (
            <div className="animate-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleGames.map((g) => (
                <ScoreCard
                  key={g.id}
                  game={g}
                  odds={(odds.data ?? []).find((o) => o.gameId === g.id)}
                  favorites={favTeams}
                  onToggleFavorite={toggleFav}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "standings" &&
        (standings.loading ? (
          <Spinner label="Loading standings…" />
        ) : standings.error || !standings.data ? (
          <ErrorState
            message={`Couldn't load standings. ${standings.error ?? ""}`}
            onRetry={standings.refetch}
          />
        ) : (
          <div className="animate-in">
            <p className="mb-3 text-xs text-[var(--muted)]">
              {standingsLeague}
              {league === "All" && " (pick a league above)"}
            </p>
            <StandingsTable standings={standings.data} />
          </div>
        ))}

      {tab === "odds" &&
        (odds.loading ? (
          <Spinner label="Loading odds…" />
        ) : odds.error ? (
          <ErrorState
            message={`Couldn't load live odds. ${odds.error}`}
            onRetry={odds.refetch}
          />
        ) : (
          <div className="space-y-4">
            <Card>
              <h3 className="mb-3 font-semibold">Market Odds</h3>
              <OddsTable games={games.data ?? []} odds={odds.data ?? []} />
            </Card>
            <Card>
              <h3 className="mb-1 font-semibold">Implied Win Probability</h3>
              <p className="mb-3 text-xs text-[var(--muted)]">
                Derived from moneyline odds. Highlighted bars are favorites.
              </p>
              <OddsBarChart games={games.data ?? []} odds={odds.data ?? []} />
            </Card>
          </div>
        ))}

      {tab === "sgp" && (
        <>
          {sgp.loading ? (
            <Spinner label="Building research slip…" />
          ) : sgp.data ? (
            <SgpBuilder rec={sgp.data} />
          ) : (
            <ErrorState
              message={
                sgp.error
                  ? `No live research slip available. ${sgp.error}`
                  : "Could not build a research slip right now."
              }
              onRetry={sgp.refetch}
            />
          )}
        </>
      )}
    </div>
  );
}
