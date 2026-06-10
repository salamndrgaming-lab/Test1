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
      target="_blank"
      rel="noopener noreferrer"
      className="card card-hover group block"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <BiasBadge lean={article.bias} />
        <span className="text-xs font-medium text-[var(--muted)]">
          {article.source}
        </span>
        <SentimentDot score={article.sentiment} />
        <span className="ml-auto text-xs text-[var(--muted-2)]">
          {timeAgo(article.publishedAt)}
        </span>
      </div>
      <h3
        className={classNames(
          "font-serif font-medium leading-snug tracking-tight text-[#f8fafc] transition-colors group-hover:text-[var(--accent)]",
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
