type ForecastDatabase = D1Database | undefined;

type ForecastDayInput = {
  date: string;
  sales: number;
  baseline: number;
  weatherEffect: number;
  seasonalEffect: number;
  populationEffect: number;
  promotionEffect: number;
  priceEffect: number;
  visitors: number | null;
  weather: { max: number; rain: number } | null;
  holiday: string | null;
};

const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function finite(value: unknown, min = 0, max = 1_000_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export async function handleForecastApi(request: Request, db: ForecastDatabase): Promise<Response> {
  if (request.method !== "POST") {
    return response({ error: "Use POST to save a forecast." }, 405);
  }
  if (!db) {
    return response({ error: "Forecast storage is not connected. Add the D1 binding and database ID, then deploy again." }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 512_000) return response({ error: "Forecast request is too large." }, 413);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return response({ error: "Invalid forecast request." }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return response({ error: "Invalid JSON request." }, 400);
  }

  const days = body.days;
  const horizon = body.horizonDays;
  const validDays = Array.isArray(days) && days.length >= 1 && days.length <= 30 && days.every((raw): raw is ForecastDayInput => {
    if (!raw || typeof raw !== "object") return false;
    const day = raw as Partial<ForecastDayInput>;
    return typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
      && finite(day.sales) && finite(day.baseline)
      && finite(day.weatherEffect, -100, 200) && finite(day.seasonalEffect, -100, 100)
      && finite(day.populationEffect, -100, 100) && finite(day.promotionEffect, -100, 100)
      && finite(day.priceEffect, -100, 100)
      && (day.visitors === null || finite(day.visitors))
      && (day.weather === null || (typeof day.weather === "object" && finite(day.weather.max, -100, 70) && finite(day.weather.rain, 0, 1_000)))
      && (day.holiday === null || typeof day.holiday === "string");
  });

  if (!isText(body.suburb, 120) || !finite(body.latitude, -90, 90) || !finite(body.longitude, -180, 180)
      || !isText(body.drinkType, 80) || !isText(body.product, 120)
      || !Number.isInteger(horizon) || !finite(horizon, 1, 30) || !validDays || days.length !== horizon
      || !finite(body.usualSalesPerDay) || !finite(body.stockOnHand) || !finite(body.incomingStock)
      || !finite(body.safetyStock) || !(body.plannedPrice === null || finite(body.plannedPrice))
      || typeof body.promotionPlanned !== "boolean"
      || !(body.leadTimeDays === null || (Number.isInteger(body.leadTimeDays) && finite(body.leadTimeDays, 0, 365)))
      || !finite(body.salesDaysCount, 0, 1461) || !finite(body.visitorDaysCount, 0, 1461)
      || !finite(body.populationYearsCount, 0, 10) || !finite(body.promotionDaysCount, 0, 1461)
      || !finite(body.stockoutDaysCount, 0, 1461) || !finite(body.priceDaysCount, 0, 1461)
      || !finite(body.expectedSalesUnits) || !finite(body.recommendedOrderUnits)) {
    return response({ error: "Forecast fields are missing or invalid." }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const snapshotDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Australia/Sydney" }).format(new Date());
  const weatherDaysCount = days.filter((day) => day.weather !== null).length;

  const storeCandidate = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO stores (store_id, store_name, suburb, latitude, longitude, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (suburb, latitude, longitude) DO NOTHING
  `).bind(storeCandidate, `Coles ${body.suburb.trim()}`, body.suburb.trim(), body.latitude, body.longitude, createdAt).run();
  const store = await db.prepare(`
    SELECT store_id FROM stores WHERE suburb = ? AND latitude = ? AND longitude = ? LIMIT 1
  `).bind(body.suburb.trim(), body.latitude, body.longitude).first<{ store_id: string }>();

  const productCandidate = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO products (product_id, category, product_name, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (category, product_name) DO NOTHING
  `).bind(productCandidate, body.drinkType.trim(), body.product.trim(), createdAt).run();
  const product = await db.prepare(`
    SELECT product_id FROM products WHERE category = ? AND product_name = ? LIMIT 1
  `).bind(body.drinkType.trim(), body.product.trim()).first<{ product_id: string }>();
  if (!store?.store_id || !product?.product_id) {
    return response({ error: "Could not prepare the store and product records for this forecast." }, 500);
  }

  const runInsert = db.prepare(`
    INSERT INTO forecast_runs (
      id, created_at, suburb, latitude, longitude, drink_type, product, horizon_days, store_id, product_id,
      usual_sales_per_day, stock_on_hand, incoming_stock, safety_stock, planned_price,
      promotion_planned, lead_time_days, sales_days_count, visitor_days_count,
      population_years_count, promotion_days_count, stockout_days_count, price_days_count,
      weather_days_count, expected_sales_units, recommended_order_units
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, createdAt, body.suburb.trim(), body.latitude, body.longitude, body.drinkType.trim(), body.product.trim(), horizon,
    store.store_id, product.product_id,
    body.usualSalesPerDay, body.stockOnHand, body.incomingStock, body.safetyStock, body.plannedPrice,
    body.promotionPlanned ? 1 : 0, body.leadTimeDays, body.salesDaysCount, body.visitorDaysCount,
    body.populationYearsCount, body.promotionDaysCount, body.stockoutDaysCount, body.priceDaysCount,
    weatherDaysCount, body.expectedSalesUnits, body.recommendedOrderUnits,
  );

  const dayInserts = days.map((raw) => {
    const day = raw as ForecastDayInput;
    return db.prepare(`
      INSERT INTO daily_forecasts (
        forecast_run_id, forecast_date, baseline_units, expected_sales_units,
        weather_adjustment_percent, seasonal_adjustment_percent, population_adjustment_percent,
        promotion_adjustment_percent, price_adjustment_percent, estimated_visitors,
        weather_high_c, rainfall_mm, public_holiday
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, day.date, day.baseline, day.sales, day.weatherEffect, day.seasonalEffect,
      day.populationEffect, day.promotionEffect, day.priceEffect, day.visitors,
      day.weather?.max ?? null, day.weather?.rain ?? null, day.holiday,
    );
  });

  const weatherInserts = days.filter((day) => day.weather !== null).map((raw) => {
    const day = raw as ForecastDayInput;
    return db.prepare(`
      INSERT INTO weather_daily (
        weather_id, store_id, weather_date, observation_type, high_temperature_c,
        rainfall_mm, data_source, updated_at
      ) VALUES (?, ?, ?, 'forecast', ?, ?, 'Open-Meteo', ?)
      ON CONFLICT (store_id, weather_date, observation_type) DO UPDATE SET
        high_temperature_c = excluded.high_temperature_c,
        rainfall_mm = excluded.rainfall_mm,
        data_source = excluded.data_source,
        updated_at = excluded.updated_at
    `).bind(crypto.randomUUID(), store.store_id, day.date, day.weather!.max, day.weather!.rain, createdAt);
  });

  const inventoryInsert = db.prepare(`
    INSERT INTO inventory_snapshots (
      snapshot_id, store_id, product_id, snapshot_date, on_hand_units,
      incoming_units, safety_stock_units, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (store_id, product_id, snapshot_date) DO UPDATE SET
      on_hand_units = excluded.on_hand_units,
      incoming_units = excluded.incoming_units,
      safety_stock_units = excluded.safety_stock_units,
      created_at = excluded.created_at
  `).bind(crypto.randomUUID(), store.store_id, product.product_id, snapshotDate, body.stockOnHand, body.incomingStock, body.safetyStock, createdAt);

  try {
    await db.batch([runInsert, inventoryInsert, ...weatherInserts, ...dayInserts]);
    return response({ id, createdAt, savedDays: dayInserts.length, savedWeatherDays: weatherInserts.length }, 201);
  } catch (error) {
    console.error("Could not save forecast run", error);
    return response({ error: "Could not save this forecast. Check that the D1 migration has been applied." }, 500);
  }
}
