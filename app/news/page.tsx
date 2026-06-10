"use client";

import { useMemo, useState } from "react";
import type { Article, BiasLean, NewsCategory } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { ArticleCard } from "@/components/news/ArticleCard";
import {
  PageHeader,
  SourceBadge,
  SkeletonCards,
  ErrorState,
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

export default function NewsPage() {
  const [category, setCategory] = useState<NewsCategory>("top");
  const [leanFilter, setLeanFilter] = useState<BiasLean | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const { result, data, loading, error, refetch } = useProvider<Article[]>(
    `/api/news?category=${category}`,
  );

  const articles = useMemo(() => {
    let list = [...(data ?? [])];
    if (leanFilter !== "all") list = list.filter((a) => a.bias === leanFilter);
    switch (sort) {
      case "recent":
        list.sort(
          (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt),
        );
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

  return (
    <div style={accentVars("news")}>
      <PageHeader
        kicker="The Feed"
        title="News"
        subtitle="Sort and filter the feed by category, political lean, and tone."
        right={
          result && <SourceBadge source={result.source} note={result.error} />
        }
      />

      {/* Category tabs */}
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
            className={classNames(
              "chip text-xs",
              leanFilter === l && "chip-active",
            )}
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
    </div>
  );
}
