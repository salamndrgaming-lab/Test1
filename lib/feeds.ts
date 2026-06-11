import type { NewsCategory, Scope } from "@/types";

export interface PublisherFeed {
  url: string;
  source: string;
  domain: string; // for accurate bias lookup (present in bias-outlets.json)
  categories: NewsCategory[]; // which tabs this feed serves
  scope: Scope;
}

// Curated direct-publisher RSS feeds across the bias spectrum. Direct feeds give
// clean titles, accurate source/bias, and (often) story images — unlike Google
// News RSS. Dead feeds are skipped (Promise.allSettled), so over-include.
export const PUBLISHER_FEEDS: PublisherFeed[] = [
  // ---- General / top ----
  { url: "https://feeds.npr.org/1001/rss.xml", source: "NPR", domain: "npr.org", categories: ["top", "politics"], scope: "national" },
  { url: "https://feeds.bbci.co.uk/news/rss.xml", source: "BBC", domain: "bbc.com", categories: ["top"], scope: "world" },
  { url: "https://www.theguardian.com/us-news/rss", source: "The Guardian", domain: "theguardian.com", categories: ["top", "politics"], scope: "national" },
  { url: "https://www.cbsnews.com/latest/rss/main", source: "CBS News", domain: "cbsnews.com", categories: ["top"], scope: "national" },
  { url: "http://feeds.nbcnews.com/nbcnews/public/news", source: "NBC News", domain: "nbcnews.com", categories: ["top"], scope: "national" },
  { url: "https://moxie.foxnews.com/google-publisher/latest.xml", source: "Fox News", domain: "foxnews.com", categories: ["top", "politics"], scope: "national" },
  { url: "https://nypost.com/feed/", source: "New York Post", domain: "nypost.com", categories: ["top"], scope: "national" },
  { url: "https://thehill.com/news/feed/", source: "The Hill", domain: "thehill.com", categories: ["top", "politics"], scope: "national" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", source: "The New York Times", domain: "nytimes.com", categories: ["top"], scope: "national" },
  { url: "https://www.nationalreview.com/feed/", source: "National Review", domain: "nationalreview.com", categories: ["top", "politics"], scope: "national" },
  { url: "http://feeds.feedburner.com/breitbart", source: "Breitbart", domain: "breitbart.com", categories: ["top", "politics"], scope: "national" },
  { url: "https://www.dailywire.com/feeds/rss.xml", source: "The Daily Wire", domain: "dailywire.com", categories: ["top", "politics"], scope: "national" },
  { url: "https://rss.politico.com/politics-news.xml", source: "Politico", domain: "politico.com", categories: ["politics"], scope: "national" },

  // ---- World ----
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC", domain: "bbc.com", categories: ["world"], scope: "world" },
  { url: "https://www.theguardian.com/world/rss", source: "The Guardian", domain: "theguardian.com", categories: ["world"], scope: "world" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera", domain: "aljazeera.com", categories: ["world", "top"], scope: "world" },
  { url: "https://moxie.foxnews.com/google-publisher/world.xml", source: "Fox News", domain: "foxnews.com", categories: ["world"], scope: "world" },

  // ---- Business ----
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC", domain: "bbc.com", categories: ["business"], scope: "world" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", source: "The New York Times", domain: "nytimes.com", categories: ["business"], scope: "national" },
  { url: "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml", source: "Wall Street Journal", domain: "wsj.com", categories: ["business"], scope: "national" },
  { url: "https://www.theguardian.com/uk/business/rss", source: "The Guardian", domain: "theguardian.com", categories: ["business"], scope: "world" },

  // ---- Technology ----
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", source: "BBC", domain: "bbc.com", categories: ["technology"], scope: "world" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", source: "The New York Times", domain: "nytimes.com", categories: ["technology"], scope: "national" },
  { url: "http://feeds.arstechnica.com/arstechnica/index", source: "Ars Technica", domain: "arstechnica.com", categories: ["technology"], scope: "national" },
  { url: "https://www.theverge.com/rss/index.xml", source: "The Verge", domain: "theverge.com", categories: ["technology"], scope: "national" },

  // ---- Science ----
  { url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", source: "BBC", domain: "bbc.com", categories: ["science"], scope: "world" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", source: "The New York Times", domain: "nytimes.com", categories: ["science"], scope: "national" },
  { url: "http://rss.sciam.com/ScientificAmerican-Global", source: "Scientific American", domain: "scientificamerican.com", categories: ["science"], scope: "world" },

  // ---- Health ----
  { url: "https://feeds.bbci.co.uk/news/health/rss.xml", source: "BBC", domain: "bbc.com", categories: ["health"], scope: "world" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml", source: "The New York Times", domain: "nytimes.com", categories: ["health"], scope: "national" },

  // ---- Sports ----
  { url: "https://www.espn.com/espn/rss/news", source: "ESPN", domain: "espn.com", categories: ["sports"], scope: "national" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml", source: "The New York Times", domain: "nytimes.com", categories: ["sports"], scope: "national" },

  // ---- Entertainment ----
  { url: "https://variety.com/feed/", source: "Variety", domain: "variety.com", categories: ["entertainment"], scope: "national" },
  { url: "https://www.hollywoodreporter.com/feed/", source: "The Hollywood Reporter", domain: "hollywoodreporter.com", categories: ["entertainment"], scope: "national" },
];

/** Pick the feeds that serve a given category/scope (capped for latency). */
export function selectFeeds(category: NewsCategory, scope?: Scope): PublisherFeed[] {
  let feeds = PUBLISHER_FEEDS.filter((f) => f.categories.includes(category));
  if (scope === "world") {
    const world = feeds.filter((f) => f.scope === "world");
    if (world.length >= 2) feeds = world;
  }
  return feeds.slice(0, 12);
}
