import type { NewsCategory, Scope } from "@/types";

export interface SeedArticle {
  title: string;
  summary: string;
  source: string;
  sourceDomain: string;
  category: NewsCategory;
  scope: Scope;
  hoursAgo: number;
  imageUrl?: string;
  geo?: { lat: number; lon: number; place: string };
}

// A broad, realistic spread across categories, scope, outlet bias, and tone.
export const SEED_NEWS: SeedArticle[] = [
  {
    title: "Senate passes bipartisan infrastructure funding after late-night vote",
    summary:
      "Lawmakers reached a compromise to boost growth and improve roads, bridges, and broadband across rural districts.",
    source: "Reuters",
    sourceDomain: "reuters.com",
    category: "politics",
    scope: "national",
    hoursAgo: 2,
  },
  {
    title: "Local volunteers rescue stranded hikers as community celebrates safe recovery",
    summary:
      "A coordinated effort saved three hikers; neighbors donated supplies and the rescue team was awarded for heroism.",
    source: "Associated Press",
    sourceDomain: "apnews.com",
    category: "local",
    scope: "local",
    hoursAgo: 1,
    geo: { lat: 39.7392, lon: -104.9903, place: "Denver, CO" },
  },
  {
    title: "Tech firm announces breakthrough in battery recycling, boosting clean energy hopes",
    summary:
      "The innovation could improve recovery rates and drive growth in sustainable manufacturing, researchers say.",
    source: "The Verge",
    sourceDomain: "theverge.com",
    category: "technology",
    scope: "national",
    hoursAgo: 3,
  },
  {
    title: "Markets plunge as recession fears and layoffs rattle investors",
    summary:
      "Major indexes fell sharply amid warnings of decline; analysts cite a possible slump in consumer spending.",
    source: "CNBC",
    sourceDomain: "cnbc.com",
    category: "business",
    scope: "national",
    hoursAgo: 4,
  },
  {
    title: "Opinion: Why the new climate policy is a dangerous overreach",
    summary:
      "Critics warn the regulation threatens jobs and could trigger an economic decline in key industries.",
    source: "Fox News",
    sourceDomain: "foxnews.com",
    category: "politics",
    scope: "national",
    hoursAgo: 5,
  },
  {
    title: "Progressive coalition celebrates landmark housing win for low-income families",
    summary:
      "Advocates hailed the measure as a major success that will protect renters and improve affordability.",
    source: "Vox",
    sourceDomain: "vox.com",
    category: "politics",
    scope: "national",
    hoursAgo: 6,
  },
  {
    title: "Scientists report record coral recovery on protected reef",
    summary:
      "A multi-year study found thriving marine life and improvement after conservation efforts succeeded.",
    source: "Scientific American",
    sourceDomain: "scientificamerican.com",
    category: "science",
    scope: "world",
    hoursAgo: 7,
  },
  {
    title: "City council approves new park as residents celebrate green space win",
    summary:
      "Volunteers and local charity groups donated to fund the project; families gathered to celebrate the milestone.",
    source: "USA Today",
    sourceDomain: "usatoday.com",
    category: "local",
    scope: "local",
    hoursAgo: 2,
    geo: { lat: 41.8781, lon: -87.6298, place: "Chicago, IL" },
  },
  {
    title: "Deadly storm leaves thousands without power as flooding worsens",
    summary:
      "Emergency crews warn of danger; the disaster has displaced residents and caused widespread loss.",
    source: "The Guardian",
    sourceDomain: "theguardian.com",
    category: "world",
    scope: "world",
    hoursAgo: 8,
  },
  {
    title: "New AI model sets benchmark record, researchers hail major breakthrough",
    summary:
      "The achievement marks progress in reasoning tasks and could boost productivity across industries.",
    source: "Ars Technica",
    sourceDomain: "arstechnica.com",
    category: "technology",
    scope: "national",
    hoursAgo: 9,
  },
  {
    title: "Health officials report sharp decline in flu cases after vaccination drive",
    summary:
      "A successful campaign helped protect communities; hospitals report recovery and improvement in capacity.",
    source: "NPR",
    sourceDomain: "npr.org",
    category: "health",
    scope: "national",
    hoursAgo: 10,
  },
  {
    title: "Corruption scandal widens as prosecutors announce new arrests",
    summary:
      "Officials face a lawsuit and fraud charges; the investigation threatens to topple several leaders.",
    source: "Politico",
    sourceDomain: "politico.com",
    category: "politics",
    scope: "national",
    hoursAgo: 11,
  },
  {
    title: "Editorial: Tax cuts will fuel growth and protect small business",
    summary:
      "Supporters argue the plan boosts innovation and helps families thrive amid economic uncertainty.",
    source: "Wall Street Journal",
    sourceDomain: "wsj.com",
    category: "business",
    scope: "national",
    hoursAgo: 12,
  },
  {
    title: "Hometown teacher wins national award for inspiring students",
    summary:
      "Colleagues celebrated the milestone; the beloved educator was honored for kindness and dedication.",
    source: "CBS News",
    sourceDomain: "cbsnews.com",
    category: "local",
    scope: "local",
    hoursAgo: 3,
    geo: { lat: 29.7604, lon: -95.3698, place: "Houston, TX" },
  },
  {
    title: "Global summit ends without deal as tensions and threats escalate",
    summary:
      "Negotiations collapsed amid fears of conflict; diplomats warn of a deepening crisis.",
    source: "BBC",
    sourceDomain: "bbc.com",
    category: "world",
    scope: "world",
    hoursAgo: 13,
  },
  {
    title: "Startup's free coding program helps hundreds land first jobs",
    summary:
      "The charity initiative was a success, with graduates celebrating new careers and brighter futures.",
    source: "TechCrunch",
    sourceDomain: "techcrunch.com",
    category: "technology",
    scope: "national",
    hoursAgo: 5,
  },
  {
    title: "Conservative leaders rally against spending bill they call reckless",
    summary:
      "Opponents warn the measure risks a fiscal crisis and could trigger long-term economic decline.",
    source: "National Review",
    sourceDomain: "nationalreview.com",
    category: "politics",
    scope: "national",
    hoursAgo: 14,
  },
  {
    title: "Researchers cure rare disease in trial, offering hope to thousands",
    summary:
      "The breakthrough therapy healed patients in early tests; doctors call the recovery a major success.",
    source: "Nature",
    sourceDomain: "nature.com",
    category: "health",
    scope: "world",
    hoursAgo: 6,
  },
  {
    title: "Wildfire threatens neighborhoods as evacuations expand",
    summary:
      "The deadly blaze has destroyed homes; officials warn of danger and urge residents to flee.",
    source: "Los Angeles air quality alert",
    sourceDomain: "latimes.com",
    category: "local",
    scope: "local",
    hoursAgo: 1,
    geo: { lat: 34.0522, lon: -118.2437, place: "Los Angeles, CA" },
  },
  {
    title: "Community garden donates record harvest to local food bank",
    summary:
      "Volunteers celebrated as the charity effort helped feed families and protect against hunger.",
    source: "PBS",
    sourceDomain: "pbs.org",
    category: "local",
    scope: "local",
    hoursAgo: 4,
    geo: { lat: 47.6062, lon: -122.3321, place: "Seattle, WA" },
  },
];
