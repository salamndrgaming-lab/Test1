import type { League } from "@/types";
import { parseRss, type RssItem } from "@/lib/rss";

/**
 * Reporting about the teams on the slate, for the assistant only.
 *
 * This feed deliberately never touches the statistical model. It is not an
 * input to the ratings, the projection, the consensus, the price edge, or
 * the expected value of anything — and it must not become one. Those
 * numbers are measured against outcomes; a headline is not.
 *
 * What it is for is the thing the numbers genuinely cannot do:
 *
 *  - EXPLAINING A MOVE. When a line has shifted and the model does not know
 *    why, a report naming a suspension or a late scratch tells the user the
 *    market has information and we are behind it. That is useful precisely
 *    because it is NOT edge.
 *  - FILLING A KNOWN BLIND SPOT. The app detects that players are out but
 *    deliberately never weights them, because the feed cannot tell a starter
 *    from a third-stringer. Reporting sometimes can, which makes it a reason
 *    to distrust a bet.
 *
 * What it is NOT for is generating opinions that beat the market. Public
 * reporting is public: the closing line has read it too, usually within
 * minutes. Across 53,600 tested games every situational factor we could
 * quantify — weather, rest, roof, division, quarterback changes, injury
 * reports — was already priced. There is no reason to think the qualitative
 * versions behave differently, and every reason to think a confident
 * narrative built on them feels like insight while being noise.
 */

/** Per-league reporting, plus two general sports desks. */
const LEAGUE_FEEDS: Record<League, string[]> = {
  NFL: ["https://www.espn.com/espn/rss/nfl/news"],
  NBA: ["https://www.espn.com/espn/rss/nba/news"],
  MLB: ["https://www.espn.com/espn/rss/mlb/news"],
  NHL: ["https://www.espn.com/espn/rss/nhl/news"],
  NCAAF: ["https://www.espn.com/espn/rss/ncf/news"],
  NCAAB: ["https://www.espn.com/espn/rss/ncb/news"],
};
const GENERAL_FEEDS = [
  "https://www.espn.com/espn/rss/news",
  "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
];

export interface NewsNote {
  headline: string;
  source: string;
  /** ISO timestamp, or undefined when the feed omitted one. */
  published?: string;
  /** Hours old at fetch time — staleness has to be visible to be weighed. */
  ageHours?: number;
  link: string;
  /** Slate teams this item appears to be about. */
  mentions: string[];
}

const UA =
  "Mozilla/5.0 (compatible; NewsScope/1.0; +https://github.com/salamndrgaming-lab)";

async function fetchFeed(url: string, signal?: AbortSignal): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      signal,
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml" },
      // Shared across requests: reporting does not change by the second, and
      // a chat message should not pay for a cold fetch of six feeds.
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}

/**
 * Words from a team name worth matching on.
 *
 * Short and common tokens are dropped because "New", "State" and "City"
 * would match most of the sports wire. A headline is only claimed as being
 * about a team when a distinctive word hits.
 */
const STOPWORDS = new Set([
  "the", "new", "state", "city", "university", "college", "of", "at", "fc",
  "united", "club", "team", "saint", "st", "a", "and", "los", "san", "las",
]);
function tokensFor(name: string): string[] {
  return name
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));
}

/**
 * Reporting that mentions at least one team playing today.
 *
 * Matching is conservative on purpose: a false positive would hand the
 * assistant a story about a different team and invite it to reason from
 * something untrue, which is worse than returning nothing.
 */
export async function fetchSlateNews(
  teams: { name: string; league: League }[],
  signal?: AbortSignal,
  limit = 25,
): Promise<NewsNote[]> {
  const leagues = [...new Set(teams.map((t) => t.league))];
  const urls = [
    ...leagues.flatMap((l) => LEAGUE_FEEDS[l] ?? []),
    ...GENERAL_FEEDS,
  ];
  if (urls.length === 0) return [];

  const feeds = await Promise.all(urls.map((u) => fetchFeed(u, signal)));
  const now = Date.now();
  const seen = new Set<string>();
  const out: NewsNote[] = [];

  for (const items of feeds) {
    for (const it of items) {
      if (!it.title || seen.has(it.link || it.title)) continue;
      const hay = `${it.title} ${it.description ?? ""}`.toLowerCase();
      const mentions = teams
        .filter((t) =>
          tokensFor(t.name).some((tok) => hay.includes(tok.toLowerCase())),
        )
        .map((t) => t.name);
      if (mentions.length === 0) continue;

      const published = it.pubDate ? new Date(it.pubDate) : null;
      const valid = published && Number.isFinite(published.getTime());
      seen.add(it.link || it.title);
      out.push({
        headline: it.title.trim(),
        source: it.source ?? "sports wire",
        published: valid ? published!.toISOString() : undefined,
        ageHours: valid
          ? Number(((now - published!.getTime()) / 3_600_000).toFixed(1))
          : undefined,
        link: it.link,
        mentions: [...new Set(mentions)],
      });
    }
  }

  // Freshest first; undated items last, since their weight is unknowable.
  return out
    .sort((a, b) => (a.ageHours ?? 1e6) - (b.ageHours ?? 1e6))
    .slice(0, limit);
}
