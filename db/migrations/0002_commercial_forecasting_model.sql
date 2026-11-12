-- Normalize the planner's D1 model around stores, products, and forecast runs.
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id TEXT PRIMARY KEY NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_code TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  store_id TEXT PRIMARY KEY NOT NULL,
  store_name TEXT NOT NULL,
  suburb TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (suburb, latitude, longitude)
);

CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT,
  product_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (category, product_name)
);

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  ordered_date TEXT NOT NULL,
  expected_delivery_date TEXT,
  received_date TEXT,
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered >= 0),
  quantity_received INTEGER CHECK (quantity_received IS NULL OR quantity_received >= 0),
  unit_cost REAL CHECK (unit_cost IS NULL OR unit_cost >= 0),
  delivery_status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY (store_id) REFERENCES stores(store_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE IF NOT EXISTS weather_daily (
  weather_id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  weather_date TEXT NOT NULL,
  observation_type TEXT NOT NULL CHECK (observation_type IN ('forecast', 'observed')),
  high_temperature_c REAL,
  rainfall_mm REAL CHECK (rainfall_mm IS NULL OR rainfall_mm >= 0),
  weather_code INTEGER,
  data_source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (store_id, weather_date, observation_type),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

CREATE TABLE IF NOT EXISTS daily_sales (
  sales_id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sales_date TEXT NOT NULL,
  units_sold REAL NOT NULL CHECK (units_sold >= 0),
  store_visitors REAL CHECK (store_visitors IS NULL OR store_visitors >= 0),
  annual_area_population INTEGER CHECK (annual_area_population IS NULL OR annual_area_population > 0),
  promotion INTEGER NOT NULL DEFAULT 0 CHECK (promotion IN (0, 1)),
  unit_price REAL CHECK (unit_price IS NULL OR unit_price >= 0),
  stockout INTEGER NOT NULL DEFAULT 0 CHECK (stockout IN (0, 1)),
  data_source TEXT NOT NULL DEFAULT 'csv_import',
  created_at TEXT NOT NULL,
  UNIQUE (store_id, product_id, sales_date),
  FOREIGN KEY (store_id) REFERENCES stores(store_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  on_hand_units REAL NOT NULL CHECK (on_hand_units >= 0),
  incoming_units REAL NOT NULL DEFAULT 0 CHECK (incoming_units >= 0),
  safety_stock_units REAL NOT NULL DEFAULT 0 CHECK (safety_stock_units >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (store_id, product_id, snapshot_date),
  FOREIGN KEY (store_id) REFERENCES stores(store_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

ALTER TABLE forecast_runs ADD COLUMN store_id TEXT REFERENCES stores(store_id);
ALTER TABLE forecast_runs ADD COLUMN product_id TEXT REFERENCES products(product_id);

-- Rename the original child table to match the commercial model diagram.
ALTER TABLE forecast_days RENAME TO daily_forecasts;
DROP INDEX IF EXISTS idx_forecast_days_date;

CREATE INDEX IF NOT EXISTS idx_daily_sales_store_product_date
  ON daily_sales (store_id, product_id, sales_date);
CREATE INDEX IF NOT EXISTS idx_inventory_store_product_date
  ON inventory_snapshots (store_id, product_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_store_product_date
  ON deliveries (store_id, product_id, ordered_date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_store_date
  ON weather_daily (store_id, weather_date);
CREATE INDEX IF NOT EXISTS idx_daily_forecasts_date
  ON daily_forecasts (forecast_date);
