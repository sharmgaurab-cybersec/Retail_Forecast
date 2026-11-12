# Build and deploy the Coles Cold Drinks Planner

The planner calculates forecasts without login and saves generated forecast results to Supabase.

## One-time Supabase setup

1. Open the SQL Editor in the Supabase project that should hold your forecasts.
2. Run the full SQL in `supabase/migrations/202611120001_coles_forecast_model.sql`. It creates the commercial tables and save function. If an older `forecast_runs` table exists, it is renamed to `forecast_runs_legacy` and preserved.
3. In Cloudflare → Workers & Pages → `retail-forecast` → Settings → Variables and secrets → Production, add `SUPABASE_SECRET_KEY` as a **secret**. Use the `sb_secret_...` key from the same Supabase project. `SUPABASE_URL` must also point to that project.
4. Redeploy the Worker. The secret is only used by the server endpoint; never put it in frontend code or GitHub.

## Cloudflare Workers Builds

- Root directory: `/` (or the project subdirectory if nested)
- Build command: `pnpm build`
- Deploy command: `pnpm run deploy:cloudflare`

There is no D1 database binding or `COLES_D1_DATABASE_ID` build variable required. Existing D1 records are untouched, but new forecasts are saved to Supabase. The app writes forecast runs, daily forecast rows, store/product rows, inventory snapshots, and available live weather. It does not upload the original CSV rows.

## Verify

After the deployment completes, create a forecast. Its status should say it was saved automatically. In Supabase → Table Editor, check `forecast_runs`, then use that row’s `id` to find its rows in `daily_forecasts`.
