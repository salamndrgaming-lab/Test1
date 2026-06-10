"use client";

import { useState } from "react";
import type { Game, MarketOdds, SgpRecommendation } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { PageHeader, SourceBadge, Spinner, Card, ErrorState } from "@/components/ui";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { ScoreCard } from "@/components/sports/ScoreCard";
import { OddsTable } from "@/components/sports/OddsTable";
import { OddsBarChart } from "@/components/charts/OddsBarChart";
import { SgpBuilder } from "@/components/sports/SgpBuilder";
import { classNames } from "@/lib/format";
import { accentVars } from "@/lib/sections";

type Tab = "scores" | "odds" | "sgp";

export default function SportsPage() {
  const [tab, setTab] = useState<Tab>("scores");
  const games = useProvider<Game[]>("/api/sports");
  const odds = useProvider<MarketOdds[]>("/api/odds");
  const sgp = useProvider<SgpRecommendation>("/api/sgp");

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

      <div className="my-4 flex gap-2">
        {(["scores", "odds", "sgp"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={classNames(
              "chip capitalize",
              tab === t && "chip-active",
            )}
          >
            {t === "sgp" ? "SGP Research" : t}
          </button>
        ))}
      </div>

      {tab === "scores" && (
        <>
          {games.loading ? (
            <Spinner label="Loading games…" />
          ) : games.error ? (
            <ErrorState
              message={`Couldn't load live scores. ${games.error}`}
              onRetry={games.refetch}
            />
          ) : (games.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              No games scheduled right now.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(games.data ?? []).map((g) => (
                <ScoreCard key={g.id} game={g} />
              ))}
            </div>
          )}
        </>
      )}

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
