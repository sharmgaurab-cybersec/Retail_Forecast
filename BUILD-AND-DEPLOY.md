# Build and deploy the Coles Cold Drinks Planner

The planner calculates forecasts without login. Cloudflare D1 stores every generated forecast when its database binding is configured.

## Cloudflare Workers Builds settings

Keep the project files together at the selected repository root. Configure:

- Root directory: `/` (or the project subdirectory if it is nested)
- Build command: `pnpm build`
- Deploy command: `pnpm run deploy:cloudflare`

In **Settings → Builds → Build variables and secrets**, add:

- `COLES_D1_DATABASE_ID` = the ID for the D1 database named `coles-stock-planner-db`

This must be a **build variable**, not a Worker runtime variable. The ID is not secret; the build uses it to generate the `DB` binding in the deployment config. If you have not created the database, create it in Cloudflare D1 first.

`pnpm run deploy:cloudflare` detects the D1 binding in the generated config, applies the SQL migrations in `db/migrations` to the remote database, then deploys the Worker. The migrations create the full model described in `DATABASE-MODEL.md`. If the build variable is missing, it skips migrations and deploys without persistence so the site itself can still go live.

After deployment, create a forecast in the web app. The result should show “Saved automatically to forecast history”. If D1 is not connected, the forecast still calculates and the result explains why it was not saved.

The app stores forecast settings, summary counts from the uploaded CSV, the order recommendation, and every daily forecast. It does not upload or store the raw CSV. This version has no user login, so do not upload confidential store information while the site is public.

Deploy from Workers Builds; do not use Cloudflare's static asset uploader.
