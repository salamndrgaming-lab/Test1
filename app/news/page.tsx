"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Article, BiasLean, NewsCategory, Scope } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { useSettings } from "@/components/SettingsProvider";
import { ArticleCard } from "@/components/news/ArticleCard";
import { TrendingTicker } from "@/components/news/TrendingTicker";
import {
  PageHeader,
  SourceBadge,
  SkeletonCards,
  ErrorState,
  Card,
} from "@/components/ui";
import { ALL_LEANS, LEAN_LABEL, LEAN_SCORE } from "@/lib/bias";
import { classNames } from "@/lib/format";
import { accentVars } from "@/lib/sections";

const CATEGORIES: NewsCategory[] = [
  "top",
  "politics",
  "business",
  "technology",
  "science",
  "health",
  "world",
  "local",
];

type SortKey = "recent" | "bias-l2r" | "bias-r2l" | "positive" | "source";

function NewsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const { settings } = useSettings();

  const [category, setCategory] = useState<NewsCategory>("top");
  const [scope, setScope] = useState<Scope>("national");
  const [leanFilter, setLeanFilter] = useState<BiasLean | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [searchText, setSearchText] = useState(query);

  const place = settings.defaultLocation?.place;
  const needsLocation = !query && scope === "local" && !place;

  // Build the API URL for the active mode.
  const url = useMemo(() => {
    if (query) return `/api/news?q=${encodeURIComponent(query)}`;
    if (scope === "local")
      return place
        ? `/api/news?scope=local&place=${encodeURIComponent(place)}`
        : `/api/news?category=top`; // placeholder; feed hidden by needsLocation
    if (scope === "world") return `/api/news?scope=world`;
    return `/api/news?category=${category}`;
  }, [query, scope, place, category]);

  const { result, data, loading, error, refetch } = useProvider<Article[]>(url);

  const articles = useMemo(() => {
    let list = [...(data ?? [])];
    if (leanFilter !== "all") list = list.filter((a) => a.bias === leanFilter);
    switch (sort) {
      case "recent":
        list.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
        break;
      case "bias-l2r":
        list.sort((a, b) => LEAN_SCORE[a.bias] - LEAN_SCORE[b.bias]);
        break;
      case "bias-r2l":
        list.sort((a, b) => LEAN_SCORE[b.bias] - LEAN_SCORE[a.bias]);
        break;
      case "positive":
        list.sort((a, b) => b.sentiment - a.sentiment);
        break;
      case "source":
        list.sort((a, b) => a.source.localeCompare(b.source));
        break;
    }
    return list;
  }, [data, leanFilter, sort]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    router.push(q ? `/news?q=${encodeURIComponent(q)}` : "/news");
  };

  return (
    <div style={accentVars("news")}>
      <PageHeader
        kicker={query ? "Search" : "The Feed"}
        title={query ? `“${query}”` : "News"}
        subtitle="Search, sort, and filter by location, political lean, and tone."
        right={
          result && <SourceBadge source={result.source} note={result.error} />
        }
      />

      <TrendingTicker />

      {/* Search */}
      <form onSubmit={submitSearch} className="mb-3 flex gap-2">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search news…"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button type="submit" className="btn-primary">
          Search
        </button>
        {query && (
          <Link href="/news" className="chip text-xs">
            Clear
          </Link>
        )}
      </form>

      {/* Scope toggle (hidden during search) */}
      {!query && (
        <div className="mb-3 flex gap-2">
          {(["national", "local", "world"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={classNames(
                "chip capitalize",
                scope === s && "chip-active",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Category tabs (national only) */}
      {!query && scope === "national" && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={classNames(
                "chip whitespace-nowrap capitalize",
                category === c && "chip-active",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Bias filter + sort */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setLeanFilter("all")}
          className={classNames(
            "chip text-xs",
            leanFilter === "all" && "chip-active",
          )}
        >
          All leans
        </button>
        {ALL_LEANS.map((l) => (
          <button
            key={l}
            onClick={() => setLeanFilter(l)}
            className={classNames("chip text-xs", leanFilter === l && "chip-active")}
          >
            {LEAN_LABEL[l]}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
        >
          <option value="recent">Most recent</option>
          <option value="bias-l2r">Bias: Left → Right</option>
          <option value="bias-r2l">Bias: Right → Left</option>
          <option value="positive">Most positive</option>
          <option value="source">Source A–Z</option>
        </select>
      </div>

      {needsLocation ? (
        <Card className="text-center">
          <p className="mb-3 text-sm text-[var(--muted)]">
            Set your location to see local headlines.
          </p>
          <Link href="/settings" className="btn-primary inline-block">
            Choose location
          </Link>
        </Card>
      ) : (
        <>
          {loading && <SkeletonCards count={6} />}
          {!loading && error && (
            <ErrorState
              message={`Couldn't load live headlines. ${error}`}
              onRetry={refetch}
            />
          )}
          {!loading && !error && articles.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              No articles match this filter.
            </p>
          )}
          {!loading && !error && articles.length > 0 && (
            <div className="animate-in grid gap-3 sm:grid-cols-2">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={<SkeletonCards count={6} />}>
      <NewsInner />
    </Suspense>
  );
}
