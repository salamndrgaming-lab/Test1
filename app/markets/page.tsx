"use client";

import type { MarketsData } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { PageHeader, SourceBadge, Spinner, ErrorState } from "@/components/ui";
import { QuoteCard } from "@/components/markets/QuoteCard";
import { accentVars } from "@/lib/sections";

export default function MarketsPage() {
  const { result, data, loading, error, refetch } =
    useProvider<MarketsData>("/api/markets");

  return (
    <div style={accentVars("markets")}>
      <PageHeader
        kicker="Business"
        title="Markets"
        subtitle="Major indices and crypto, updated live."
        right={
          result && <SourceBadge source={result.source} note={result.error} />
        }
      />

      {loading ? (
        <Spinner label="Loading markets…" />
      ) : error || !data ? (
        <ErrorState
          message={`Couldn't load markets. ${error ?? ""}`}
          onRetry={refetch}
        />
      ) : (
        <div className="animate-in space-y-6">
          {data.indices.length > 0 && (
            <section>
              <h2 className="mb-2 font-serif text-lg font-medium text-[var(--text)]">
                Indices
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.indices.map((q) => (
                  <QuoteCard key={q.symbol} quote={q} />
                ))}
              </div>
            </section>
          )}
          {data.crypto.length > 0 && (
            <section>
              <h2 className="mb-2 font-serif text-lg font-medium text-[var(--text)]">
                Crypto
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.crypto.map((q) => (
                  <QuoteCard key={q.symbol} quote={q} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
