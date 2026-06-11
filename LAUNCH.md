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

### 2. Supabase (accounts + entitlement source of truth)
1. Create a project; set the `NEXT_PUBLIC_SUPABASE_*` + service-role keys.
2. Tables: `profiles(id, email, is_pro, stripe_customer_id, created_at)`,
   `preferences(user_id, json)`.
3. Add sign-in (magic link / OAuth); on auth, sync `localStorage`
   (`SettingsProvider`, watchlist, favorites) ↔ `preferences`.
4. Replace `usePro()`'s local flag with the server-verified `is_pro`.

### 3. Resend (newsletter)
- Set `RESEND_API_KEY` + `RESEND_AUDIENCE_ID`; `/api/subscribe` will persist
  contacts automatically.

### 4. Caching (recommended before scale)
- Set `UPSTASH_REDIS_REST_URL`/`TOKEN`; wrap `getLive` results with a short-TTL
  cache to cut API calls and smooth rate limits (and centralize the seam for
  licensed-data swaps).

### 5. Analytics / monitoring
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
