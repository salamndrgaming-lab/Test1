"use client";

import { useState } from "react";
import { useLibrary } from "@/lib/useLibrary";
import { usePro, FREE_LIMITS } from "@/lib/usePro";
import { ArticleCard } from "@/components/news/ArticleCard";
import { UpgradeCard } from "@/components/UpgradeCard";
import { PageHeader } from "@/components/ui";
import { accentVars } from "@/lib/sections";
import { classNames, timeAgo } from "@/lib/format";

type Tab = "saved" | "later" | "history";

export default function SavedPage() {
  const [tab, setTab] = useState<Tab>("saved");
  const { isPro } = usePro();
  const {
    bookmarks,
    readLater,
    history,
    inReadLater,
    toggleReadLater,
    clearHistory,
  } = useLibrary();

  const empty = (msg: string) => (
    <p className="py-10 text-center text-sm text-[var(--muted)]">{msg}</p>
  );

  return (
    <div style={accentVars("home")}>
      <PageHeader
        kicker="Library"
        title="Saved"
        subtitle="Your bookmarks, read-later queue, and reading history."
      />

      <div className="mb-4 flex gap-2">
        {(
          [
            ["saved", `Saved (${bookmarks.length})`],
            ["later", "Read Later"],
            ["history", "History"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={classNames("chip", tab === id && "chip-active")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "saved" && (
        <>
          {!isPro && (
            <p className="mb-3 text-xs text-[var(--muted-2)]">
              {bookmarks.length}/{FREE_LIMITS.bookmarks} free bookmarks used ·{" "}
              <a href="/upgrade" className="text-[var(--accent)]">
                Go Pro for unlimited
              </a>
            </p>
          )}
          {bookmarks.length === 0 ? (
            empty("No bookmarks yet — tap ☆ on any story to save it.")
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {bookmarks.map((a) => (
                <div key={a.id} className="space-y-1">
                  <ArticleCard article={a} />
                  <button
                    onClick={() => toggleReadLater(a)}
                    className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
                  >
                    {inReadLater(a.id) ? "✓ In read later" : "+ Read later"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "later" &&
        (!isPro ? (
          <UpgradeCard feature="Read-later queue" />
        ) : readLater.length === 0 ? (
          empty("Nothing queued. Add stories from your bookmarks.")
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {readLater.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        ))}

      {tab === "history" &&
        (!isPro ? (
          <UpgradeCard feature="Reading history" />
        ) : history.length === 0 ? (
          empty("No reading history yet.")
        ) : (
          <>
            <div className="mb-3 flex justify-end">
              <button onClick={clearHistory} className="chip text-xs">
                Clear history
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {history.map((a) => (
                <div key={`${a.id}-${a.readAt}`} className="space-y-1">
                  <ArticleCard article={a} compact />
                  <p className="text-[0.65rem] text-[var(--muted-2)]">
                    Read {timeAgo(a.readAt)}
                  </p>
                </div>
              ))}
            </div>
          </>
        ))}
    </div>
  );
}
