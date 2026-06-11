"use client";

import type { Article } from "@/types";
import { usePersistentState } from "@/lib/usePersistentState";
import { FREE_LIMITS } from "@/lib/usePro";

export interface HistoryItem extends Article {
  readAt: string;
}

const HISTORY_CAP = 200;

/**
 * The user's library: bookmarks, read-later queue, and reading history.
 * Local-first; syncs to Supabase `bookmarks`/`history` when configured.
 */
export function useLibrary() {
  const [bookmarks, setBookmarks] = usePersistentState<Article[]>(
    "newsscope.bookmarks",
    [],
  );
  const [readLater, setReadLater] = usePersistentState<Article[]>(
    "newsscope.readLater",
    [],
  );
  const [history, setHistory] = usePersistentState<HistoryItem[]>(
    "newsscope.history",
    [],
  );

  const isBookmarked = (id: string) => bookmarks.some((a) => a.id === id);

  /** Returns "added" | "removed" | "blocked" (free bookmark limit reached). */
  const toggleBookmark = (article: Article, isPro: boolean) => {
    if (isBookmarked(article.id)) {
      setBookmarks((b) => b.filter((a) => a.id !== article.id));
      return "removed" as const;
    }
    if (!isPro && bookmarks.length >= FREE_LIMITS.bookmarks) {
      return "blocked" as const;
    }
    setBookmarks((b) => [article, ...b]);
    return "added" as const;
  };

  const inReadLater = (id: string) => readLater.some((a) => a.id === id);
  const toggleReadLater = (article: Article) =>
    setReadLater((r) =>
      inReadLater(article.id)
        ? r.filter((a) => a.id !== article.id)
        : [article, ...r],
    );

  const recordRead = (article: Article) => {
    if (article.url === "#") return;
    setHistory((h) => {
      const next: HistoryItem[] = [
        { ...article, readAt: new Date().toISOString() },
        ...h.filter((a) => a.id !== article.id),
      ];
      return next.slice(0, HISTORY_CAP);
    });
  };

  const clearHistory = () => setHistory([]);

  return {
    bookmarks,
    readLater,
    history,
    isBookmarked,
    toggleBookmark,
    inReadLater,
    toggleReadLater,
    recordRead,
    clearHistory,
    removeBookmark: (id: string) =>
      setBookmarks((b) => b.filter((a) => a.id !== id)),
    removeReadLater: (id: string) =>
      setReadLater((r) => r.filter((a) => a.id !== id)),
  };
}
