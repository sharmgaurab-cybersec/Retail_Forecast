# Supabase email sign-in and forecast storage

The app uses Supabase Auth email one-time codes. A signed-in user can save forecast summaries to the `forecast_runs` table. The original uploaded CSV stays in the browser and is not sent to Supabase.

## Configure Supabase

1. Create a Supabase project for this app.
2. Enable email sign-in and new-user signups. Keep email confirmation enabled.
3. In Authentication → Email Templates, configure the email template to display `{{ .Token }}`. Set a six-digit OTP and an expiry in the Auth settings.
4. Configure a custom SMTP sender for delivery to public email addresses; follow the provider's SPF, DKIM and DMARC instructions.
5. Run `supabase/migrations/20261106_create_forecast_runs.sql` in the Supabase SQL editor.
6. Set these variables in the Cloudflare Worker environment and redeploy:
   - `SUPABASE_URL`: `https://YOUR_PROJECT_REF.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: the project's publishable key (legacy anon key is also accepted).

Never expose the Supabase secret or service-role key in browser code, environment files committed to GitHub, or the public repository. The app calls Supabase PostgREST with the user's verified access token, and the database row-level security policies restrict reads and inserts to that user's own rows.

## Cloudflare D1

The Worker uses D1 for rate-limiting email code requests. It uses Supabase Postgres for forecast history. Configure a D1 database with the `DB` binding and apply the repository's auth rate-limit schema before enabling email sign-in. Keep `.dev.vars` local and untracked.

## Verify setup

After deploying, request a code using an email address, verify it, create a forecast and confirm that the save status appears. In Supabase Table Editor, confirm that one row was added to `forecast_runs`. Sign in as a second user and verify that the first user's row is not visible under that second account. Test invalid and expired codes before public use.

## Privacy

The saved row includes suburb, drink type, product, forecast horizon, count of uploaded visitor-history days, data-source label, order recommendation and daily forecast summary. It does not store the source CSV or individual customer information. Only use aggregated store visitor counts and sales data you are authorised to process.
