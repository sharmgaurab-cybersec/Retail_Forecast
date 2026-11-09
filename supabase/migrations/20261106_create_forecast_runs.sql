-- Cold drink forecast history. Requires Supabase email authentication.
create table if not exists public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  suburb text not null check (char_length(suburb) between 1 and 80),
  drink_type text not null check (char_length(drink_type) between 1 and 60),
  product text not null check (char_length(product) between 1 and 120),
  horizon_days smallint not null check (horizon_days between 1 and 30),
  visitors_days smallint not null default 0 check (visitors_days between 0 and 366),
  source text not null check (source in ('csv', 'assumption')),
  order_recommendation integer not null check (order_recommendation >= 0),
  daily_forecast jsonb not null check (jsonb_typeof(daily_forecast) = 'array' and jsonb_array_length(daily_forecast) between 1 and 30)
);

alter table public.forecast_runs enable row level security;
grant select, insert on public.forecast_runs to authenticated;

drop policy if exists "Users can read own forecast runs" on public.forecast_runs;
create policy "Users can read own forecast runs" on public.forecast_runs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can save own forecast runs" on public.forecast_runs;
create policy "Users can save own forecast runs" on public.forecast_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);

create index if not exists forecast_runs_user_created_idx
  on public.forecast_runs (user_id, created_at desc);
