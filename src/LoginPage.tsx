import { useState, type FormEvent } from 'react';
import {
  authMode,
  requestEmailCode,
  signInAsDevAdmin,
  signInWithGoogle,
  signInWithPassword,
  verifyEmailCode,
} from './auth/betaAuthService';
import { localDebugEnabled } from './auth/localDebug';
import type { BetaSession } from './auth/types';

export interface LoginPageProps {
  onAuthenticated: (session: BetaSession) => void;
  onBackToLanding?: () => void;
  onOpenInvite?: () => void;
  /** Shown above the form, e.g. after a Google sign-in for an email without access. */
  notice?: string | null;
}

type Busy = 'google' | 'code' | 'verify' | 'password' | null;

export default function LoginPage({ onAuthenticated, onBackToLanding, onOpenInvite, notice }: LoginPageProps) {
  const mode = authMode();
  const nativeHost = typeof window !== 'undefined' && window.smartInkNativeHost === true;
  const unconfigured = mode === 'unconfigured';
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>, fallback: string) => {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = () =>
    run(
      'google',
      async () => {
        const session = await signInWithGoogle(email);
        // null means the browser is on its way to Google.
        if (session) onAuthenticated(session);
      },
      'Could not sign in with Google.'
    );

  const handleSendCode = () =>
    run(
      'code',
      async () => {
        const result = await requestEmailCode(email);
        setDemoCode(result.demoCode ?? null);
        setCodeSent(true);
      },
      'Could not send code.'
    );

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    void run(
      'verify',
      async () => {
        onAuthenticated(await verifyEmailCode(email, otp));
      },
      'Could not verify code.'
    );
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-card login-card--simple">
          {onBackToLanding && !nativeHost && (
            <button
              type="button"
              className="beta-link-btn login-back"
              onClick={onBackToLanding}
            >
              ← Home
            </button>
          )}
          <img className="login-logo" src="/brand-droplet.svg" alt="Smart Ink" width={100} height={120} />
          <p className="beta-eyebrow">Smart Ink · Private beta</p>
          <h2>{codeSent ? 'Check your email' : 'Welcome to Smart Ink'}</h2>
          <p className="login-subtitle">
            {codeSent ? `Enter the code sent to ${email.trim()}.` : 'Use the email you accepted your invitation with. No password needed.'}
          </p>

          {notice && (
            <div className="beta-banner beta-banner--error" role="alert" style={{ marginBottom: 12 }}>
              {notice}
            </div>
          )}
          {unconfigured && (
            <div className="beta-banner" style={{ marginBottom: 12 }}>
              Sign-in isn’t set up on this deployment yet. Request access from the landing page and
              we’ll email you when it opens.
            </div>
          )}

          {!codeSent ? <>
            {!nativeHost && <>
              <button type="button" className="btn-google" onClick={handleGoogle} disabled={busy !== null || unconfigured}>
                <span className="g-icon" aria-hidden="true">G</span>
                {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
              </button>
              <div className="login-method-divider"><span>or use email</span></div>
            </>}
            <form onSubmit={event => { event.preventDefault(); void handleSendCode(); }}>
              <label className="beta-label" htmlFor="login-email">Email address</label>
              <input id="login-email" type="email" className="login-input" placeholder="you@studio.com"
                autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
                required disabled={busy !== null || unconfigured} aria-label="Email" />
              <button type="submit" className="btn-continue" disabled={busy !== null || unconfigured}>
                {busy === 'code' ? 'Sending…' : 'Email me a code'}
              </button>
            </form>
          </> : <>
            {demoCode && <div className="beta-banner" role="status">Local preview code: <strong>{demoCode}</strong>. No email was sent.</div>}
            <form onSubmit={handleVerify} className="login-code-form">
              <label className="beta-label" htmlFor="login-code">Sign-in code</label>
              <input id="login-code" className="login-input" inputMode="numeric" autoComplete="one-time-code"
                placeholder="6-digit code" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                pattern="[0-9]{6}" maxLength={6} required autoFocus disabled={busy !== null || unconfigured} aria-label="Sign-in code" />
              <button type="submit" className="btn-continue" disabled={busy !== null || unconfigured || otp.length !== 6}>
                {busy === 'verify' ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <div className="login-code-actions">
              <button type="button" className="beta-inline-link" disabled={busy !== null} onClick={() => void handleSendCode()}>{busy === 'code' ? 'Sending…' : 'Send a new code'}</button>
              <button type="button" className="beta-inline-link" disabled={busy !== null} onClick={() => { setCodeSent(false); setOtp(''); setDemoCode(null); setError(null); }}>Use another email</button>
            </div>
          </>}
          {mode === 'supabase' && !codeSent && (
            <details style={{ marginTop: 20 }}>
              <summary className="beta-inline-link" style={{ cursor: 'pointer' }}>Sign in with a password</summary>
              <form style={{ marginTop: 12 }} onSubmit={(event) => {
                event.preventDefault();
                void run('password', async () => {
                  try { onAuthenticated(await signInWithPassword(email, password)); }
                  finally { setPassword(''); }
                }, 'Could not sign in.');
              }}>
                <label className="beta-label" htmlFor="login-password">Password</label>
                <input id="login-password" className="login-input" type="password"
                  autoComplete="current-password" value={password} required
                  onChange={(event) => setPassword(event.target.value)} disabled={busy !== null} />
                <button type="submit" className="btn-continue" disabled={busy !== null || !email.trim() || !password}>
                  {busy === 'password' ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </details>
          )}
          {error && <p className="beta-error" role="alert">{error}</p>}

          <div className="login-footer">
            {onBackToLanding && !nativeHost && <p>New here? <button type="button" className="beta-inline-link" onClick={onBackToLanding}>Request beta access</button></p>}
            Have an invite code?{' '}
            {onOpenInvite ? (
              <button type="button" className="beta-inline-link" onClick={onOpenInvite}>
                Enter it here
              </button>
            ) : (
              <span>Open your invite link.</span>
            )}
          </div>
          {localDebugEnabled(mode) && <details className="login-demo-tools">
            <summary>Local preview tools</summary>
            <p className="beta-muted">Preview only. Data stays in this browser.</p>
            <button type="button" className="btn-login" disabled={busy !== null} onClick={() => void run('verify', async () => {
              onAuthenticated(await signInAsDevAdmin());
            }, 'Could not sign in as local admin.')}>Sign in as local admin</button>
          </details>}
        </div>
      </div>
    </div>
  );
}
