import type { Article, NewsCategory, Scope } from "@/types";
import { applyBias, normalizeDomain } from "@/lib/bias";
import { scoreSentiment } from "@/lib/sentiment";
import { parseRss } from "@/lib/rss";
import { fetchText, type DataProvider } from "./withFallback";
import { SEED_NEWS, type SeedArticle } from "@/data/seed-news";

export interface NewsParams {
  category?: NewsCategory;
  scope?: Scope;
  query?: string;
}

// Map our categories to Google News RSS topic feeds.
const TOPIC_FEED: Partial<Record<NewsCategory, string>> = {
  top: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
  business: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
  technology: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
  science: "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en",
  health: "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-US&gl=US&ceid=US:en",
  world: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
  entertainment:
    "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en",
  sports: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en",
  politics: "https://news.google.com/rss/search?q=politics&hl=en-US&gl=US&ceid=US:en",
};

function feedUrl(params: NewsParams): string {
  if (params.query) {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(params.query)}&hl=en-US&gl=US&ceid=US:en`;
  }
  return TOPIC_FEED[params.category ?? "top"] ?? TOPIC_FEED.top!;
}

// Google News titles look like "Headline - Outlet Name"
function splitTitleSource(title: string): { title: string; source: string } {
  const idx = title.lastIndexOf(" - ");
  if (idx > 0) {
    return { title: title.slice(0, idx), source: title.slice(idx + 3) };
  }
  return { title, source: "Google News" };
}

// Best-effort domain guess from outlet name when RSS omits a source url.
function guessDomain(source: string, link: string): string {
  if (link) {
    try {
      // Google News links are redirectors; fall back to source-name slug.
      const u = new URL(link);
      if (!u.hostname.includes("news.google.com")) {
        return normalizeDomain(u.hostname);
      }
    } catch {
      /* ignore */
    }
  }
  const slug = source.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${slug}.com`;
}

export const newsProvider: DataProvider<NewsParams, Article[]> = {
  name: "Google News RSS",
  async fetchLive(params, signal) {
    const xml = await fetchText(feedUrl(params), signal, {
      "User-Agent": "NewsScope/0.1 (+https://newsscope.example)",
    });
    const items = parseRss(xml);
    if (items.length === 0) throw new Error("empty feed");
    const articles: Article[] = items.slice(0, 40).map((it, i) => {
      const { title, source } = splitTitleSource(it.title);
      const sourceDomain = it.sourceUrl
        ? normalizeDomain(it.sourceUrl)
        : guessDomain(it.source ?? source, it.link);
      const summary = it.description || title;
      return applyBias({
        id: `gn-${i}-${Date.now()}`,
        title,
        summary,
        url: it.link,
        source: it.source ?? source,
        sourceDomain,
        publishedAt: it.pubDate
          ? new Date(it.pubDate).toISOString()
          : new Date().toISOString(),
        category: params.category ?? "top",
        scope: params.scope ?? "national",
        sentiment: scoreSentiment(`${title} ${summary}`),
      });
    });
    return articles;
  },
  seed(params) {
    const now = Date.now();
    let pool: SeedArticle[] = SEED_NEWS;
    if (params.category && params.category !== "top") {
      const filtered = pool.filter((a) => a.category === params.category);
      if (filtered.length >= 3) pool = filtered;
    }
    if (params.scope) {
      const filtered = pool.filter((a) => a.scope === params.scope);
      if (filtered.length >= 3) pool = filtered;
    }
    if (params.query) {
      const q = params.query.toLowerCase();
      const filtered = pool.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q),
      );
      if (filtered.length > 0) pool = filtered;
    }
    return pool.map((a, i) =>
      applyBias({
        id: `seed-${i}`,
        title: a.title,
        summary: a.summary,
        url: "#",
        source: a.source,
        sourceDomain: a.sourceDomain,
        publishedAt: new Date(now - a.hoursAgo * 3600_000).toISOString(),
        category: a.category,
        scope: a.scope,
        imageUrl: a.imageUrl,
        geo: a.geo,
        sentiment: scoreSentiment(`${a.title} ${a.summary}`),
      }),
    );
  },
};
