"use client";
/* eslint-disable @next/next/no-img-element -- external article images */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Article, ArticleSynopsis, ProviderResult } from "@/types";
import { BiasBadge } from "@/components/ui";
import { useLibrary } from "@/lib/useLibrary";
import { usePro } from "@/lib/usePro";
import { timeAgo, classNames } from "@/lib/format";

interface Ctx {
  open: (article: Article) => void;
}
const ArticleModalContext = createContext<Ctx | null>(null);

export function useArticleModal(): Ctx {
  const ctx = useContext(ArticleModalContext);
  if (!ctx)
    throw new Error("useArticleModal must be used within ArticleModalProvider");
  return ctx;
}

export function ArticleModalProvider({ children }: { children: ReactNode }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [syn, setSyn] = useState<ArticleSynopsis | null>(null);
  const [loading, setLoading] = useState(false);
  const { isBookmarked, toggleBookmark, recordRead } = useLibrary();
  const { isPro } = usePro();

  const open = useCallback(
    (a: Article) => {
      setArticle(a);
      setSyn(null);
      recordRead(a);
    },
    [recordRead],
  );

  const close = useCallback(() => setArticle(null), []);

  // fetch synopsis when an article opens
  useEffect(() => {
    if (!article || article.url === "#") return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/article?url=${encodeURIComponent(article.url)}`)
      .then((r) => r.json())
      .then((j: ProviderResult<ArticleSynopsis>) => {
        if (!cancelled) setSyn(j.data);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [article]);

  // close on Escape
  useEffect(() => {
    if (!article) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [article, close]);

  const image = syn?.image || article?.imageUrl;
  const synopsisText =
    syn?.synopsis || article?.summary || "Open the full story to read more.";
  const saved = article ? isBookmarked(article.id) : false;

  return (
    <ArticleModalContext.Provider value={{ open }}>
      {children}
      {article && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-3xl"
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
            >
              ✕
            </button>

            {image && (
              <img
                src={image}
                alt=""
                onError={(e) => (e.currentTarget.style.display = "none")}
                className="h-44 w-full rounded-t-3xl object-cover sm:h-52"
              />
            )}

            <div className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <BiasBadge lean={article.bias} />
                <span className="text-xs font-medium text-[var(--muted)]">
                  {syn?.siteName || article.source}
                </span>
                <span className="ml-auto text-xs text-[var(--muted-2)]">
                  {timeAgo(article.publishedAt)}
                </span>
              </div>

              <h2 className="font-serif text-xl font-medium leading-snug text-[var(--text)]">
                {syn?.title || article.title}
              </h2>

              {loading && !syn ? (
                <div className="mt-3 space-y-2">
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-11/12" />
                  <div className="skeleton h-4 w-3/4" />
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                  {synopsisText}
                </p>
              )}

              <p className="mt-3 text-[0.7rem] text-[var(--muted-2)]">
                Synopsis from {article.source}. Read the full article on their
                site.
              </p>

              <div className="mt-4 flex items-center gap-2">
                <a
                  href={syn?.url || article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary flex-1 text-center"
                >
                  Read full story →
                </a>
                <button
                  onClick={() => {
                    if (toggleBookmark(article, isPro) === "blocked")
                      window.location.href = "/upgrade";
                  }}
                  aria-label={saved ? "Remove bookmark" : "Bookmark"}
                  className={classNames(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-lg",
                    saved ? "text-[var(--accent)]" : "text-[var(--muted-2)]",
                  )}
                >
                  {saved ? "★" : "☆"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ArticleModalContext.Provider>
  );
}
