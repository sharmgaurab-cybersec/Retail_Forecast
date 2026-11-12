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

### Connect forecast history to D1

See [DATABASE-MODEL.md](DATABASE-MODEL.md) for the table relationship and stored fields.

Create a Cloudflare D1 database named `coles-stock-planner-db` if you have not already created it. In Workers & Pages → `retail-forecast` → Settings → Builds, add this **build variable** (it is a database identifier, not a secret):

`COLES_D1_DATABASE_ID` = the ID shown on the D1 database details page.

The build uses that ID to generate the Worker binding named `DB`. Set the Workers Builds deploy command to:

```sh
pnpm run deploy:cloudflare
```

This command applies the checked-in SQL migrations to the remote D1 database, then deploys the Worker. The migrations create the full model in [DATABASE-MODEL.md](DATABASE-MODEL.md). Each forecast is stored automatically after calculation. The uploaded sales CSV itself stays in the browser; the database saves the sales-data counts used, stock settings, forecast totals, and daily forecast/weather details.

If `COLES_D1_DATABASE_ID` is missing, the deploy script skips migrations and the site can still deploy and calculate forecasts, but the result will say it was not saved. The database is not protected by a user login in this version, so do not use it for confidential store data on a public site.

Do not use Cloudflare's static asset uploader for this project.

## Forecast notes

The planner uses recent matching-weekday sales and a historical month pattern when available; otherwise, it starts from the user-entered typical sales/day value. Daily store visitors can estimate units per visitor. Annual suburb population provides a limited year-to-year adjustment when daily visitor history is absent. Live forecast high temperature and rain adjust demand with different sensitivity by drink category; NSW public holidays receive a 15% example uplift. The result table and downloads show the baseline and these adjustments. This is a transparent planning estimate, not a trained or validated retail model. Live weather is generally available for about 16 days; later dates use historical sales/calendar patterns.
