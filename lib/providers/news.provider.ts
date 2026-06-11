import type { Article, NewsCategory, Scope } from "@/types";
import { applyBias, normalizeDomain } from "@/lib/bias";
import { scoreSentiment } from "@/lib/sentiment";
import { parseRss, type RssItem } from "@/lib/rss";
import { fetchText, type DataProvider } from "./withFallback";
import { selectFeeds, type PublisherFeed } from "@/lib/feeds";

export interface NewsParams {
  category?: NewsCategory;
  scope?: Scope;
  query?: string;
  place?: string; // for scope === "local"
}

const UA = {
  "User-Agent": "NewsScope/0.1 (+https://newsscope.example)",
};

// ---- Google News RSS (used for search, local, and as a fallback) ----

const GN_TOPIC: Partial<Record<NewsCategory, string>> = {
  top: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
  business: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
  technology: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
  science: "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en",
  health: "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-US&gl=US&ceid=US:en",
  world: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
  entertainment: "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en",
  sports: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en",
  politics: "https://news.google.com/rss/search?q=politics&hl=en-US&gl=US&ceid=US:en",
};

function gnSearch(q: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

function splitTitleSource(title: string): { title: string; source: string } {
  const idx = title.lastIndexOf(" - ");
  if (idx > 0) return { title: title.slice(0, idx), source: title.slice(idx + 3) };
  return { title, source: "Google News" };
}

function guessDomain(source: string, link: string): string {
  if (link) {
    try {
      const u = new URL(link);
      if (!u.hostname.includes("news.google.com")) return normalizeDomain(u.hostname);
    } catch {
      /* ignore */
    }
  }
  return `${source.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
}

async function googleNews(
  url: string,
  params: NewsParams,
  signal: AbortSignal,
): Promise<Article[]> {
  const xml = await fetchText(url, signal, UA);
  const items = parseRss(xml);
  if (items.length === 0) throw new Error("empty feed");
  return items
    .filter((it) => it.title && it.link)
    .slice(0, 48)
    .map((it, i) => {
      const { title, source } = splitTitleSource(it.title);
      const sourceName = it.source ?? source;
      const sourceDomain = it.sourceUrl
        ? normalizeDomain(it.sourceUrl)
        : guessDomain(sourceName, it.link);
      const summary = it.description || title;
      return applyBias({
        id: `gn-${i}`,
        title,
        summary,
        url: it.link,
        imageUrl: it.image,
        source: sourceName,
        sourceDomain,
        publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
        category: params.category ?? "top",
        scope: params.scope ?? "national",
        sentiment: scoreSentiment(`${title} ${summary}`),
      });
    });
}

// ---- Direct publisher feeds (primary discovery) ----

function itemToArticle(
  it: RssItem,
  feed: PublisherFeed,
  category: NewsCategory,
  idx: number,
): Article {
  const summary = it.description || it.title;
  return applyBias({
    id: `pf-${feed.domain}-${idx}`,
    title: it.title,
    summary,
    url: it.link,
    imageUrl: it.image,
    source: feed.source,
    sourceDomain: feed.domain,
    publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
    category,
    scope: feed.scope,
    sentiment: scoreSentiment(`${it.title} ${summary}`),
  });
}

async function publisherFeeds(
  params: NewsParams,
  signal: AbortSignal,
): Promise<Article[]> {
  const category = params.category ?? "top";
  const feeds = selectFeeds(category, params.scope);
  if (feeds.length === 0) return [];

  const settled = await Promise.allSettled(
    feeds.map((f) =>
      fetchText(f.url, signal, UA).then((xml) => ({ f, items: parseRss(xml) })),
    ),
  );

  const articles: Article[] = [];
  const seen = new Set<string>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const { f, items } = r.value;
    items
      .filter((it) => it.title && it.link)
      .slice(0, 8)
      .forEach((it, i) => {
        const key = it.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return;
        seen.add(key);
        articles.push(itemToArticle(it, f, category, articles.length + i));
      });
  }

  articles.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return articles.slice(0, 48);
}

export const newsProvider: DataProvider<NewsParams, Article[]> = {
  name: "Publisher RSS + Google News",
  async fetchLive(params, signal) {
    // keyword search and local feeds: Google News (publisher feeds can't search)
    if (params.query) return googleNews(gnSearch(params.query), params, signal);
    if (params.scope === "local" && params.place) {
      return googleNews(gnSearch(`${params.place} local news`), params, signal);
    }

    // primary: direct publisher feeds (clean source, accurate bias, images)
    try {
      const articles = await publisherFeeds(params, signal);
      if (articles.length >= 5) return articles;
    } catch {
      /* fall through to Google News */
    }

    // fallback: Google News topic feed
    const cat = params.category ?? "top";
    const topic = params.scope === "world" ? GN_TOPIC.world! : GN_TOPIC[cat] ?? GN_TOPIC.top!;
    return googleNews(topic, params, signal);
  },
};
