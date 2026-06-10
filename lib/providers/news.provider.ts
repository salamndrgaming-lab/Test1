import type { Article, NewsCategory, Scope } from "@/types";
import { applyBias, normalizeDomain } from "@/lib/bias";
import { scoreSentiment } from "@/lib/sentiment";
import { parseRss } from "@/lib/rss";
import { fetchText, type DataProvider } from "./withFallback";

export interface NewsParams {
  category?: NewsCategory;
  scope?: Scope;
  query?: string;
  place?: string; // for scope === "local"
}

// Map our categories to Google News RSS topic feeds (keyless).
const TOPIC_FEED: Partial<Record<NewsCategory, string>> = {
  top: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
  business:
    "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
  technology:
    "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
  science:
    "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en",
  health:
    "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-US&gl=US&ceid=US:en",
  world:
    "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
  entertainment:
    "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en",
  sports:
    "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en",
  politics:
    "https://news.google.com/rss/search?q=politics&hl=en-US&gl=US&ceid=US:en",
  local:
    "https://news.google.com/rss/search?q=local%20news&hl=en-US&gl=US&ceid=US:en",
};

function search(q: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

function feedUrl(params: NewsParams): string {
  if (params.query) return search(params.query);
  // local-first: query Google News for the user's place
  if (params.scope === "local" && params.place) {
    return search(`${params.place} local news`);
  }
  if (params.scope === "world") return TOPIC_FEED.world!;
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

function guessDomain(source: string, link: string): string {
  if (link) {
    try {
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
          url: it.link, // Google News link redirects to the original source
          source: sourceName,
          sourceDomain,
          publishedAt: it.pubDate
            ? new Date(it.pubDate).toISOString()
            : new Date().toISOString(),
          category: params.category ?? "top",
          scope: params.scope ?? "national",
          sentiment: scoreSentiment(`${title} ${summary}`),
        });
      });
  },
};
