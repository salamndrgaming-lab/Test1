import { NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { ipoProvider } from "@/lib/providers/ipo.provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await getLive(ipoProvider, {});
  return NextResponse.json(result);
}
