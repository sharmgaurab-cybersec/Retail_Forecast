# Build and deploy the Coles Stock Planner

## Fix the repository layout

The app must be at the selected Cloudflare root. At the root you should see `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `app/`, and `cloudflare/` together. Do not leave the source nested inside a second `Retail_Forecast-main/` folder when Cloudflare's root directory is `/`.

Use either approach:

- Recommended: place the contents of this ZIP directly at the GitHub repository root, then set Cloudflare root directory to `/`.
- If you keep the nested folder in GitHub, set Cloudflare root directory to `/Retail_Forecast-main`.

## Cloudflare Workers Builds settings

- Root directory: `/` (or `/Retail_Forecast-main` if you keep the nested folder)
- Build command: `pnpm build`
- Deploy command: `pnpm exec wrangler deploy --config dist/server/wrangler.json --keep-vars`

Before deploying, open `vite.config.ts` and replace `PASTE_YOUR_COLES_D1_DATABASE_ID_HERE` with the ID shown on the Cloudflare D1 page for `coles-stock-planner-db`. Also update the same placeholder in `wrangler.cloudflare.jsonc` so both project configurations point to the same database. Keep the binding name `DB` and database name `coles-stock-planner-db` unchanged.

Cloudflare installs dependencies from `package.json` and `pnpm-lock.yaml` before running the build. The build generates `dist/server/wrangler.json`; Wrangler uses it to deploy the built application. `--keep-vars` preserves runtime variables configured on the Worker when this generated Wrangler config does not list them. Do not use the Cloudflare static asset upload page for this project.

Keep `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as production Worker runtime variables. Do not put them in GitHub source. The admin password is managed in Supabase Auth for `reborngamming1@gmail.com`.

## If the GitHub commit still shows a red X

Open the red X, choose **Details**, and check the first error in the Cloudflare build log. A red X only shows that a check failed; this repository view does not include the failing log message. Confirm the build log says it found `package.json` under the selected root and that `dist/server/wrangler.json` exists after `pnpm build`.
