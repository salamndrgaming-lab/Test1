import { NextRequest, NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { airQualityProvider } from "@/lib/providers/airquality.provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = sp.get("lat") ? Number(sp.get("lat")) : undefined;
  const lon = sp.get("lon") ? Number(sp.get("lon")) : undefined;
  const result = await getLive(airQualityProvider, { lat, lon });
  return NextResponse.json(result);
}
