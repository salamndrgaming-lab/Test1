"use client";

import { useState } from "react";
import type { EntertainmentItem } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { PageHeader, SourceBadge, Spinner, Card, ErrorState } from "@/components/ui";
import { classNames } from "@/lib/format";
import { accentVars } from "@/lib/sections";

const KINDS: (EntertainmentItem["kind"] | "all")[] = [
  "all",
  "movie",
  "tv",
  "music",
  "gaming",
];

const KIND_ICON: Record<EntertainmentItem["kind"], string> = {
  movie: "🎬",
  tv: "📺",
  music: "🎵",
  gaming: "🎮",
  celebrity: "✨",
};

export default function EntertainmentPage() {
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const { result, data, loading, error, refetch } =
    useProvider<EntertainmentItem[]>("/api/entertainment");
  const items = (data ?? []).filter((i) => kind === "all" || i.kind === kind);

  return (
    <div style={accentVars("ent")}>
      <PageHeader
        kicker="Culture"
        title="Entertainment"
        subtitle="Movies, TV, music, and gaming — what's trending."
        right={result && <SourceBadge source={result.source} note={result.error} />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={classNames("chip capitalize", kind === k && "chip-active")}
          >
            {k}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading what's hot…" />
      ) : error ? (
        <ErrorState
          message={`Couldn't load entertainment. ${error}`}
          onRetry={refetch}
        />
      ) : (
        <div className="animate-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} hover>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-2xl">{KIND_ICON[item.kind]}</span>
                {item.rating !== undefined && (
                  <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-sm font-bold tabular-nums text-amber-300">
                    ★ {item.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <h3 className="font-semibold leading-snug">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--accent)]"
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{item.blurb}</p>
              {item.releaseDate && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {item.releaseDate}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
