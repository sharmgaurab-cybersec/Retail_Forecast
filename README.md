# Coles Sydney Cold Drinks Planner

A simple Coles-themed forecasting prototype for cold drinks in Sydney. Choose a Sydney suburb and drink, refresh live weather, optionally upload up to four years of daily sales and people counts, then create a stock recommendation. The forecast works without a login, Supabase account, or database.

This independent project is not affiliated with Coles. Coles does not provide public store-level sales or visitor-count data. Use sales and people counts you are authorised to use. Do not upload customer names, IDs, or other personal information.

## What it includes

- Coles-only styling and cold-drink categories/products.
- Sydney suburb search with local coordinates from Open-Meteo geocoding.
- Live weather from Open-Meteo and NSW holiday dates from Nager.Date.
- Sales CSV upload and downloadable template.
- Optional daily store visitors and annual suburb population fields.
- Stock-on-hand, incoming stock, and safety-stock controls.
- Forecast download as CSV or printable PDF.
- No login, Supabase, D1, or saved account history.

## CSV format

The template columns are:

`date, units_sold, store_visitors, annual_area_population`

`date` and `units_sold` are required. `store_visitors` is the daily visitor total for the store. `annual_area_population` is the estimated population for the selected suburb in that year; repeat the annual value on that year's daily rows, or leave it blank if unknown. The planner uses daily visitors to estimate units per visitor. If daily visitor history is unavailable, it can use the latest two annual population values as a limited adjustment to the sales baseline.

The file should represent one store and one selected drink/product. Dates can use `YYYY-MM-DD` or `DD/MM/YYYY`. Up to 1,461 daily rows are read. When no CSV is uploaded, the planner uses the editable typical sales per day and live weather/calendar adjustments.

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
- Deploy command: `pnpm exec wrangler deploy --config dist/server/wrangler.json --keep-vars`

The deployment does not need D1, Supabase variables, or any login setup. Do not use Cloudflare's static asset uploader for this project.

## Forecast notes

The planner uses weekday-matched sales history when available; otherwise, it uses the typical-sales value. Daily store visitors can estimate units per visitor. Annual suburb population only provides a limited year-to-year adjustment when daily store visitor history is absent. Weather adjustments use forecast high temperature and rain; NSW public holidays receive a simple uplift. This is a transparent planning estimate, not a trained or validated retail model. Live weather is generally available for about 16 days; later dates use historical sales/calendar patterns.
