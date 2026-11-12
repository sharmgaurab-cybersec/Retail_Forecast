# Forecast history database model

The active database is Supabase Postgres. The schema is created by `supabase/migrations/202611120001_coles_forecast_model.sql`.

| Table | One row represents | Main fields |
| --- | --- | --- |
| `suppliers` | One supplier | Supplier name/code |
| `stores` | One Coles location | Name, Sydney suburb, coordinates |
| `products` | One drink product | Category, product name, optional brand/SKU |
| `deliveries` | One supplier delivery/order line | Supplier, store, product, dates, quantities, status |
| `weather_daily` | Weather for one store and date | Forecast/observed type, high temperature, rainfall, source |
| `daily_sales` | Sales for one store, product, and date | Units, visitors, population, promotion, price, stockout |
| `inventory_snapshots` | Stock levels for one store, product, and date | On-hand, incoming, safety stock |
| `forecast_runs` | One submitted forecast | Store/product, suburb, horizon, stock settings, data counts, totals, model version |
| `daily_forecasts` | One date inside a forecast | Baseline and expected units, adjustments, visitors, weather, holiday |

Stores and products connect sales, inventory, weather, deliveries, and forecasts. A forecast run has multiple daily forecast rows.

## What is saved

Each forecast reuses or creates the selected store and product, saves its stock snapshot, forecast summary, all daily forecast rows, and available live weather. The browser uses uploaded CSV history to calculate a forecast and sends aggregate counts and the forecast result; it does not upload raw sales CSV rows. Therefore `daily_sales`, `suppliers`, and `deliveries` are part of the future-ready model but are not populated by this version.

The migration enables RLS and revokes direct `anon`/`authenticated` access to the model tables. A server-side RPC is granted to `service_role`; the Cloudflare Worker calls it with the Supabase secret key kept in runtime secrets. Do not expose that secret in the browser or source control.

If the project already has the earlier single-table `forecast_runs`, the migration renames it to `forecast_runs_legacy` and leaves its records intact. Once the new app has saved and verified forecasts, you may delete that legacy table manually if you no longer need its old records.
