// Serves /ads.txt — required by AdSense to authorize ad sales (and to get paid).
// Auto-built from NEXT_PUBLIC_ADSENSE_CLIENT (e.g. "ca-pub-1234" → "pub-1234").
export const dynamic = "force-static";

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
  const pub = client.replace(/^ca-/, "");
  const body = pub
    ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : "# Set NEXT_PUBLIC_ADSENSE_CLIENT to populate ads.txt\n";
  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
