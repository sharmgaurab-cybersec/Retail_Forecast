-- Coles cold drinks planner: persist each generated forecast and its daily detail.
-- Raw uploaded CSV rows are deliberately not stored by this migration.
CREATE TABLE IF NOT EXISTS forecast_runs (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  suburb TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  drink_type TEXT NOT NULL,
  product TEXT NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 30),
  usual_sales_per_day REAL NOT NULL DEFAULT 0,
  stock_on_hand REAL NOT NULL DEFAULT 0,
  incoming_stock REAL NOT NULL DEFAULT 0,
  safety_stock REAL NOT NULL DEFAULT 0,
  planned_price REAL,
  promotion_planned INTEGER NOT NULL DEFAULT 0 CHECK (promotion_planned IN (0, 1)),
  lead_time_days INTEGER,
  sales_days_count INTEGER NOT NULL DEFAULT 0,
  visitor_days_count INTEGER NOT NULL DEFAULT 0,
  population_years_count INTEGER NOT NULL DEFAULT 0,
  promotion_days_count INTEGER NOT NULL DEFAULT 0,
  stockout_days_count INTEGER NOT NULL DEFAULT 0,
  price_days_count INTEGER NOT NULL DEFAULT 0,
  weather_days_count INTEGER NOT NULL DEFAULT 0,
  expected_sales_units INTEGER NOT NULL,
  recommended_order_units INTEGER NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'weekday-weather-v1'
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_created_at
  ON forecast_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS forecast_days (
  forecast_run_id TEXT NOT NULL,
  forecast_date TEXT NOT NULL,
  baseline_units INTEGER NOT NULL,
  expected_sales_units INTEGER NOT NULL,
  weather_adjustment_percent INTEGER NOT NULL DEFAULT 0,
  seasonal_adjustment_percent INTEGER NOT NULL DEFAULT 0,
  population_adjustment_percent INTEGER NOT NULL DEFAULT 0,
  promotion_adjustment_percent INTEGER NOT NULL DEFAULT 0,
  price_adjustment_percent INTEGER NOT NULL DEFAULT 0,
  estimated_visitors INTEGER,
  weather_high_c REAL,
  rainfall_mm REAL,
  public_holiday TEXT,
  PRIMARY KEY (forecast_run_id, forecast_date),
  FOREIGN KEY (forecast_run_id) REFERENCES forecast_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecast_days_date
  ON forecast_days (forecast_date);
