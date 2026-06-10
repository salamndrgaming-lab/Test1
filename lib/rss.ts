import { XMLParser } from "fast-xml-parser";

// processEntities:false avoids fast-xml-parser's entity-expansion safety limit
// (Google News feeds pack thousands of HTML entities into item descriptions,
// which trips the default 1000-entity cap). We decode entities ourselves below.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
});

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  source?: string;
  sourceUrl?: string;
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const num =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    const k = code.toLowerCase();
    return k in NAMED ? NAMED[k] : m;
  });
}

function stripHtml(s: string): string {
  // decode entities first so encoded tags (&lt;a&gt;) become real tags, strip
  // them, then decode any remaining entities and collapse whitespace.
  const decoded = decodeEntities(s);
  return decodeEntities(decoded.replace(/<[^>]*>/g, " "))
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
    const source = it.source as
      | { "#text"?: string; "@_url"?: string }
      | undefined;
    return {
      title: stripHtml(String(it.title ?? "")),
      link: String(link ?? ""),
      description: stripHtml(
        String(it.description ?? it.summary ?? it.content ?? ""),
      ),
      pubDate: String(it.pubDate ?? it.published ?? it.updated ?? ""),
      source: source?.["#text"] ? decodeEntities(source["#text"]) : undefined,
      sourceUrl: source?.["@_url"],
    };
  });
}
