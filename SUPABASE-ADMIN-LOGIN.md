# Supabase admin password sign-in

The planner accepts one administrator account: `reborngamming1@gmail.com`. Supabase Auth verifies the password; only a confirmed account with this exact email is allowed to open the planner. The admin can save forecast summaries and download PDF or CSV reports. The uploaded sales CSV remains in the browser.

## Set or change the admin password

1. In Supabase, open **Authentication → Users**.
2. Create a user with email `reborngamming1@gmail.com` if one does not already exist. Set a password and confirm the email/account.
3. To change access later, update/reset this user's password in Supabase Auth. Never put the password in the repository, Cloudflare variables, or a source file.

Email-code delivery and custom SMTP are not needed for this password login.

## Connect the deployed Cloudflare Worker

Set these runtime variables for the **production Worker** and redeploy:

- `SUPABASE_URL`: `https://YOUR_PROJECT_REF.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: the project's publishable key (legacy anon key is also accepted).

Use the URL and publishable key shown in Supabase's **Connect** dialog. Do not use `SUPABASE_SECRET_KEY`, a service-role key, or a database password. Do not put any credentials in GitHub.

The sign-in page checks `/api/session`; its `enabled` result is `true` only when both runtime variables are present and valid. After the production Worker is redeployed, reload `/login`. If it still says Supabase is not connected, check that the variables were added to the production Worker (not only a preview environment) and that the deployment containing the current code is active.

## Forecast database

Run `supabase/migrations/20261106_create_forecast_runs.sql` in the Supabase SQL editor to create the forecast history table and row-level security policies. Apply the repository's D1 auth-rate-limit schema and bind D1 as `DB` in Cloudflare. The Worker uses D1 for password-attempt throttling and Supabase Postgres for forecast rows.

## Security and privacy

The Worker sends the password directly to Supabase Auth over HTTPS and does not log or store it. It verifies the resulting access token with Supabase before issuing a secure, HttpOnly session cookie. The application allowlist is in `cloudflare/worker.mjs` and `lib/email-auth.ts`. The database stores aggregated forecast summaries, not the source CSV or customer-level data.
