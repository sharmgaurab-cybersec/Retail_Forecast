# Start here: Coles Cold Drinks Stock Planner

This is a public, no-login cold-drinks forecasting planner for Sydney Coles stores. It uses live Open-Meteo weather and NSW public-holiday dates. Sales history is optional; without a CSV, enter typical sales per day.

## Preview locally

1. Install Node.js 22.13 or newer and pnpm 11.25.0.
2. In this project folder, run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

3. Visit `http://localhost:5173`.

## Forecast with a CSV

Download the CSV template in the planner. `date` and `units_sold` are required. Optional columns: `store_visitors`, `annual_area_population`, `promotion`, `price`, `stockout`, and `delivery_lead_days`. Use one store and one drink/product per file; up to four years of daily rows are accepted. Use Clear uploaded CSV to remove the current data before another forecast. The CSV stays in the user's browser.

## Deploy

Push the project files to GitHub, connect the repository in Cloudflare Workers Builds, and use the build and deploy commands in `BUILD-AND-DEPLOY.md`. To save forecasts, connect the D1 database and add its ID as a Workers Builds **build variable**. No admin login or Supabase setup is required.
