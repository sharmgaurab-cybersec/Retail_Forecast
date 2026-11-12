# Build and deploy the simple Coles Sydney Drinks Planner

The planner is a public, no-login prototype. It does not require Supabase, D1, secrets, or database bindings.

## Cloudflare Workers Builds

Keep `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `app/`, and `cloudflare/` together at the selected root. Use:

- Root directory: `/` (or `/Retail_Forecast-main` if the project is nested)
- Build command: `pnpm build`
- Deploy command: `pnpm exec wrangler deploy --config dist/server/wrangler.json --keep-vars`

Cloudflare installs dependencies and the build generates `dist/server/wrangler.json`. Deploy from Workers Builds; do not use the static asset uploader. No D1 database ID or Supabase runtime variables are needed.

After pushing the repository to GitHub, wait for the Production deployment to finish and open the Worker URL.
