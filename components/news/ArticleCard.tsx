"use client";
/* eslint-disable @next/next/no-img-element -- external thumbnails/favicons; plain img avoids next/image remote-cost + hotlink issues */

import type { Article } from "@/types";
import { BiasBadge } from "@/components/ui";
import { timeAgo, classNames } from "@/lib/format";
import { sentimentLabel } from "@/lib/sentiment";
import { useLibrary } from "@/lib/useLibrary";
import { usePro } from "@/lib/usePro";
import { useArticleModal } from "@/components/ArticleModalProvider";

function SentimentDot({ score }: { score: number }) {
  const label = sentimentLabel(score);
  const cls =
    label === "positive"
      ? "bg-good"
      : label === "negative"
        ? "bg-bad"
        : "bg-neutral-500";
  return (
    <span
      title={`Sentiment: ${label} (${score.toFixed(2)})`}
      className={classNames("h-2.5 w-2.5 rounded-full", cls)}
    />
  );
}

const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = "none";
};

export function ArticleCard({
  article,
  compact = false,
}: {
  article: Article;
  compact?: boolean;
}) {
  const { isBookmarked, toggleBookmark } = useLibrary();
  const { isPro } = usePro();
  const { open } = useArticleModal();
  const saved = isBookmarked(article.id);
  const favicon = `https://www.google.com/s2/favicons?domain=${article.sourceDomain}&sz=64`;
  const thumbSize = compact ? "h-12 w-12" : "h-[4.25rem] w-[4.25rem]";

  const onBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (toggleBookmark(article, isPro) === "blocked") {
      window.location.href = "/upgrade";
    }
  };

  // open the in-app synopsis; let modified clicks open the publisher directly
  const onCardClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    open(article);
  };

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onCardClick}
      className="card card-hover group block"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <BiasBadge lean={article.bias} />
        <img
          src={favicon}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          onError={hideOnError}
          className="h-4 w-4 rounded-sm"
        />
        <span className="text-xs font-medium text-[var(--muted)]">
          {article.source}
        </span>
        <SentimentDot score={article.sentiment} />
        <button
          onClick={onBookmark}
          aria-label={saved ? "Remove bookmark" : "Bookmark"}
          className={classNames(
            "ml-auto text-sm leading-none transition-colors",
            saved
              ? "text-[var(--accent)]"
              : "text-[var(--muted-2)] hover:text-[var(--accent)]",
          )}
        >
          {saved ? "★" : "☆"}
        </button>
        <span className="text-xs text-[var(--muted-2)]">
          {timeAgo(article.publishedAt)}
        </span>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={classNames(
              "font-serif font-medium leading-snug tracking-tight text-[var(--text)] transition-colors group-hover:text-[var(--accent)]",
              compact ? "text-[0.95rem]" : "text-[1.05rem]",
            )}
          >
            {article.title}
          </h3>
          {!compact && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
              {article.summary}
            </p>
          )}
        </div>
        {article.imageUrl && (
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            onError={hideOnError}
            className={classNames(
              "shrink-0 rounded-lg object-cover",
              thumbSize,
            )}
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[0.6rem] font-medium uppercase tracking-wider text-[var(--muted-2)]">
        <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5">
          {article.category}
        </span>
        <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5">
          {article.scope}
        </span>
        <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
          Read →
        </span>
      </div>
    </a>
  );
}
