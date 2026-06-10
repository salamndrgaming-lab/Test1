"use client";

import type { Article } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { ArticleCard } from "@/components/news/ArticleCard";
import { PageHeader, SourceBadge, Spinner, ErrorState } from "@/components/ui";
import { SentimentGauge } from "@/components/charts/SentimentGauge";

export default function GoodNewsPage() {
  const { result, data, loading, error, refetch } =
    useProvider<Article[]>("/api/good-news");
  const articles = data ?? [];
  const avg =
    articles.length > 0
      ? articles.reduce((s, a) => s + a.sentiment, 0) / articles.length
      : 0;

  return (
    <div>
      <PageHeader
        title="☀ Good News"
        subtitle="Positive-sentiment stories, surfaced from the feed."
        right={
          result && <SourceBadge source={result.source} note={result.error} />
        }
      />

      <div className="mb-5 rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-transparent p-4">
        <div className="flex items-center gap-4">
          <SentimentGauge score={avg} />
          <div>
            <p className="text-sm text-[var(--muted)]">Feed positivity</p>
            <p className="text-2xl font-bold text-good">
              {articles.length} uplifting stories
            </p>
          </div>
        </div>
      </div>

      {loading && <Spinner label="Finding the bright side…" />}
      {!loading && error && (
        <ErrorState
          message={`Couldn't load live news. ${error}`}
          onRetry={refetch}
        />
      )}
      {!loading && !error && articles.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          No positive stories right now — check back soon.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </div>
    </div>
  );
}
