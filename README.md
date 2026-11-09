# Coles Cold Drinks Stock Planner

A Coles-focused planning prototype for cold-drink stock in Sydney. It estimates daily drink sales and a suggested order using uploaded sales history, optional store visitor counts, local weather, NSW public holidays, current stock and incoming stock.

This is an independent project and is not affiliated with Coles. Coles does not provide public store-level sales or visitor-count data. The user must upload data they are authorised to use. When no CSV is available, the forecast uses a typical-sales assumption and clearly remains an estimate.

## Features

- Coles only, with cold-drink types and example products.
- Search across Sydney suburbs using live location geocoding for local forecast coordinates.
- CSV upload for up to 366 recent daily records; visitor counts are optional.
- Live weather from Open-Meteo and Australian public holidays from Nager.Date.
- Order recommendation subtracts on-hand and incoming drinks and adds optional safety stock.
- Downloadable CSV template and forecast export.
- Admin-only Supabase email and password sign-in before the forecast opens; the approved admin can export forecasts as PDF or CSV.
- Forecast history stored in Supabase Postgres with row-level security.
- Cloudflare Worker deployment with D1 used for authentication rate limits.

## CSV format

Required columns: `date`, `units_sold`. Optional column: `store_visitors` (or `daily_visitors`, `footfall`, or `transactions`). Each file should contain one store and one selected drink/product so unrelated products are not combined. Use one aggregated daily row per store/product selection; do not upload customer names, account IDs or other personal information. Dates may be `YYYY-MM-DD` or `DD/MM/YYYY`. When there are multiple rows for a date, units are summed and visitor counts are averaged.

The template can be downloaded from the app. Add historical daily sales and visitor counts and include today's visitor total as a row when available. Visitor counts in future dates are estimated from the average of recent matching weekdays in the uploaded data; they are not a live foot-traffic feed.

## Run locally

Requirements: Node.js 22.13+ and pnpm 11.25+.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The app runs at `http://localhost:5173`. Build using `pnpm build`.

## Cloudflare build settings

Keep the project files at the repository root so Cloudflare can find `package.json` and `pnpm-lock.yaml`. In Cloudflare Workers Builds, use root directory `/`, build command `pnpm build`, and deploy command `pnpm exec wrangler deploy --config dist/server/wrangler.json`. The Vite build generates that Wrangler configuration. Do not deploy this project with the static asset uploader. If the repository keeps these files inside `Retail_Forecast-main/`, set the Cloudflare root directory to `/Retail_Forecast-main` instead.

## Supabase setup

The project is prepared to connect to Supabase, but a Supabase project must be provisioned and configured before online sign-in and forecast saving work.

1. Create the Supabase Auth user `reborngamming1@gmail.com` and set its password in Authentication → Users. Keep the account email confirmed. You can change or reset the password from this Supabase account; no email OTP or custom SMTP is required for sign-in.
2. In the Supabase SQL editor, run `supabase/migrations/20261106_create_forecast_runs.sql`. This creates the forecast history table and per-user RLS policies.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as Cloudflare Worker environment variables. Use the publishable/anon key only; never put a service-role or secret key in the app.
4. Deploy the Worker. Only `reborngamming1@gmail.com` can sign in with a password. Admin sign-in is required before the forecast page loads. Once signed in, use **Download forecast PDF** to open the browser print dialog and choose **Save as PDF**, or export CSV.

The app sends the verified admin's access token to Supabase PostgREST. The database applies RLS; the application does not store the uploaded CSV itself, only the forecast summary and daily estimates. Apply any database changes to a separate project intended for this application. The admin email is an application allowlist in `cloudflare/worker.mjs` and `lib/email-auth.ts`. Do not add Supabase secret/service-role keys to Cloudflare or GitHub for this sign-in flow.

### Cloudflare configuration

`wrangler.cloudflare.jsonc` currently references the repository's original D1 database ID. For your own deployment, create a D1 database and replace that ID/name with your own. D1 is still needed for login rate limiting; forecast records live in Supabase. Configure secrets using Wrangler, not source code:

```sh
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

The Worker also needs D1 tables for auth rate limits. Apply the rate-limit schema from the repository's D1 migrations if deploying from a clean database. Keep the `DB` binding name aligned with `wrangler.cloudflare.jsonc`.

## Forecast method and limits

With visitor history, the model estimates a units-per-visitor rate from uploaded records and multiplies it by the recent average visitor count for the matching weekday. Otherwise, it uses the average sales for the matching weekday; if history is absent, it uses the editable typical-sales/day value. A simple temperature/rain adjustment and a public-holiday uplift are applied. This is a transparent baseline, not a trained or validated demand model. Validate it against held-out store history before relying on purchase decisions.

Open-Meteo commonly provides up to 16 forecast days. Longer selected periods show live weather where available and base the remaining days on historical sales/visitor patterns. Public holidays are checked against the Nager.Date API, including NSW-specific holidays when returned by that service. Weather and holiday providers can be unavailable; the app identifies missing live weather.

## Repository layout

- `app/forecast-dashboard.tsx` — forecasting interface and calculation.
- `cloudflare/worker.mjs` — API, Supabase session verification, forecast inserts and D1 rate limits.
- `lib/email-auth.ts` — Supabase auth helper.
- `supabase/migrations/` — Postgres schema and row-level security.
- `SUPABASE-ADMIN-LOGIN.md` — admin password sign-in setup details.

Do not commit `.dev.vars`, `.env*`, credentials, customer-level data, or uploaded sales files. See `.gitignore` before uploading the project to GitHub.
