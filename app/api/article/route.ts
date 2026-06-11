import { NextRequest, NextResponse } from "next/server";
import type { ArticleSynopsis, ProviderResult } from "@/types";
import { decodeEntities } from "@/lib/rss";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Pull a short synopsis (Open Graph / meta description) from the actual article
// page. We only extract the publisher's own summary + link out — never the full
// text. Cached briefly to avoid refetching.
const cache = new Map<string, { data: ArticleSynopsis; ts: number }>();
const TTL = 10 * 60_000;

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

function firstParagraph(html: string): string | undefined {
  const matches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [];
  for (const p of matches) {
    const text = decodeEntities(p.replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 80) return text;
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!url || url === "#" || !/^https?:\/\//.test(url)) {
    return NextResponse.json({
      data: null,
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: "No article URL",
    } satisfies ProviderResult<ArticleSynopsis>);
  }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({
      data: cached.data,
      source: "live",
      fetchedAt: new Date(cached.ts).toISOString(),
    } satisfies ProviderResult<ArticleSynopsis>);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NewsScope/0.1; +https://newsscope.example)",
        Accept: "text/html",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = (await res.text()).slice(0, 600_000);

    const desc =
      metaContent(html, "og:description") ??
      metaContent(html, "twitter:description") ??
      metaContent(html, "description");
    let synopsis = desc ?? "";
    if (synopsis.length < 120) {
      const para = firstParagraph(html);
      if (para) synopsis = (synopsis ? synopsis + " " : "") + para;
    }
    synopsis = synopsis.slice(0, 600).trim();

    const data: ArticleSynopsis = {
      title: metaContent(html, "og:title") ?? "",
      synopsis,
      image: metaContent(html, "og:image") ?? metaContent(html, "twitter:image"),
      url: res.url || url,
      siteName: metaContent(html, "og:site_name"),
    };
    if (!data.synopsis) throw new Error("no synopsis found");

    cache.set(url, { data, ts: Date.now() });
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);

    return NextResponse.json({
      data,
      source: "live",
      fetchedAt: new Date().toISOString(),
    } satisfies ProviderResult<ArticleSynopsis>);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({
      data: null,
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: reason,
    } satisfies ProviderResult<ArticleSynopsis>);
  } finally {
    clearTimeout(timer);
  }
}
