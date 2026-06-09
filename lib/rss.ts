import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  source?: string;
  sourceUrl?: string;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse an RSS/Atom feed string into a normalized list of items. */
export function parseRss(xml: string): RssItem[] {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? doc?.feed;
  if (!channel) return [];

  const rawItems = channel.item ?? channel.entry ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.map((it: Record<string, unknown>): RssItem => {
    const link =
      typeof it.link === "string"
        ? it.link
        : ((it.link as Record<string, string>)?.["@_href"] ??
          (Array.isArray(it.link)
            ? (it.link[0] as Record<string, string>)?.["@_href"]
            : "") ??
          "");
    const source = it.source as { "#text"?: string; "@_url"?: string } | undefined;
    return {
      title: stripHtml(String(it.title ?? "")),
      link: String(link ?? ""),
      description: stripHtml(
        String(it.description ?? it.summary ?? it.content ?? ""),
      ),
      pubDate: String(it.pubDate ?? it.published ?? it.updated ?? ""),
      source: source?.["#text"],
      sourceUrl: source?.["@_url"],
    };
  });
}
