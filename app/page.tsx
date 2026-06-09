"use client";

import Link from "next/link";
import type { Article, Game, WeatherReport } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { Card, PageHeader, SourceBadge, Spinner, BiasBadge } from "@/components/ui";
import { BiasSpectrum } from "@/components/charts/BiasSpectrum";
import { ScoreCard } from "@/components/sports/ScoreCard";
import { timeAgo } from "@/lib/format";

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
  const news = useProvider<Article[]>("/api/news?category=top");
  const good = useProvider<Article[]>("/api/good-news");
  const sports = useProvider<Game[]>("/api/sports");
  const weather = useProvider<WeatherReport>("/api/weather");

  const top = (news.data ?? []).slice(0, 5);
  const goodTop = (good.data ?? []).slice(0, 3);
  const games = (sports.data ?? []).slice(0, 2);

  return (
    <div>
      <PageHeader
        title="NewsScope"
        subtitle="Your news, from local to national — visualized."
        right={
          news.result && (
            <SourceBadge source={news.result.source} note={news.result.note} />
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top stories */}
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Top Stories</h2>
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
                    target={a.url === "#" ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="flex items-start gap-2"
                  >
                    <BiasBadge lean={a.bias} />
                    <span className="flex-1 text-sm font-medium leading-snug">
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

        {/* Bias snapshot */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Bias Snapshot</h2>
            <SectionLink href="/bias">Explore</SectionLink>
          </div>
          {news.loading ? <Spinner /> : <BiasSpectrum articles={news.data ?? []} />}
        </Card>

        {/* Good news */}
        <Card className="bg-gradient-to-br from-green-500/10 to-transparent">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-good">☀ Good News</h2>
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
            <h2 className="font-semibold">Weather</h2>
            <SectionLink href="/weather">Forecast</SectionLink>
          </div>
          {weather.loading || !weather.data ? (
            <Spinner />
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
            <h2 className="font-semibold">Today&apos;s Games</h2>
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
