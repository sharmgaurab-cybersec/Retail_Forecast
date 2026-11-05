import { cookies } from 'next/headers';
import { SESSION_COOKIE, authConfig, authRequest } from '../../../lib/email-auth';

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export async function POST(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return Response.json({ error: 'Request origin rejected.' }, { status: 403 });
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 48_000) return Response.json({ error: 'Forecast is too large.' }, { status: 413 });
  const config = authConfig();
  if (!config) return Response.json({ error: 'Supabase is not configured yet.' }, { status: 503 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 8192) return Response.json({ error: 'Sign in with your Supabase email to save forecasts.' }, { status: 401 });
  let identity: Response;
  try { identity = await authRequest('/user', undefined, token); } catch { return Response.json({ error: 'Could not verify the Supabase session.' }, { status: 401 }); }
  if (!identity.ok) return Response.json({ error: 'Please sign in again to save forecasts.' }, { status: 401 });
  let body: any;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!isText(body.suburb, 80) || !isText(body.drink_type, 60) || !isText(body.product, 120) || !Number.isInteger(body.horizon_days) || body.horizon_days < 1 || body.horizon_days > 30 || !Number.isInteger(body.order_recommendation) || body.order_recommendation < 0 || !Array.isArray(body.daily) || body.daily.length !== body.horizon_days || body.daily.some((d: any) => !isText(d.date, 10) || !Number.isInteger(d.sales) || d.sales < 0 || (d.visitors !== null && d.visitors !== undefined && (!Number.isInteger(d.visitors) || d.visitors < 0)))) return Response.json({ error: 'Forecast fields were not valid.' }, { status: 400 });
  const payload = {
    suburb: body.suburb, drink_type: body.drink_type, product: body.product,
    horizon_days: body.horizon_days, visitors_days: Number.isInteger(body.visitors_days) ? Math.max(0, Math.min(366, body.visitors_days)) : 0,
    source: body.source === 'csv' ? 'csv' : 'assumption', order_recommendation: body.order_recommendation,
    daily_forecast: body.daily.map((d: any) => ({ date: d.date, expected_sales: d.sales, estimated_visitors: d.visitors ?? null, weather: d.weather ?? null, holiday: d.holiday ?? null })),
  };
  let saved: Response;
  try {
    saved = await fetch(`${config.url}/rest/v1/forecast_runs`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000), redirect: 'error' });
  } catch { return Response.json({ error: 'Could not reach the forecast database.' }, { status: 502 }); }
  if (!saved.ok) return Response.json({ error: saved.status === 401 || saved.status === 403 ? 'Database access was denied. Check the Supabase migration and sign in again.' : 'Could not save the forecast.' }, { status: saved.status === 401 || saved.status === 403 ? 403 : 502 });
  return Response.json({ saved: true }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
