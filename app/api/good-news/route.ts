import { NextResponse } from "next/server";
import { withFallback } from "@/lib/providers/withFallback";
import { newsProvider } from "@/lib/providers/news.provider";
import { isGoodNews } from "@/lib/sentiment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await withFallback(newsProvider, { category: "top" });
  const positive = result.data
    .filter((a) => isGoodNews(a.sentiment))
    .sort((a, b) => b.sentiment - a.sentiment);
  return NextResponse.json({ ...result, data: positive });
}
