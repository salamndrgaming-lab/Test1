import { NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { entertainmentProvider } from "@/lib/providers/entertainment.provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await getLive(entertainmentProvider, {});
  return NextResponse.json(result);
}
