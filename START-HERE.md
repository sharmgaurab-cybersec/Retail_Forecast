# Start here: Coles Cold Drinks Stock Planner

This repository contains the source code for a Coles-focused cold-drinks forecasting web app.

## Preview locally

1. Install Node.js 22.13 or newer and pnpm 11.25.0.
2. Extract/open this project folder in your editor.
3. Run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

4. Visit `http://localhost:5173`.

You can try forecasts without signing in or uploading a CSV. To use your own history, download the CSV template from the page, fill in daily sales and optional store visitors, and upload it. The forecast can use up to one year of daily rows.

## Connect Supabase

Forecast saving requires a Supabase project. Run `supabase/migrations/20261106_create_forecast_runs.sql` in its SQL editor, enable email OTP and SMTP, then configure the Cloudflare Worker variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. See `README.md` and `EMAIL-OTP-SETUP.md` for full steps. A Supabase secret/service-role key must never go in the browser or GitHub.

## Upload to GitHub

Create a repository in your GitHub account and upload the extracted project files (or push this folder using Git). Keep the folder structure, `package.json`, `pnpm-lock.yaml`, Cloudflare config and source files. Do not upload `.env`, `.dev.vars`, credentials, local database state, `node_modules`, or private sales CSVs. GitHub Pages cannot run the Worker backend; use Cloudflare Workers or another compatible server host.

Deployment and data-source limits are documented in `README.md`.
