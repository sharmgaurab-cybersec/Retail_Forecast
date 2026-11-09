// Lightweight API only: no React, Next, catalogue parsing or server-side rendering.
const COOKIE = '__Host-coles-forecast-session';
const ADMIN_EMAIL = 'reborngamming1@gmail.com';
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra,
} });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

function config(env) {
  try {
    const url = new URL(env.SUPABASE_URL || '');
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
        url.pathname !== '/' || url.search || url.hash || url.port || url.username || url.password ||
        typeof key !== 'string' || !key.trim() || key.startsWith('sb_secret_')) return null;
    return { url: url.origin, key: key.trim() };
  } catch { return null; }
}
function cookieToken(request) {
  const token = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return token && token.length <= 8192 && /^[A-Za-z0-9._-]+$/.test(token) ? token : null;
}
async function auth(env, path, { body, token } = {}) {
  const c = config(env);
  if (!c) fail('Email sign-in is awaiting setup.', 503);
  return fetch(c.url + '/auth/v1' + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { apikey: c.key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
  });
}
function identity(data) {
  return data && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id) &&
    typeof data.email === 'string' && data.email_confirmed_at ? { id: 'email:' + data.id, email: data.email.toLowerCase() } : null;
}
async function user(request, env) {
  const token = cookieToken(request);
  if (!token || !config(env)) return null;
  const r = await auth(env, '/user', { token });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) fail('Could not verify your session. Try again later.', 503);
  const verified = identity(await r.json());
  return verified?.email === ADMIN_EMAIL ? verified : null;
}
function database(env) {
  if (!env.DB) fail('Database binding DB is missing. Configure a D1 database for authentication rate limits.', 503);
  return env.DB;
}
async function body(request, maxBytes = 2048) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail('Request origin rejected.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('JSON required.', 415);
  if (Number(request.headers.get('Content-Length') || 0) > maxBytes) fail('Request too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('Invalid request.');
  const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); fail('Request too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Invalid request.');
    return data;
  } catch { fail('Invalid request.'); }
}
async function limit(env, key, maximum, minutes) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hash = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
  const window = Math.floor(Date.now() / (minutes * 60000));
  const result = await database(env).prepare('INSERT INTO auth_rate_limits (key,window,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN auth_rate_limits.window=excluded.window THEN auth_rate_limits.count+1 ELSE 1 END WHERE auth_rate_limits.window!=excluded.window OR auth_rate_limits.count < ?').bind(hash, window, maximum).run();
  if (!result.meta.changes) fail('Please wait before trying again.', 429);
}
function emailAddress(data) {
  if (typeof data.email !== 'string') fail('Enter a valid email address.');
  const email = data.email.trim().toLowerCase();
  if (email.length > 254 || !/^\S+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Enter a valid email address.');
  return email;
}
async function api(request, env) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (path === '/api/session' && method === 'GET') {
    const u = await user(request, env);
    return json({ enabled: !!config(env), signedIn: !!u, ...(u ? { email: u.email } : {}) });
  }
  if (path === '/api/auth/sign-in' && method === 'POST') {
    const data = await body(request, 2048);
    const email = emailAddress(data);
    if (email !== ADMIN_EMAIL) fail('This sign-in is restricted to the approved admin account.', 403);
    if (!config(env)) fail('Email sign-in is awaiting setup.', 503);
    if (typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 256) fail('Enter your admin password.');
    await limit(env, 'password:' + email, 5, 10);
    await limit(env, 'ip-password:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 20, 10);
    const r = await auth(env, '/token?grant_type=password', { body: { email, password: data.password } });
    if (r.status === 429) fail('Too many sign-in attempts. Wait a few minutes and try again.', 429);
    if (!r.ok) fail('The admin email or password is incorrect.', 401);
    const session = await r.json();
    const token = session.access_token;
    if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9._-]+$/.test(token)) fail('Verification failed.', 502);
    // Verify identity with Supabase, rather than trusting client input or unverified JWT claims.
    const check = await auth(env, '/user', { token });
    const u = check.ok ? identity(await check.json()) : null;
    if (!u || u.email.toLowerCase() !== email) fail('Could not verify the admin account. Check that its email is confirmed in Supabase.', 401);
    const age = Math.max(1, Math.min(3600, Number(session.expires_in) || 3600));
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}` });
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    if (request.headers.get('Origin') !== new URL(request.url).origin) fail('Request origin rejected.', 403);
    const token = cookieToken(request);
    if (token && config(env)) {
      try { await auth(env, '/logout', { body: {}, token }); } catch { /* The local cookie is still cleared. */ }
    }
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` });
  }
  if (path === '/api/forecast-runs' && method === 'POST') {
    const data = await body(request, 48000);
    const token = cookieToken(request);
    if (!token || !config(env)) fail('Sign in with the approved admin account to save forecasts.', 401);
    const check = await auth(env, '/user', { token });
    const verified = check.ok ? identity(await check.json()) : null;
    if (!verified || verified.email !== ADMIN_EMAIL) fail('Please sign in again with the approved admin account.', 401);
    if (typeof data.suburb !== 'string' || data.suburb.length > 80 || typeof data.drink_type !== 'string' || data.drink_type.length > 60 || typeof data.product !== 'string' || data.product.length > 120 || !Number.isInteger(data.horizon_days) || data.horizon_days < 1 || data.horizon_days > 30 || !Number.isInteger(data.order_recommendation) || data.order_recommendation < 0 || !Array.isArray(data.daily) || data.daily.length !== data.horizon_days || data.daily.some(d => !d || typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isInteger(d.sales) || d.sales < 0 || (d.visitors != null && (!Number.isInteger(d.visitors) || d.visitors < 0)))) fail('Forecast fields were not valid.');
    const payload = {
      suburb: data.suburb, drink_type: data.drink_type, product: data.product,
      horizon_days: data.horizon_days, visitors_days: Number.isInteger(data.visitors_days) ? Math.max(0, Math.min(366, data.visitors_days)) : 0,
      source: data.source === 'csv' ? 'csv' : 'assumption', order_recommendation: data.order_recommendation,
      daily_forecast: data.daily.map(d => ({ date: d.date, expected_sales: d.sales, estimated_visitors: d.visitors ?? null, weather: d.weather ?? null, holiday: d.holiday ?? null })),
    };
    const c = config(env);
    const saved = await fetch(c.url + '/rest/v1/forecast_runs', { method: 'POST', headers: { apikey: c.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!saved.ok) fail(saved.status === 401 || saved.status === 403 ? 'Database access denied. Apply the Supabase migration and sign in again.' : 'Could not save the forecast.', saved.status === 401 || saved.status === 403 ? 403 : 502);
    return json({ saved: true });
  }
  return json({ error: 'Endpoint not found.' }, 404);
}
export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env); }
    catch (e) {
      if (e.status) return json({ error: e.message }, e.status);
      // Log categories only: never email addresses, request bodies, credentials or tokens.
      const message = String(e.message || '');
      const category = /no such table/i.test(message) ? 'missing_database_table' : /D1|SQLITE|database/i.test(message) ? 'database_error' : e.name === 'TimeoutError' ? 'provider_timeout' : 'api_error';
      console.error('coles_forecast_api_failure', category);
      return json({ error: category === 'missing_database_table' ? 'The rate-limit database table is missing. Apply the D1 setup SQL.' : 'Service temporarily unavailable. Check Worker logs for the failure category.' }, 503);
    }
  },
};
