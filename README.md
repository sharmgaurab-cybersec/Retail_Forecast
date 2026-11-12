# Coles Sydney Cold Drinks Planner

A simple Coles-themed forecasting prototype for cold drinks in Sydney. Choose a Sydney suburb and drink, refresh live weather, optionally upload up to four years of daily sales and people counts, then create a stock recommendation. Every generated forecast is saved to Cloudflare D1 when the database is connected. The planner still calculates forecasts without a login.

This independent project is not affiliated with Coles. Coles does not provide public store-level sales or visitor-count data. Use sales and people counts you are authorised to use. Do not upload customer names, IDs, or other personal information.

## What it includes

- Coles-only styling and cold-drink categories/products.
- Sydney suburb search with local coordinates from Open-Meteo geocoding.
- Live weather from Open-Meteo and NSW holiday dates from Nager.Date.
- Sales CSV upload and downloadable template.
- Optional daily store visitors and annual suburb population fields.
- Stock-on-hand, incoming stock, and safety-stock controls.
- Forecast download as CSV or printable PDF.
- Automatic D1 history for each forecast run, including the settings used and a row for every forecast day.
- No login or Supabase setup.

## CSV format

The template columns are:

`date, units_sold, store_visitors, annual_area_population, promotion, price, stockout, delivery_lead_days`

`date` and `units_sold` are required. `store_visitors` is the daily visitor total. `annual_area_population` is the selected suburb population for that year. `promotion` and `stockout` accept yes/no; `price` is the unit price in AUD; `delivery_lead_days` is the usual supplier lead time. Stockout days and historical promotion days are left out of normal-demand history. A planned-promotion checkbox applies an uplift only when enough past promotion rows exist. A planned price is applied only when there are at least five price records across three or more different prices to estimate price response. Lead time is used to flag whether current and incoming stock cover demand until the next delivery. Clear uploaded CSV removes its data from the current browser session.

The file should represent one store and one selected drink/product. Dates can use `YYYY-MM-DD` or slash dates. Slash dates are read as Australian `DD/MM/YYYY` unless that would be an invalid date, in which case the parser uses `MM/DD/YYYY` (so `11/15/2025` is November 15). Use ISO dates where possible to avoid ambiguity. Up to 1,461 daily rows are read. When no CSV is uploaded, the planner uses the editable typical sales per day and live weather/calendar adjustments.

## Historical sales validation

After CSV upload, the planner runs a rolling sales-only check: it predicts up to the last 28 eligible history days using only earlier, same-weekday sales and compares those estimates with actual sales. It reports mean absolute error, weighted absolute percentage error, and forecast bias. Promotion and stockout days are excluded. This basic check does not validate the weather adjustment because historical weather is not part of the sales CSV. Fewer than 14 eligible sales days is treated as insufficient to calculate the check.

## Run locally

Requirements: Node.js 22.13+ and pnpm 11.25+.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The app opens at `http://localhost:5173`.

## Deploy to Cloudflare Workers

Keep the project files together at the GitHub repository root. In Cloudflare Workers Builds, use:

- Root directory: `/` (or the nested project directory if your files are inside one)
- Build command: `pnpm build`
- Deploy command: `pnpm run deploy:cloudflare`

### Connect forecast history to Supabase

The planner now saves each forecast to Supabase (including one `forecast_runs` row and its `daily_forecasts`, plus store/product, inventory, and available weather records). Apply [`supabase/migrations/202611120001_coles_forecast_model.sql`](supabase/migrations/202611120001_coles_forecast_model.sql) in the SQL Editor of the Supabase project you want to use. The migration renames an older single-table forecast schema to `forecast_runs_legacy` rather than deleting its data.

In Cloudflare Workers & Pages → `retail-forecast` → Settings → Variables and secrets → Production, configure these **runtime** values:

- `SUPABASE_URL` = your Supabase Project URL (already configured in your Worker)
- `SUPABASE_SECRET_KEY` = a Supabase secret key (`sb_secret_...`) stored as a secret, never as a build variable

Redeploy after setting the secret. Keep the secret server-side; do not add it to source code or the browser. The planner calls a locked-down Postgres RPC using the secret key, and the SQL migration denies direct `anon`/`authenticated` table access. The old Cloudflare D1 binding is no longer used for new forecast saves. Existing D1 records remain there and are not copied automatically.

To inspect saved forecasts, open Supabase → Table Editor → `forecast_runs`; open a row’s UUID in `daily_forecasts` using `forecast_run_id`. The CSV data is used in the browser for that forecast; raw CSV sales rows are not uploaded.

Deploy with Workers Builds: `pnpm build` and `pnpm run deploy:cloudflare`. Do not use Cloudflare's static asset uploader.

## Forecast notes

The planner uses recent matching-weekday sales and a historical month pattern when available; otherwise, it starts from the user-entered typical sales/day value. Daily store visitors can estimate units per visitor. Annual suburb population provides a limited year-to-year adjustment when daily visitor history is absent. Live forecast high temperature and rain adjust demand with different sensitivity by drink category; NSW public holidays receive a 15% example uplift. The result table and downloads show the baseline and these adjustments. This is a transparent planning estimate, not a trained or validated retail model. Live weather is generally available for about 16 days; later dates use historical sales/calendar patterns.
