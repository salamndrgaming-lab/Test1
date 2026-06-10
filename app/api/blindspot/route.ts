import { NextRequest, NextResponse } from "next/server";
import type { ProviderResult, Article } from "@/types";
import { getLive } from "@/lib/providers/withFallback";
import { newsProvider } from "@/lib/providers/news.provider";
import { pickTopic } from "@/lib/blindspot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Returns coverage for a topic across outlets (the UI groups it by lean).
// If no topic is given, auto-pick one from the current top headlines.
export async function GET(req: NextRequest) {
  let topic = req.nextUrl.searchParams.get("topic")?.trim() ?? "";

  if (!topic) {
    const top = await getLive(newsProvider, { category: "top" });
    if (top.data && top.data.length > 0) topic = pickTopic(top.data);
  }
  if (!topic) {
    return NextResponse.json({
      data: null,
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: "Could not determine a topic to compare.",
    } satisfies ProviderResult<Article[]>);
  }

  const result = await getLive(newsProvider, { query: topic });
  return NextResponse.json({ ...result, topic });
}
