"use client";

import Link from "next/link";
import { useProvider } from "@/lib/useProvider";

// Horizontal "what's trending" strip. Each term deep-links into news search.
export function TrendingTicker() {
  const { data } = useProvider<string[]>("/api/trending");
  const terms = data ?? [];
  if (terms.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2">
      <span className="kicker shrink-0">Trending</span>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {terms.map((t) => (
          <Link
            key={t}
            href={`/news?q=${encodeURIComponent(t)}`}
            className="chip whitespace-nowrap text-xs"
          >
            {t}
          </Link>
        ))}
      </div>
    </div>
  );
}
