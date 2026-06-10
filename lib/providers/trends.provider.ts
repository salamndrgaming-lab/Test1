import { parseRss } from "@/lib/rss";
import { fetchText, type DataProvider } from "./withFallback";

export type TrendsParams = { geo?: string };

// Best-effort Google Trends daily trending RSS. This feed is flaky in 2026
// (intermittent 404/redirects), so callers fall back to headline keywords.
export const trendsProvider: DataProvider<TrendsParams, string[]> = {
  name: "Google Trends RSS",
  async fetchLive({ geo = "US" }, signal) {
    const xml = await fetchText(
      `https://trends.google.com/trending/rss?geo=${geo}`,
      signal,
      { "User-Agent": "NewsScope/0.1 (+https://newsscope.example)" },
    );
    const items = parseRss(xml);
    const terms = items.map((i) => i.title).filter(Boolean).slice(0, 12);
    if (terms.length === 0) throw new Error("empty trends feed");
    return terms;
  },
};
