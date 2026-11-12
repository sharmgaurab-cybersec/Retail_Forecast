# Forecast history database model

The planner uses a normalized D1 model for stores, products, sales, inventory, deliveries, weather, and forecasts. This matches the commercial model diagram while keeping forecast history linked to the selected store and product.

| Table | One row represents | Main fields |
| --- | --- | --- |
| `suppliers` | One supplier | Supplier name/code |
| `stores` | One Coles location | Name, Sydney suburb, coordinates |
| `products` | One drink product | Category, product name, optional brand/SKU |
| `deliveries` | One supplier delivery/order line | Supplier, store, product, ordered/received dates, quantities, status |
| `weather_daily` | Weather for one store and date | Forecast/observed type, high temperature, rainfall, source |
| `daily_sales` | Sales for one store, product, and date | Units, visitors, population, promotion, price, stockout |
| `inventory_snapshots` | Stock levels for one store, product, and date | On-hand, incoming, safety stock |
| `forecast_runs` | One submitted forecast | Store/product, suburb coordinates, forecast length, stock settings, sales-data summary, expected sales, recommended order, model version |
| `daily_forecasts` | One date inside a forecast | Baseline and expected units, weather and other adjustment percentages, visitors, weather, holiday |

Relationships: a store has sales, inventory, weather, deliveries, and forecast runs; a product has sales, inventory, deliveries, and forecast runs; a supplier has deliveries; and one forecast run has daily forecast rows. The daily forecast table uses `(forecast_run_id, forecast_date)` as its primary key.

## What is persisted

- Each forecast automatically adds or reuses its store and product records, stores the stock snapshot, saves the forecast run and its daily rows, and records available live weather.
- Counts describing uploaded sales history (for example, number of sales days, visitor days, promotions, stockouts, and price observations) are saved with the forecast run.
- `suppliers`, `deliveries`, and `daily_sales` are created for the commercial model but are not populated by the current planner. The raw CSV remains in the browser, so sales rows are not uploaded.

The raw CSV is not uploaded. It remains in the browser and is used only to calculate that forecast. Customer names and IDs are not part of this model.

## Current scope and next commercial step

This is a single public prototype database without user or store access controls. Anyone who can use the public planner can submit forecast runs; the app has no run-history browsing API. For a commercial rollout, add authenticated organizations and users, stores, products/SKUs, imported daily sales, inventory snapshots, and supplier lead-time records, then enforce row access by organization/store. Do not use the public prototype to store confidential operational data.

The schema is installed by `db/migrations/0001_forecast_history.sql` and `0002_commercial_forecasting_model.sql` during `pnpm run deploy:cloudflare`.
