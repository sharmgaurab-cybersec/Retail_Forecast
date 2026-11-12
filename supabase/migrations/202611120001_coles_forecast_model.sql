-- Coles Stock Planner model for Supabase/Postgres.
-- Existing single-table forecasts are renamed and preserved; nothing is dropped.

DO $$
BEGIN
  IF to_regclass('public.forecast_runs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='forecast_runs' AND column_name='store_id')
     AND to_regclass('public.forecast_runs_legacy') IS NULL THEN
    ALTER TABLE public.forecast_runs RENAME TO forecast_runs_legacy;
  END IF;
  IF to_regclass('public.daily_forecasts') IS NOT NULL
     AND to_regclass('public.daily_forecasts_legacy') IS NULL THEN
    ALTER TABLE public.daily_forecasts RENAME TO daily_forecasts_legacy;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.suppliers (
  supplier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text NOT NULL,
  supplier_code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stores (
  store_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL,
  suburb text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (suburb, latitude, longitude)
);

CREATE TABLE IF NOT EXISTS public.products (
  product_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  product_name text NOT NULL,
  brand text,
  product_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, product_name)
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(supplier_id),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL REFERENCES public.products(product_id),
  ordered_date date NOT NULL,
  expected_date date,
  received_date date,
  ordered_units integer NOT NULL DEFAULT 0 CHECK (ordered_units >= 0),
  received_units integer NOT NULL DEFAULT 0 CHECK (received_units >= 0),
  unit_cost numeric(12,2),
  delivery_status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weather_daily (
  weather_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  weather_date date NOT NULL,
  observation_type text NOT NULL CHECK (observation_type IN ('forecast','observed')),
  high_temperature_c numeric(5,2),
  rainfall_mm numeric(7,2),
  weather_code integer,
  data_source text NOT NULL DEFAULT 'Open-Meteo',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, weather_date, observation_type)
);

CREATE TABLE IF NOT EXISTS public.daily_sales (
  sales_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
  sales_date date NOT NULL,
  units_sold integer NOT NULL CHECK (units_sold >= 0),
  store_visitors integer CHECK (store_visitors IS NULL OR store_visitors >= 0),
  annual_area_population integer CHECK (annual_area_population IS NULL OR annual_area_population >= 0),
  promotion_active boolean NOT NULL DEFAULT false,
  unit_price numeric(12,2),
  stockout boolean NOT NULL DEFAULT false,
  data_source text NOT NULL DEFAULT 'csv_upload',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id, sales_date)
);

CREATE TABLE IF NOT EXISTS public.inventory_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  on_hand_units integer NOT NULL DEFAULT 0 CHECK (on_hand_units >= 0),
  incoming_units integer NOT NULL DEFAULT 0 CHECK (incoming_units >= 0),
  safety_stock_units integer NOT NULL DEFAULT 0 CHECK (safety_stock_units >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS public.forecast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL REFERENCES public.products(product_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  suburb text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  drink_type text NOT NULL,
  product text NOT NULL,
  horizon_days smallint NOT NULL CHECK (horizon_days BETWEEN 1 AND 30),
  usual_sales_per_day numeric(12,3) NOT NULL DEFAULT 0,
  stock_on_hand numeric(12,3) NOT NULL DEFAULT 0,
  incoming_stock numeric(12,3) NOT NULL DEFAULT 0,
  safety_stock numeric(12,3) NOT NULL DEFAULT 0,
  planned_price numeric(12,2),
  promotion_planned boolean NOT NULL DEFAULT false,
  lead_time_days smallint,
  sales_days_count integer NOT NULL DEFAULT 0,
  visitor_days_count integer NOT NULL DEFAULT 0,
  population_years_count integer NOT NULL DEFAULT 0,
  promotion_days_count integer NOT NULL DEFAULT 0,
  stockout_days_count integer NOT NULL DEFAULT 0,
  price_days_count integer NOT NULL DEFAULT 0,
  weather_days_count integer NOT NULL DEFAULT 0,
  expected_sales_units integer NOT NULL,
  recommended_order_units integer NOT NULL,
  model_version text NOT NULL DEFAULT 'weekday-weather-v1'
);

CREATE TABLE IF NOT EXISTS public.daily_forecasts (
  forecast_run_id uuid NOT NULL REFERENCES public.forecast_runs(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  baseline_units integer NOT NULL,
  expected_sales_units integer NOT NULL,
  weather_adjustment_percent numeric(7,2) NOT NULL DEFAULT 0,
  seasonal_adjustment_percent numeric(7,2) NOT NULL DEFAULT 0,
  population_adjustment_percent numeric(7,2) NOT NULL DEFAULT 0,
  promotion_adjustment_percent numeric(7,2) NOT NULL DEFAULT 0,
  price_adjustment_percent numeric(7,2) NOT NULL DEFAULT 0,
  estimated_visitors integer,
  weather_high_c numeric(5,2),
  rainfall_mm numeric(7,2),
  public_holiday text,
  PRIMARY KEY (forecast_run_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_created_at ON public.forecast_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_sales_store_product_date ON public.daily_sales(store_id, product_id, sales_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_forecasts_date ON public.daily_forecasts(forecast_date);

-- The Worker calls this one atomic RPC with its server-only Supabase secret key.
CREATE OR REPLACE FUNCTION public.save_forecast(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store_id uuid;
  v_product_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_created_at timestamptz := now();
  v_saved_days integer := 0;
  v_saved_weather_days integer := 0;
  v_day jsonb;
BEGIN
  INSERT INTO public.stores (store_name, suburb, latitude, longitude)
  VALUES ('Coles ' || (p_payload->>'suburb'), p_payload->>'suburb', (p_payload->>'latitude')::double precision, (p_payload->>'longitude')::double precision)
  ON CONFLICT (suburb, latitude, longitude) DO UPDATE SET store_name = EXCLUDED.store_name
  RETURNING store_id INTO v_store_id;

  INSERT INTO public.products (category, product_name)
  VALUES (p_payload->>'drinkType', p_payload->>'product')
  ON CONFLICT (category, product_name) DO UPDATE SET product_name = EXCLUDED.product_name
  RETURNING product_id INTO v_product_id;

  INSERT INTO public.forecast_runs (
    id, store_id, product_id, created_at, suburb, latitude, longitude, drink_type, product,
    horizon_days, usual_sales_per_day, stock_on_hand, incoming_stock, safety_stock,
    planned_price, promotion_planned, lead_time_days, sales_days_count, visitor_days_count,
    population_years_count, promotion_days_count, stockout_days_count, price_days_count,
    weather_days_count, expected_sales_units, recommended_order_units
  ) VALUES (
    v_run_id, v_store_id, v_product_id, v_created_at, p_payload->>'suburb',
    (p_payload->>'latitude')::double precision, (p_payload->>'longitude')::double precision,
    p_payload->>'drinkType', p_payload->>'product', (p_payload->>'horizonDays')::smallint,
    (p_payload->>'usualSalesPerDay')::numeric, (p_payload->>'stockOnHand')::numeric,
    (p_payload->>'incomingStock')::numeric, (p_payload->>'safetyStock')::numeric,
    NULLIF(p_payload->>'plannedPrice','null')::numeric, (p_payload->>'promotionPlanned')::boolean,
    NULLIF(p_payload->>'leadTimeDays','null')::smallint, (p_payload->>'salesDaysCount')::integer,
    (p_payload->>'visitorDaysCount')::integer, (p_payload->>'populationYearsCount')::integer,
    (p_payload->>'promotionDaysCount')::integer, (p_payload->>'stockoutDaysCount')::integer,
    (p_payload->>'priceDaysCount')::integer,
    (SELECT count(*) FROM jsonb_array_elements(p_payload->'days') d WHERE d->'weather' IS NOT NULL AND d->'weather' <> 'null'::jsonb),
    (p_payload->>'expectedSalesUnits')::integer, (p_payload->>'recommendedOrderUnits')::integer
  );

  INSERT INTO public.inventory_snapshots (store_id, product_id, snapshot_date, on_hand_units, incoming_units, safety_stock_units)
  VALUES (v_store_id, v_product_id, (now() AT TIME ZONE 'Australia/Sydney')::date,
    (p_payload->>'stockOnHand')::numeric::integer, (p_payload->>'incomingStock')::numeric::integer, (p_payload->>'safetyStock')::numeric::integer)
  ON CONFLICT (store_id, product_id, snapshot_date) DO UPDATE SET
    on_hand_units=EXCLUDED.on_hand_units, incoming_units=EXCLUDED.incoming_units,
    safety_stock_units=EXCLUDED.safety_stock_units, created_at=now();

  FOR v_day IN SELECT value FROM jsonb_array_elements(p_payload->'days') LOOP
    INSERT INTO public.daily_forecasts (
      forecast_run_id, forecast_date, baseline_units, expected_sales_units,
      weather_adjustment_percent, seasonal_adjustment_percent, population_adjustment_percent,
      promotion_adjustment_percent, price_adjustment_percent, estimated_visitors,
      weather_high_c, rainfall_mm, public_holiday
    ) VALUES (
      v_run_id, (v_day->>'date')::date, (v_day->>'baseline')::numeric::integer,
      (v_day->>'sales')::numeric::integer, (v_day->>'weatherEffect')::numeric,
      (v_day->>'seasonalEffect')::numeric, (v_day->>'populationEffect')::numeric,
      (v_day->>'promotionEffect')::numeric, (v_day->>'priceEffect')::numeric,
      NULLIF(v_day->>'visitors','null')::numeric::integer,
      NULLIF(v_day->'weather'->>'max','null')::numeric,
      NULLIF(v_day->'weather'->>'rain','null')::numeric,
      NULLIF(v_day->>'holiday','null')
    );
    v_saved_days := v_saved_days + 1;
    IF v_day->'weather' IS NOT NULL AND v_day->'weather' <> 'null'::jsonb THEN
      INSERT INTO public.weather_daily (store_id, weather_date, observation_type, high_temperature_c, rainfall_mm, data_source)
      VALUES (v_store_id, (v_day->>'date')::date, 'forecast', NULLIF(v_day->'weather'->>'max','null')::numeric,
        NULLIF(v_day->'weather'->>'rain','null')::numeric, 'Open-Meteo')
      ON CONFLICT (store_id, weather_date, observation_type) DO UPDATE SET
        high_temperature_c=EXCLUDED.high_temperature_c, rainfall_mm=EXCLUDED.rainfall_mm,
        data_source=EXCLUDED.data_source, updated_at=now();
      v_saved_weather_days := v_saved_weather_days + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', v_run_id, 'created_at', v_created_at,
    'saved_days', v_saved_days, 'saved_weather_days', v_saved_weather_days);
END;
$$;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_forecasts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.suppliers, public.stores, public.products, public.deliveries,
  public.weather_daily, public.daily_sales, public.inventory_snapshots,
  public.forecast_runs, public.daily_forecasts FROM anon, authenticated;
GRANT ALL ON public.suppliers, public.stores, public.products, public.deliveries,
  public.weather_daily, public.daily_sales, public.inventory_snapshots,
  public.forecast_runs, public.daily_forecasts TO service_role;
REVOKE ALL ON FUNCTION public.save_forecast(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_forecast(jsonb) TO service_role;
