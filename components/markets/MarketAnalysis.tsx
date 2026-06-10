"use client";

import { useMemo } from "react";
import type { Article, Quote } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { encodeSymbols, DEFAULT_STOCKS, DEFAULT_ETFS } from "@/lib/markets";
import { ArticleCard } from "@/components/news/ArticleCard";
import { Card, Spinner } from "@/components/ui";
import { classNames } from "@/lib/format";

function MoverRow({ q }: { q: Quote }) {
  const up = q.changePct >= 0;
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="truncate font-medium">{q.symbol}</span>
      <span
        className={classNames(
          "tabular-nums",
          up ? "text-good" : "text-bad",
        )}
      >
        {up ? "+" : ""}
        {q.changePct.toFixed(2)}%
      </span>
    </div>
  );
}

export function MarketAnalysis() {
  const symbols = useMemo(
    () => encodeSymbols([...DEFAULT_STOCKS, ...DEFAULT_ETFS]),
    [],
  );
  const quotes = useProvider<Quote[]>(
    `/api/markets/quote?symbols=${encodeURIComponent(symbols)}`,
  );
  const news = useProvider<Article[]>("/api/news?q=stock%20market");

  const { gainers, losers, up, down } = useMemo(() => {
    const list = [...(quotes.data ?? [])].sort(
      (a, b) => b.changePct - a.changePct,
    );
    return {
      gainers: list.slice(0, 5),
      losers: list.slice(-5).reverse(),
      up: list.filter((q) => q.changePct > 0).length,
      down: list.filter((q) => q.changePct < 0).length,
    };
  }, [quotes.data]);

  const total = up + down;
  const upPct = total ? (up / total) * 100 : 50;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 font-semibold">Market Breadth</h3>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Advancers vs decliners across tracked stocks &amp; ETFs.
        </p>
        {quotes.loading ? (
          <Spinner />
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="bg-good" style={{ width: `${upPct}%` }} />
              <div className="bg-bad" style={{ width: `${100 - upPct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs">
              <span className="text-good">{up} advancing</span>
              <span className="text-bad">{down} declining</span>
            </div>
          </>
        )}
      </Card>

      {!quotes.loading && (gainers.length > 0 || losers.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="mb-2 font-semibold text-good">Top Gainers</h3>
            {gainers.map((q) => (
              <MoverRow key={q.symbol} q={q} />
            ))}
          </Card>
          <Card>
            <h3 className="mb-2 font-semibold text-bad">Top Losers</h3>
            {losers.map((q) => (
              <MoverRow key={q.symbol} q={q} />
            ))}
          </Card>
        </div>
      )}

      <div>
        <h3 className="mb-2 font-serif text-lg font-medium text-[var(--text)]">
          Market News
        </h3>
        {news.loading ? (
          <Spinner />
        ) : (news.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-[var(--muted)]">No market news right now.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(news.data ?? []).slice(0, 6).map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
