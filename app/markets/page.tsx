"use client";

import { useMemo, useState } from "react";
import type { MarketsData, Quote } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { usePersistentState } from "@/lib/usePersistentState";
import {
  PageHeader,
  SourceBadge,
  Spinner,
  ErrorState,
} from "@/components/ui";
import { QuoteCard } from "@/components/markets/QuoteCard";
import { IpoList } from "@/components/markets/IpoList";
import { MarketAnalysis } from "@/components/markets/MarketAnalysis";
import {
  DEFAULT_ETFS,
  DEFAULT_STOCKS,
  encodeSymbols,
  toStooqSymbol,
} from "@/lib/markets";
import type { StooqSymbol } from "@/lib/providers/stooq";
import { classNames } from "@/lib/format";
import { accentVars } from "@/lib/sections";

type Tab = "overview" | "stocks" | "etfs" | "ipos" | "analysis";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "stocks", label: "Stocks" },
  { id: "etfs", label: "ETFs" },
  { id: "ipos", label: "IPOs" },
  { id: "analysis", label: "Analysis" },
];

function QuoteGrid({ symbols }: { symbols: StooqSymbol[] }) {
  const url = `/api/markets/quote?symbols=${encodeURIComponent(encodeSymbols(symbols))}`;
  const { data, loading, error, refetch } = useProvider<Quote[]>(url);
  if (loading) return <Spinner label="Loading quotes…" />;
  if (error) return <ErrorState message={`Couldn't load quotes. ${error}`} onRetry={refetch} />;
  if (!data || data.length === 0)
    return <p className="text-sm text-[var(--muted)]">No quotes available.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.map((q) => (
        <QuoteCard key={q.symbol} quote={q} />
      ))}
    </div>
  );
}

function StocksTab() {
  const [watchlist, setWatchlist] = usePersistentState<string[]>(
    "newsscope.watchlist",
    [],
  );
  const [input, setInput] = useState("");

  const symbols = useMemo(() => {
    const custom = watchlist.map(toStooqSymbol);
    const seen = new Set<string>();
    return [...DEFAULT_STOCKS, ...custom].filter((s) => {
      if (seen.has(s.stooq)) return false;
      seen.add(s.stooq);
      return true;
    });
  }, [watchlist]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    if (t && !watchlist.includes(t)) setWatchlist((w) => [...w, t]);
    setInput("");
  };

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a ticker (e.g. AAPL)…"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm uppercase"
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>
      {watchlist.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {watchlist.map((t) => (
            <button
              key={t}
              onClick={() => setWatchlist((w) => w.filter((x) => x !== t))}
              className="chip text-xs"
              title="Remove"
            >
              {t} ✕
            </button>
          ))}
        </div>
      )}
      <QuoteGrid symbols={symbols} />
    </div>
  );
}

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const overview = useProvider<MarketsData>("/api/markets");

  return (
    <div style={accentVars("markets")}>
      <PageHeader
        kicker="Business"
        title="Markets"
        subtitle="Indices, stocks, ETFs, crypto, IPOs, and market analysis."
        right={
          tab === "overview" && overview.result ? (
            <SourceBadge
              source={overview.result.source}
              note={overview.result.error}
            />
          ) : undefined
        }
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={classNames(
              "chip whitespace-nowrap",
              tab === t.id && "chip-active",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="animate-in">
        {tab === "overview" &&
          (overview.loading ? (
            <Spinner label="Loading markets…" />
          ) : overview.error || !overview.data ? (
            <ErrorState
              message={`Couldn't load markets. ${overview.error ?? ""}`}
              onRetry={overview.refetch}
            />
          ) : (
            <div className="space-y-6">
              {overview.data.indices.length > 0 && (
                <section>
                  <h2 className="mb-2 font-serif text-lg font-medium text-[var(--text)]">
                    Indices
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {overview.data.indices.map((q) => (
                      <QuoteCard key={q.symbol} quote={q} />
                    ))}
                  </div>
                </section>
              )}
              {overview.data.crypto.length > 0 && (
                <section>
                  <h2 className="mb-2 font-serif text-lg font-medium text-[var(--text)]">
                    Crypto
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {overview.data.crypto.map((q) => (
                      <QuoteCard key={q.symbol} quote={q} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ))}

        {tab === "stocks" && <StocksTab />}
        {tab === "etfs" && <QuoteGrid symbols={DEFAULT_ETFS} />}
        {tab === "ipos" && <IpoList />}
        {tab === "analysis" && <MarketAnalysis />}
      </div>
    </div>
  );
}
