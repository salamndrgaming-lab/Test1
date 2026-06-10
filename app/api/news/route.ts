import { NextRequest, NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { newsProvider, type NewsParams } from "@/lib/providers/news.provider";
import type { NewsCategory, Scope } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const params: NewsParams = {
    category: (sp.get("category") as NewsCategory) ?? "top",
    scope: (sp.get("scope") as Scope) ?? undefined,
    query: sp.get("q") ?? undefined,
  };
  const result = await getLive(newsProvider, params);
  return NextResponse.json(result);
}
