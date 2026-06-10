import type { EntertainmentItem } from "@/types";
import { parseRss } from "@/lib/rss";
import { fetchText, type DataProvider } from "./withFallback";

export type EntertainmentParams = Record<string, never>;

const FEED =
  "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en";

// Classify a headline into a coarse kind for filtering/iconography.
function classify(text: string): EntertainmentItem["kind"] {
  const t = text.toLowerCase();
  if (/\b(album|song|single|tour|rapper|singer|band|music)\b/.test(t))
    return "music";
  if (/\b(game|gaming|playstation|xbox|nintendo|steam)\b/.test(t))
    return "gaming";
  if (/\b(series|season|episode|tv|streaming|netflix|hbo|hulu)\b/.test(t))
    return "tv";
  return "movie";
}

export const entertainmentProvider: DataProvider<
  EntertainmentParams,
  EntertainmentItem[]
> = {
  name: "Entertainment RSS",
  async fetchLive(_params, signal) {
    const xml = await fetchText(FEED, signal, {
      "User-Agent": "NewsScope/0.1 (+https://newsscope.example)",
    });
    const items = parseRss(xml);
    if (items.length === 0) throw new Error("empty feed");
    return items
      .filter((it) => it.title && it.link)
      .slice(0, 18)
      .map((it, i) => {
        const title = it.title.split(" - ")[0];
        return {
          id: `ent-${i}`,
          title,
          kind: classify(`${title} ${it.description}`),
          blurb: it.description || title,
          url: it.link,
          releaseDate: it.pubDate
            ? new Date(it.pubDate).toISOString().slice(0, 10)
            : undefined,
        };
      });
  },
};
