type ForecastEnv = { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string };

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

export async function handleForecastApi(request: Request, env: ForecastEnv): Promise<Response> {
  if (request.method !== "POST") {
    return response({ error: "Use POST to save a forecast." }, 405);
  }
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    return response({ error: "Supabase storage is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to the Worker runtime settings." }, 503);
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

  const payload = {
    suburb: body.suburb,
    latitude: body.latitude,
    longitude: body.longitude,
    drinkType: body.drinkType,
    product: body.product,
    horizonDays: horizon,
    usualSalesPerDay: body.usualSalesPerDay,
    stockOnHand: body.stockOnHand,
    incomingStock: body.incomingStock,
    safetyStock: body.safetyStock,
    plannedPrice: body.plannedPrice,
    promotionPlanned: body.promotionPlanned,
    leadTimeDays: body.leadTimeDays,
    salesDaysCount: body.salesDaysCount,
    visitorDaysCount: body.visitorDaysCount,
    populationYearsCount: body.populationYearsCount,
    promotionDaysCount: body.promotionDaysCount,
    stockoutDaysCount: body.stockoutDaysCount,
    priceDaysCount: body.priceDaysCount,
    expectedSalesUnits: body.expectedSalesUnits,
    recommendedOrderUnits: body.recommendedOrderUnits,
    days,
  };

  try {
    const result = await fetch(`${supabaseUrl}/rest/v1/rpc/save_forecast`, {
      method: "POST",
      headers: {
        apikey: secretKey,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ p_payload: payload }),
    });
    if (!result.ok) {
      const details = await result.text();
      console.error("Supabase rejected forecast save", result.status, details.slice(0, 1200));
      return response({ error: "Could not save this forecast to Supabase. Check that the Supabase migration was applied and Worker secret is correct." }, 502);
    }
    const saved = await result.json() as { id: string; created_at: string; saved_days: number; saved_weather_days: number };
    return response({
      id: saved.id,
      createdAt: saved.created_at,
      savedDays: saved.saved_days,
      savedWeatherDays: saved.saved_weather_days,
      storage: "supabase",
    }, 201);
  } catch (error) {
    console.error("Could not save forecast to Supabase", error);
    return response({ error: "Supabase could not be reached while saving this forecast." }, 502);
  }
}
