# NewsScope — Launch Checklist (Phase A)

This documents what's built and the remaining wiring to charge money. The full
strategy lives in the plan file; this is the operational checklist.

## ✅ Built (works without external accounts)
- **Freemium scaffold** — `lib/usePro.ts` (`usePro()`), `components/UpgradeCard.tsx`
  (`ProGate`/`UpgradeCard`), pricing page `app/upgrade/page.tsx`.
- **A real gate** — custom stock watchlists on `/markets` are Pro-only.
- **21+ age-gate** — `components/AgeGate.tsx` wraps `/sports`.
- **Legal** — `/legal/{terms,privacy,disclaimer,attributions}`, linked in the footer.
- **Email capture** — `components/NewsletterSignup.tsx` + `app/api/subscribe/route.ts`.
- **Disclaimers** throughout; responsible-gambling messaging.

> The Pro flag is currently a **local dev toggle** (on `/upgrade` in dev) so the
> gated experience is testable. Swap the source to Stripe/Supabase below.

## ⏳ To go live (needs your accounts + keys → set in `.env`)

### 1. Stripe (Pro billing)
1. Create products/prices (monthly + annual); copy price IDs.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`,
   `STRIPE_PRICE_ANNUAL`, `NEXT_PUBLIC_APP_URL`.
3. Add `npm i stripe`, then implement:
   - `app/api/checkout/route.ts` → create a Checkout Session, return `{ url }`
     (the `/upgrade` page already POSTs here and redirects).
   - `app/api/stripe/webhook/route.ts` → on `checkout.session.completed` /
     subscription updates, set the user's `is_pro` in Supabase.
4. Point a Stripe webhook at `/api/stripe/webhook`.

### 2. Supabase (accounts + entitlement source of truth) — scaffolded
Profiles + membership already work **local-first** (`lib/useProfile.ts`,
`/profile`). To make them real accounts:
1. Create a project; set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Run **`supabase/schema.sql`** in the SQL editor (creates `profiles`,
   `preferences`, `bookmarks`, `history`, `follows`, `alerts` with RLS + a
   signup trigger that auto-creates a profile row).
3. The magic-link sign-in (`components/auth/SignIn.tsx`) appears automatically
   once the env vars are set; on auth, sync the local stores
   (`useProfile`/`useLibrary`/settings) ↔ Supabase.
4. Replace `useMembership()`'s local value with the server-verified
   `profiles.membership` (`lib/supabase/server.ts → getMembership`).

**Tracking members:** query the `profiles` table (or the Supabase dashboard) —
`membership` is the status column; the **Stripe webhook** sets it to
`trialing`/`pro`/`past_due`/`canceled`. That's your member roster + MRR source.

### 3. Resend (newsletter)
- Set `RESEND_API_KEY` + `RESEND_AUDIENCE_ID`; `/api/subscribe` will persist
  contacts automatically.

### 4. Caching (recommended before scale)
- Set `UPSTASH_REDIS_REST_URL`/`TOKEN`; wrap `getLive` results with a short-TTL
  cache to cut API calls and smooth rate limits (and centralize the seam for
  licensed-data swaps).

### 5. Ads (Google AdSense) + getting paid
**What's wired:** `components/ads/AdSlot.tsx` renders an in-feed unit on `/news`
for **free users only, after consent** (`ConsentBanner`). Pro users see no ads.
When AdSense isn't configured it shows a "Go Pro — remove ads" house promo, so
the slot still earns. `/ads.txt` is generated from your publisher id.

**Setup steps:**
1. Apply at **adsense.google.com** with your live domain (needs real content +
   the legal pages — already built). Approval can take days to weeks.
2. Once approved, copy your **publisher ID** (`ca-pub-…`) → set
   `NEXT_PUBLIC_ADSENSE_CLIENT` in Vercel env. Redeploy. This loads the AdSense
   script and auto-populates `/ads.txt` (verify at `https://yourdomain/ads.txt`).
3. (Optional) Create an **ad unit** in AdSense → copy its slot id →
   `NEXT_PUBLIC_ADSENSE_SLOT_FEED`. Leave blank to use Auto ads / house promo.
4. **ads.txt** must be reachable at the domain root (it is, via the route) or
   AdSense limits/blocks ad serving.

**Connecting payouts (AdSense → money in your bank):**
1. AdSense → **Payments → Payments info**.
2. **Verify identity/address:** at ~$10 earned, Google mails a **PIN**; enter it.
3. **Tax info:** complete the tax form (US: W-9; non-US: W-8BEN) — required or
   payments are withheld.
4. **Add a payment method:** bank account for **EFT/wire** (or check where
   supported). Set it as primary.
5. **Payment threshold:** Google pays out monthly once your balance clears the
   **$100 threshold** (~21st of the month).
> Reality check: display RPM for news runs ~$5–15, so meaningful ad income needs
> scale (tens of thousands of monthly views). Keep ads minimal; subscription +
> the house "Go Pro" promo are the better near-term levers.

**EEA/UK note:** personalized ads require a **Google-certified CMP** (IAB TCF).
Our `ConsentBanner` is a basic gate; add a certified CMP (e.g., Google's own,
Funding Choices) before serving EEA/UK traffic. Alternatives to AdSense at
scale: **Ezoic** (low traffic floor), **Mediavine/Raptive** (high floor, higher
RPM), **Carbon** (dev audiences).

### 6. Analytics / monitoring
- `NEXT_PUBLIC_POSTHOG_KEY` (funnels), `NEXT_PUBLIC_SENTRY_DSN` (errors),
  Vercel/Plausible for privacy-friendly traffic.

## 🚦 Before charging (compliance must-fixes)
- **Bias methodology:** publish our own transparent rating method (or license
  AllSides/Ad Fontes) — see `data/bias-outlets.json`.
- **Unlicensed data:** Yahoo Finance / ESPN endpoints are ToS-gray for paid use.
  Keep Markets & Sports in the **free tier** until swapped for licensed APIs
  (The Odds API, Finnhub/Polygon, CoinGecko key).
- **Legal review:** the `/legal/*` pages are templates — have counsel review,
  fill the entity/contact details, and add a cookie-consent banner once
  analytics/ads are on.
