"use client";

import Link from "next/link";
import type { Article, Game, WeatherReport } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { useSettings } from "@/components/SettingsProvider";
import { Card, PageHeader, SourceBadge, Spinner, BiasBadge } from "@/components/ui";
import { BiasSpectrum } from "@/components/charts/BiasSpectrum";
import { FramingGap } from "@/components/news/FramingGap";
import { ScoreCard } from "@/components/sports/ScoreCard";
import { timeAgo } from "@/lib/format";
import { accentVars } from "@/lib/sections";

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-xs font-medium text-[var(--accent)] hover:underline"
    >
      {children} →
    </Link>
  );
}

export default function HomePage() {
  const { settings } = useSettings();
  const place = settings.defaultLocation?.place;

  const news = useProvider<Article[]>("/api/news?category=top");
  // useProvider needs a URL; without a saved place the card prompts instead,
  // so point it at a cheap request we already make.
  const local = useProvider<Article[]>(
    place
      ? `/api/news?scope=local&place=${encodeURIComponent(place)}`
      : "/api/news?category=top",
  );
  const good = useProvider<Article[]>("/api/good-news");
  const sports = useProvider<Game[]>("/api/sports");
  const weather = useProvider<WeatherReport>("/api/weather");

  const top = (news.data ?? []).slice(0, 5);
  const goodTop = (good.data ?? []).slice(0, 3);
  const games = (sports.data ?? []).slice(0, 2);
  const localTop = place ? (local.data ?? []).slice(0, 4) : [];

  return (
    <div style={accentVars("home")}>
      <PageHeader
        kicker="Your Briefing"
        title="NewsScope"
        subtitle="Your news, from local to national — visualized."
        right={
          news.result && (
            <SourceBadge source={news.result.source} note={news.result.error} />
          )
        }
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ["/local", "⌖ Local news"],
            ["/bias", "⇄ Framing gap"],
            ["/outlet/bbc.com", "◫ Outlet profiles"],
            ["/following", "↗ Story momentum"],
            ["/profile", "◎ Your reading"],
            ["/sports", "⚑ SGP model"],
            ["/briefing", "☀ Briefing"],
          ] as [string, string][]
        ).map(([href, label]) => (
          <Link key={href} href={href} className="chip whitespace-nowrap text-xs">
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top stories */}
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-[1.05rem] font-medium text-[var(--text)]">Top Stories</h2>
            <SectionLink href="/news">All news</SectionLink>
          </div>
          {news.loading ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {top.map((a) => (
                <li key={a.id} className="py-2 first:pt-0 last:pb-0">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2"
                  >
                    <BiasBadge lean={a.bias} />
                    <span className="flex-1 font-serif text-[0.95rem] leading-snug text-[var(--text)] transition-colors hover:text-[var(--accent)]">
                      {a.title}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {timeAgo(a.publishedAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Framing gap — the signature feature, on the landing screen */}
        <Card className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-serif text-[1.05rem] font-medium text-[var(--text)]">
              Framing Gap
            </h2>
            <SectionLink href="/bias">Compare a story</SectionLink>
          </div>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Not just who covers the news — the words each side reaches for.
          </p>
          {news.loading ? <Spinner /> : <FramingGap articles={news.data ?? []} />}
        </Card>

        {/* Bias snapshot */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-serif text-[1.05rem] font-medium text-[var(--text)]">Bias Snapshot</h2>
            <SectionLink href="/bias">Explore</SectionLink>
          </div>
          {news.loading ? <Spinner /> : <BiasSpectrum articles={news.data ?? []} />}
        </Card>

        {/* Local — the newsrooms that cover where you live */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-serif text-[1.05rem] font-medium text-[var(--text)]">
              Near You
            </h2>
            <SectionLink href="/local">
              {place ? "All local" : "Set location"}
            </SectionLink>
          </div>
          {!place ? (
            <p className="text-sm text-[var(--muted)]">
              Add your location to pull headlines from the city and statewide
              newsrooms that cover your area.
            </p>
          ) : local.loading ? (
            <Spinner />
          ) : localTop.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No local headlines right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {localTop.map((a) => (
                <li key={a.id} className="text-sm leading-snug">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium transition-colors hover:text-[var(--accent)]"
                  >
                    {a.title}
                  </a>
                  <span className="ml-1 text-xs text-[var(--muted-2)]">
                    {a.source}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Good news */}
        <Card className="bg-gradient-to-br from-green-500/10 to-transparent">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-serif text-[1.05rem] font-medium text-good">Good News</h2>
            <SectionLink href="/good-news">More</SectionLink>
          </div>
          {good.loading ? (
            <Spinner />
          ) : (
            <ul className="space-y-2">
              {goodTop.map((a) => (
                <li key={a.id} className="text-sm font-medium leading-snug">
                  {a.title}
                </li>
              ))}
              {goodTop.length === 0 && (
                <li className="text-sm text-[var(--muted)]">
                  No uplifting stories right now.
                </li>
              )}
            </ul>
          )}
        </Card>

        {/* Weather widget */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-serif text-[1.05rem] font-medium text-[var(--text)]">Weather</h2>
            <SectionLink href="/weather">Forecast</SectionLink>
          </div>
          {weather.loading ? (
            <Spinner />
          ) : !weather.data ? (
            <p className="text-sm text-[var(--muted)]">
              Weather unavailable right now.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold tabular-nums">
                {weather.data.current.tempF}°
              </span>
              <div className="text-sm">
                <p className="font-medium">{weather.data.current.condition}</p>
                <p className="text-[var(--muted)]">{weather.data.current.place}</p>
              </div>
            </div>
          )}
        </Card>

        {/* Today's games */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-[1.05rem] font-medium text-[var(--text)]">Today&apos;s Games</h2>
            <SectionLink href="/sports">Sports</SectionLink>
          </div>
          {sports.loading ? (
            <Spinner />
          ) : (
            <div className="space-y-3">
              {games.map((g) => (
                <ScoreCard key={g.id} game={g} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
