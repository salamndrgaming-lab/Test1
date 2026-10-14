"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { AdSlot } from "@/components/ads/AdSlot";
import type { Article } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { useSettings } from "@/components/SettingsProvider";
import { ArticleCard } from "@/components/news/ArticleCard";
import {
  PageHeader,
  SourceBadge,
  SkeletonCards,
  ErrorState,
  Card,
} from "@/components/ui";
import { selectLocalFeeds, parsePlace } from "@/lib/local-feeds";
import { classNames } from "@/lib/format";
import { accentVars } from "@/lib/sections";

type Level = "all" | "metro" | "state";
type SortKey = "recent" | "positive" | "source";

const LEVELS: [Level, string][] = [
  ["all", "Everything"],
  ["metro", "My city"],
  ["state", "Statewide"],
];

export default function LocalPage() {
  const { settings } = useSettings();
  const [level, setLevel] = useState<Level>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const place = settings.defaultLocation?.place;

  // The feed list is a pure function of the place, so the page can name its
  // newsrooms immediately — before any article has loaded.
  const feeds = useMemo(() => (place ? selectLocalFeeds(place) : []), [place]);
  const parsed = useMemo(() => (place ? parsePlace(place) : null), [place]);

  const url = place
    ? `/api/news?scope=local&place=${encodeURIComponent(place)}${level === "all" ? "" : `&level=${level}`}`
    : null;

  const { result, data, loading, error, refetch } = useProvider<Article[]>(
    url ?? "/api/news?category=top",
  );

  const visibleFeeds = feeds.filter(
    (f) => level === "all" || f.level === level,
  );

  const articles = useMemo(() => {
    let list = [...(data ?? [])];
    if (sourceFilter) list = list.filter((a) => a.sourceDomain === sourceFilter);
    switch (sort) {
      case "recent":
        list.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
        break;
      case "positive":
        list.sort((a, b) => b.sentiment - a.sentiment);
        break;
      case "source":
        list.sort((a, b) => a.source.localeCompare(b.source));
        break;
    }
    return list;
  }, [data, sort, sourceFilter]);

  // Which outlets actually came back, so the UI reflects reality rather than
  // the curated list (a feed can move or go quiet at any time).
  const liveSources = useMemo(() => {
    const counts = new Map<string, { source: string; count: number }>();
    for (const a of data ?? []) {
      const prev = counts.get(a.sourceDomain);
      counts.set(a.sourceDomain, {
        source: a.source,
        count: (prev?.count ?? 0) + 1,
      });
    }
    return [...counts.entries()]
      .map(([domain, v]) => ({ domain, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  if (!place) {
    return (
      <div style={accentVars("local")}>
        <PageHeader
          kicker="Local"
          title="Local News"
          subtitle="Headlines from the newsrooms that actually cover where you live."
        />
        <Card className="text-center">
          <p className="mb-1 text-sm text-[var(--text)]">
            Set your location to turn this on.
          </p>
          <p className="mb-4 text-xs text-[var(--muted)]">
            We use it to pick the city and statewide newsrooms that cover your
            area. It stays on your device.
          </p>
          <Link href="/settings" className="btn-primary inline-block">
            Choose location
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div style={accentVars("local")}>
      <PageHeader
        kicker="Local"
        title={parsed?.city ? titleCase(parsed.city) : "Local News"}
        subtitle={
          feeds.length > 0
            ? `${feeds.length} newsroom${feeds.length === 1 ? "" : "s"} covering ${place}.`
            : `No dedicated newsroom for ${place} in our directory yet — showing a local news search instead.`
        }
        right={result && <SourceBadge source={result.source} note={result.error} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {LEVELS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setLevel(id);
              setSourceFilter(null);
            }}
            className={classNames("chip", level === id && "chip-active")}
          >
            {label}
          </button>
        ))}
        <Link href="/settings" className="chip ml-auto text-xs">
          Change location
        </Link>
      </div>

      {/* The newsrooms behind this feed, named up front. */}
      {visibleFeeds.length > 0 && (
        <Card className="mb-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg font-medium text-[var(--text)]">
              Your newsrooms
            </h2>
            {sourceFilter && (
              <button
                onClick={() => setSourceFilter(null)}
                className="text-xs text-[var(--accent)] underline underline-offset-2"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleFeeds.map((f) => {
              const live = liveSources.find((s) => s.domain === f.domain);
              const active = sourceFilter === f.domain;
              return (
                <button
                  key={f.domain}
                  disabled={!live}
                  onClick={() => setSourceFilter(active ? null : f.domain)}
                  title={
                    live
                      ? `${live.count} stories — tap to filter`
                      : "No stories from this feed right now"
                  }
                  className={classNames(
                    "chip text-xs",
                    active && "chip-active",
                    !live && "opacity-40",
                  )}
                >
                  {f.source}
                  {f.level === "state" && (
                    <span className="ml-1 text-[0.6rem] text-[var(--muted-2)]">
                      statewide
                    </span>
                  )}
                  {live && (
                    <span className="ml-1 tabular-nums text-[var(--muted-2)]">
                      {live.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--muted-2)]">
            Direct RSS from each newsroom, topped up with a local news search.
            Dimmed outlets published nothing we could read just now. Most local
            outlets aren&apos;t in our bias dataset, so their lean shows as
            unrated rather than guessed.
          </p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--muted-2)]">
          {articles.length} stor{articles.length === 1 ? "y" : "ies"}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
        >
          <option value="recent">Most recent</option>
          <option value="positive">Most positive</option>
          <option value="source">Source A–Z</option>
        </select>
      </div>

      {loading && <SkeletonCards count={6} />}
      {!loading && error && (
        <ErrorState
          message={`Couldn't load local headlines. ${error}`}
          onRetry={refetch}
        />
      )}
      {!loading && !error && articles.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          Nothing published here right now.
        </p>
      )}
      {!loading && !error && articles.length > 0 && (
        <div className="animate-in grid gap-3 sm:grid-cols-2">
          {articles.map((a, i) => (
            <Fragment key={a.id}>
              <ArticleCard article={a} />
              {i === 5 && (
                <div className="sm:col-span-2">
                  <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED} />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
