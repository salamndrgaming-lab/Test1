"use client";

import Link from "next/link";
import type { Article, Game, MarketsData, Quote, WeatherReport } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { useProfile } from "@/lib/useProfile";
import { useFollows } from "@/lib/useFollows";
import { usePro } from "@/lib/usePro";
import { usePersistentState } from "@/lib/usePersistentState";
import { useSettings } from "@/components/SettingsProvider";
import { ArticleCard } from "@/components/news/ArticleCard";
import { ScoreCard } from "@/components/sports/ScoreCard";
import { QuoteCard } from "@/components/markets/QuoteCard";
import { PageHeader, Card, Spinner } from "@/components/ui";
import { encodeSymbols, toMarketSymbol } from "@/lib/markets";
import { accentVars } from "@/lib/sections";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-serif text-lg font-medium text-[var(--text)]">
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-xs font-medium text-[var(--accent)]">
            More →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function FollowedTopic({ topic }: { topic: string }) {
  const { data } = useProvider<Article[]>(
    `/api/news?q=${encodeURIComponent(topic)}`,
  );
  const top = (data ?? []).slice(0, 2);
  if (top.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
        {topic}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {top.map((a) => (
          <ArticleCard key={a.id} article={a} compact />
        ))}
      </div>
    </div>
  );
}

export default function BriefingPage() {
  const { profile } = useProfile();
  const { isPro } = usePro();
  const { topics } = useFollows();
  const { settings } = useSettings();
  const [favTeams] = usePersistentState<string[]>("newsscope.favTeams", []);
  const [watchlist] = usePersistentState<string[]>("newsscope.watchlist", []);

  const news = useProvider<Article[]>("/api/news?category=top");
  const good = useProvider<Article[]>("/api/good-news");
  const sports = useProvider<Game[]>("/api/sports");
  const markets = useProvider<MarketsData>("/api/markets");

  const loc = settings.defaultLocation;
  const weather = useProvider<WeatherReport>(
    loc ? `/api/weather?lat=${loc.lat}&lon=${loc.lon}&place=${encodeURIComponent(loc.place)}` : "/api/weather",
  );

  const watchUrl =
    isPro && watchlist.length > 0
      ? `/api/markets/quote?symbols=${encodeURIComponent(encodeSymbols(watchlist.map(toMarketSymbol)))}`
      : "";
  const watch = useProvider<Quote[]>(watchUrl || "/api/markets");

  const games = (sports.data ?? []).filter(
    (g) =>
      favTeams.length === 0 ||
      favTeams.includes(g.home.abbreviation) ||
      favTeams.includes(g.away.abbreviation),
  );
  const topNews = (news.data ?? []).slice(0, 4);
  const goodPick = (good.data ?? [])[0];

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={accentVars("home")}>
      <PageHeader
        kicker={today}
        title={`${greeting()}${profile.displayName ? `, ${profile.displayName}` : ""}`}
        subtitle="Your briefing — tuned to what you follow."
      />

      <div className="space-y-6">
        <Section title="Top Stories" href="/news">
          {news.loading ? (
            <Spinner />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {topNews.map((a) => (
                <ArticleCard key={a.id} article={a} compact />
              ))}
            </div>
          )}
        </Section>

        {isPro && topics.length > 0 && (
          <Section title="Following" href="/following">
            <div className="space-y-4">
              {topics.slice(0, 3).map((t) => (
                <FollowedTopic key={t} topic={t} />
              ))}
            </div>
          </Section>
        )}

        {weather.data && (
          <Section title="Weather" href="/weather">
            <Card className="flex items-center gap-4">
              <span className="text-4xl font-bold tabular-nums">
                {weather.data.current.tempF}°
              </span>
              <div className="text-sm">
                <p className="font-medium">{weather.data.current.condition}</p>
                <p className="text-[var(--muted)]">
                  {weather.data.current.place} · feels{" "}
                  {weather.data.current.feelsLikeF}°
                </p>
              </div>
            </Card>
          </Section>
        )}

        {games.length > 0 && (
          <Section title="Today's Games" href="/sports">
            <div className="grid gap-3 sm:grid-cols-2">
              {games.slice(0, 4).map((g) => (
                <ScoreCard key={g.id} game={g} />
              ))}
            </div>
          </Section>
        )}

        <Section
          title={isPro && watchlist.length > 0 ? "Your Watchlist" : "Markets"}
          href="/markets"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(isPro && watchlist.length > 0
              ? (watch.data ?? [])
              : (markets.data?.indices ?? [])
            )
              .slice(0, 4)
              .map((q) => (
                <QuoteCard key={q.symbol} quote={q} />
              ))}
          </div>
        </Section>

        {goodPick && (
          <Section title="A bit of Good News" href="/good-news">
            <ArticleCard article={goodPick} />
          </Section>
        )}
      </div>

      {!isPro && (
        <Card className="mt-6 text-center">
          <p className="mb-3 text-sm text-[var(--muted)]">
            Go Pro to personalize your briefing with followed stories, your
            watchlist, and a daily email digest.
          </p>
          <Link href="/upgrade" className="btn-primary inline-block">
            Upgrade to Pro
          </Link>
        </Card>
      )}
    </div>
  );
}
