"use client";

import type { IpoData, IpoEntry } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { Card, Spinner, ErrorState } from "@/components/ui";

function IpoRow({ ipo }: { ipo: IpoEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border-soft)] py-2 first:border-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{ipo.company}</p>
        <p className="text-xs text-[var(--muted-2)]">
          {ipo.symbol}
          {ipo.exchange ? ` · ${ipo.exchange}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right text-sm">
        {ipo.priceRange && (
          <p className="tabular-nums">${ipo.priceRange}</p>
        )}
        {ipo.date && (
          <p className="text-xs text-[var(--muted)]">{ipo.date}</p>
        )}
      </div>
    </div>
  );
}

export function IpoList() {
  const { data, loading, error, refetch } =
    useProvider<IpoData>("/api/markets/ipos");

  if (loading) return <Spinner label="Loading IPO calendar…" />;
  if (error || !data)
    return (
      <ErrorState message={`Couldn't load IPOs. ${error ?? ""}`} onRetry={refetch} />
    );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h3 className="mb-2 font-semibold">Upcoming</h3>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No upcoming IPOs listed.</p>
        ) : (
          data.upcoming.slice(0, 15).map((i) => (
            <IpoRow key={`${i.symbol}-${i.company}`} ipo={i} />
          ))
        )}
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Recently Priced</h3>
        {data.priced.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No priced IPOs this month.</p>
        ) : (
          data.priced.slice(0, 15).map((i) => (
            <IpoRow key={`${i.symbol}-${i.company}`} ipo={i} />
          ))
        )}
      </Card>
    </div>
  );
}
