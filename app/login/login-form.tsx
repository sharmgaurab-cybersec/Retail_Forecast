'use client';
import { useEffect, useState } from 'react';

const ADMIN_EMAIL = 'reborngamming1@gmail.com';

export default function LoginForm() {
  const [setupState, setSetupState] = useState<'checking' | 'ready' | 'missing' | 'unavailable'>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/session', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw Error('Session check failed.');
        return response.json() as Promise<{ enabled?: boolean; signedIn?: boolean; email?: string }>;
      })
      .then(data => {
        if (!active) return;
        if (data.signedIn && data.email?.toLowerCase() === ADMIN_EMAIL) {
          window.location.replace('/');
          return;
        }
        setSetupState(data.enabled === true ? 'ready' : 'missing');
      })
      .catch(() => { if (active) setSetupState('unavailable'); });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password }),
      });
      const result = await response.json() as { error?: string; debugStage?: string };
      if (!response.ok) {
        const detail = result.debugStage ? ` (diagnostic: ${result.debugStage})` : '';
        throw Error((result.error || 'Sign-in failed.') + detail);
      }
      window.location.assign('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <a className="brand" href="/">Coles Stock Planner</a>
    <section className="login-card">
      <span className="eyebrow">ADMIN ACCESS</span>
      <h1>Sign in to view forecasts.</h1>
      <p>Use the admin password managed in Supabase to open the planner and download forecast reports.</p>
      {setupState === 'checking' ? <div className="setup-notice" role="status">Checking Supabase connection…</div>
        : setupState === 'unavailable' ? <div className="setup-notice" role="alert"><strong>Could not check the Supabase connection.</strong><p>The Worker status endpoint did not respond. Check that this site is served by the deployed forecast Worker.</p></div>
        : setupState === 'missing' ? <div className="setup-notice"><strong>Supabase sign-in is not connected.</strong><p>Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the live Cloudflare Worker settings, then deploy the Worker.</p></div>
        : <form onSubmit={submit}>
          <label>Admin email<input type="email" autoComplete="username" value={ADMIN_EMAIL} readOnly aria-readonly="true" /></label>
          <label>Password<input type="password" autoComplete="current-password" required minLength={1} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to planner'}</button>
        </form>}
      {error && <p className="login-error" role="alert">{error}</p>}
      <p className="small-text">Only {ADMIN_EMAIL} can open the planner. Create or change this account’s password in Supabase Authentication. Your password is sent directly to Supabase over HTTPS and is never saved by this app.</p>
      <a href="/">← Back to forecast</a>
    </section>
  </main>;
}
