import type { EntertainmentItem } from "@/types";
import { parseRss } from "@/lib/rss";
import { fetchText, type DataProvider } from "./withFallback";
import { SEED_ENTERTAINMENT } from "@/data/seed-entertainment";

export type EntertainmentParams = Record<string, never>;

const FEED =
  "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en";

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
    return items.slice(0, 12).map((it, i) => {
      const title = it.title.split(" - ")[0];
      return {
        id: `ent-live-${i}`,
        title,
        kind: "movie" as const,
        blurb: it.description || title,
        url: it.link,
        releaseDate: it.pubDate
          ? new Date(it.pubDate).toISOString().slice(0, 10)
          : undefined,
      };
    });
  },
  seed() {
    return SEED_ENTERTAINMENT;
  },
};
