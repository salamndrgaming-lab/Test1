import { NextRequest, NextResponse } from "next/server";
import { withFallback } from "@/lib/providers/withFallback";
import {
  weatherProvider,
  geocodeProvider,
} from "@/lib/providers/weather.provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q");
  let lat = sp.get("lat") ? Number(sp.get("lat")) : undefined;
  let lon = sp.get("lon") ? Number(sp.get("lon")) : undefined;
  let place = sp.get("place") ?? undefined;

  // If a text query was supplied, geocode it first (keyless).
  if (q && (lat === undefined || lon === undefined)) {
    const geo = await withFallback(geocodeProvider, { q });
    const first = geo.data[0];
    if (first) {
      lat = first.lat;
      lon = first.lon;
      place = [first.name, first.admin1, first.country]
        .filter(Boolean)
        .join(", ");
    }
  }

  const result = await withFallback(weatherProvider, { lat, lon, place });
  return NextResponse.json(result);
}
