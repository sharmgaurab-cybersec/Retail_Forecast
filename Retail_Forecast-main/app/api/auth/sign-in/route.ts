import { ADMIN_EMAIL, authBody, authConfig, authReply, authRequest, allowAuth, verifySession, SESSION_COOKIE } from '../../../../lib/email-auth';

export async function POST(request: Request) {
  const body = await authBody(request);
  if ('error' in body) return authReply({ error: body.error }, body.status);
  if (body.email !== ADMIN_EMAIL) return authReply({ error: 'This sign-in is restricted to the approved admin account.' }, 403);
  if (!authConfig()) return authReply({ error: 'Supabase sign-in is awaiting setup.' }, 503);
  try {
    if (!await allowAuth('password:' + body.email, 5, 10 * 60000) ||
        !await allowAuth('ip-password:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 20, 10 * 60000)) {
      return authReply({ error: 'Too many sign-in attempts. Wait a few minutes and try again.' }, 429);
    }
    const response = await authRequest('/token?grant_type=password', { email: body.email, password: body.password });
    if (!response.ok) return authReply({ error: response.status === 429 ? 'Too many sign-in attempts. Wait a few minutes and try again.' : 'The admin email or password is incorrect.' }, response.status === 429 ? 429 : 401);
    const session = await response.json() as { access_token?: string; expires_in?: number };
    if (!session.access_token || session.access_token.length > 8192) return authReply({ error: 'Could not verify the admin account.' }, 502);
    const user = await verifySession(session.access_token);
    if (!user || user.email.toLowerCase() !== body.email) return authReply({ error: 'Could not verify the admin account. Check that its email is confirmed in Supabase.' }, 401);
    const result = authReply({ ok: true });
    const age = Math.max(1, Math.min(3600, Number(session.expires_in) || 3600));
    result.headers.append('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`);
    return result;
  } catch {
    return authReply({ error: 'Supabase sign-in is temporarily unavailable.' }, 503);
  }
}
