# Forecast history database model

The current planner needs to retain each completed forecast and the assumptions behind it. The D1 schema uses two tables linked by the forecast run ID.

| Table | One row represents | Main fields |
| --- | --- | --- |
| `forecast_runs` | One submitted forecast | Created time, Sydney suburb coordinates, drink and product, forecast length, stock settings, summary counts from sales data, expected sales, recommended order, and model version |
| `forecast_days` | One date inside a forecast | Baseline and expected units, weather and other adjustment percentages, estimated visitors, weather high/rain, and public holiday |

Relationship: one `forecast_runs` record has one `forecast_days` record for each forecast date. The child table uses `(forecast_run_id, forecast_date)` as its primary key and references `forecast_runs.id`; deleting a run cascades to its daily rows.

## What is persisted

- The forecast inputs and final order recommendation.
- Counts describing the uploaded sales history (for example, number of sales days, visitor days, promotions, stockouts, and price observations).
- The forecast result and weather details for each day.

The raw CSV is not uploaded. It remains in the browser and is used only to calculate that forecast. Customer names and IDs are not part of this model.

## Current scope and next commercial step

This is a single public prototype database without user or store access controls. Anyone who can use the public planner can submit forecast runs; the app has no run-history browsing API. For a commercial rollout, add authenticated organizations and users, stores, products/SKUs, imported daily sales, inventory snapshots, and supplier lead-time records, then enforce row access by organization/store. Do not use the public prototype to store confidential operational data.

The schema is installed by `db/migrations/0001_forecast_history.sql` during `pnpm run deploy:cloudflare`.
