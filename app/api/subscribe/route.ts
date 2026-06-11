import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Newsletter capture. Wire to Resend/Supabase by setting the env keys (see
// LAUNCH.md). Until then it validates and acknowledges without persisting.
export async function POST(req: NextRequest) {
  let email = "";
  try {
    ({ email } = await req.json());
  } catch {
    /* ignore */
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  const audience = process.env.RESEND_AUDIENCE_ID;
  if (key && audience) {
    try {
      const r = await fetch(`https://api.resend.com/audiences/${audience}/contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
      return NextResponse.json({ ok: r.ok, stored: r.ok });
    } catch {
      return NextResponse.json({ ok: true, stored: false });
    }
  }
  // Not configured yet — acknowledge without persisting.
  return NextResponse.json({ ok: true, stored: false });
}
