import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL || "https://newsscope.example";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: [string, number][] = [
    ["", 1],
    ["/about", 0.9],
    ["/news", 0.8],
    ["/good-news", 0.6],
    ["/bias", 0.8],
    ["/sports", 0.6],
    ["/weather", 0.6],
    ["/markets", 0.6],
    ["/entertainment", 0.6],
    ["/upgrade", 0.7],
    ["/legal/terms", 0.2],
    ["/legal/privacy", 0.2],
    ["/legal/disclaimer", 0.2],
    ["/legal/attributions", 0.2],
  ];
  return routes.map(([path, priority]) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: priority >= 0.8 ? "daily" : "weekly",
    priority,
  }));
}
