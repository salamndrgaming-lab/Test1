import { NextResponse } from "next/server";
import type { ProviderResult } from "@/types";
import { getLive } from "@/lib/providers/withFallback";
import { trendsProvider } from "@/lib/providers/trends.provider";
import { newsProvider } from "@/lib/providers/news.provider";
import { keywordsFromArticles } from "@/lib/trending";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Trending terms: try Google Trends (flaky), else derive from live headlines.
// Both are live data — this is the one place a fallback between live sources is
// intentional, so the ticker is never empty.
export async function GET() {
  const trends = await getLive(trendsProvider, { geo: "US" });
  if (trends.source === "live" && trends.data && trends.data.length > 0) {
    return NextResponse.json(trends);
  }

  const news = await getLive(newsProvider, { category: "top" });
  const terms = news.data ? keywordsFromArticles(news.data) : [];
  const result: ProviderResult<string[]> = {
    data: terms,
    source: news.source === "live" && terms.length > 0 ? "live" : "error",
    fetchedAt: new Date().toISOString(),
    error: terms.length === 0 ? "No trending data available" : undefined,
  };
  return NextResponse.json(result);
}
