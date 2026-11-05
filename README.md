# Coles Fresh Foods Stock Planner

An accessible browser-based stock planning forecast for Coles fresh foods in Sydney. Choose a suburb, fresh-food type and example product, then estimate expected sales and what remains to order using your own sales CSV, local weather and NSW public holidays.

## Scope and data

The planner is limited to fruit, vegetables, salad and herbs, fresh meat, seafood, dairy and eggs, bakery, and deli. Juice, packaged grocery and non-fresh categories are excluded. Product choices are examples, not a live catalogue, price or stock feed.

This app does not connect to a public Coles API for store-level historical sales. Upload an authorised Coles POS export for actual sales; the CSV is processed in your browser. Without one, the result is a clearly labelled rough estimate. The app does not scrape Coles pages or call undocumented endpoints. See [Coles website terms](https://www.coles.com.au/important-information/terms/website-terms-conditions).

## Download the sales CSV template

[Download the blank sales CSV template](./sales-template.csv)

Use one row per date, including zero-sales days. Required columns are `date` and `units_sold`; dates may be `YYYY-MM-DD` or Australian `DD/MM/YYYY`. Optional columns are `retailer`, `suburb`, and `product_group`. If included, retailer must be Coles. Keep private POS exports and credentials out of GitHub.

## Practical pilot database

- [Database setup and safety notes](./database/README.md)
- [PostgreSQL schema](./database/schema.sql)
- [Synthetic fresh-food demo seed](./database/seed_synthetic_demo.sql)
- [Pilot checklist and KPI scorecard](./docs/practical-pilot-plan.md)

Run locally with PostgreSQL:

```bash
createdb coles_forecast
psql -d coles_forecast -f database/schema.sql
psql -d coles_forecast -f database/seed_synthetic_demo.sql
```

The seed file contains fictional apple sales and weather data only. It demonstrates the schema and is not Coles performance data. Actual Coles POS and stock records require an authorised export or integration.

## Publish with GitHub Pages

1. Upload the contents of this folder (not the ZIP file itself) to the root of a GitHub repository.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, choose your publishing branch (usually `main`) and the `/ (root)` folder, then save.
4. For a custom domain, add it in Pages settings and configure DNS with your domain provider.

On GitHub Free, GitHub Pages normally requires a public repository. Do not upload private sales exports or secrets.

## Data sources

- Weather: [Open-Meteo](https://open-meteo.com/)
- NSW public holidays: [Nager.Date](https://date.nager.at/)
