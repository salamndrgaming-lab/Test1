import type { Article } from "@/types";
import { BiasBadge } from "@/components/ui";
import { timeAgo, classNames } from "@/lib/format";
import { sentimentLabel } from "@/lib/sentiment";

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

export function ArticleCard({
  article,
  compact = false,
}: {
  article: Article;
  compact?: boolean;
}) {
  return (
    <a
      href={article.url}
      target={article.url === "#" ? undefined : "_blank"}
      rel="noopener noreferrer"
      className="card block transition-colors hover:border-[var(--accent)]/50"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <BiasBadge lean={article.bias} />
        <span className="text-xs text-[var(--muted)]">{article.source}</span>
        <SentimentDot score={article.sentiment} />
        <span className="ml-auto text-xs text-[var(--muted)]">
          {timeAgo(article.publishedAt)}
        </span>
      </div>
      <h3
        className={classNames(
          "font-semibold leading-snug",
          compact ? "text-sm" : "text-base",
        )}
      >
        {article.title}
      </h3>
      {!compact && (
        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
          {article.summary}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
          {article.category}
        </span>
        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
          {article.scope}
        </span>
      </div>
    </a>
  );
}
