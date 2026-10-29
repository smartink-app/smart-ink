import { useEffect, useState, type FormEvent } from 'react';
import { authMode, getInvite, requestEmailCode, signInWithGoogle, verifyEmailCode } from './auth/betaAuthService';
import { setPendingInvite } from './auth/pendingInvite';
import type { BetaSession, InvitePreview } from './auth/types';

export interface InvitePageProps {
  code: string;
  onBack: () => void;
  onLogin: () => void;
  onAuthenticated: (session: BetaSession) => void;
  notice?: string | null;
}

type Busy = 'google' | 'code' | 'verify' | null;
export default function InvitePage({ code, onBack, onLogin, onAuthenticated, notice }: InvitePageProps) {
  const [invite, setInvite] = useState<InvitePreview | null | undefined>();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const demo = authMode() === 'demo';
  const nativeHost = typeof window !== 'undefined' && window.smartInkNativeHost === true;

  useEffect(() => {
    let cancelled = false;
    setInvite(undefined); setError(null); setEmail(''); setOtp(''); setCodeSent(false); setDemoCode(null);
    getInvite(code).then(found => {
      if (!cancelled) { setInvite(found); setEmail(found?.email ?? ''); }
    }).catch(err => {
      if (!cancelled) { setInvite(null); setError(err instanceof Error ? err.message : 'Could not check your invitation. Please try again.'); }
    });
    return () => { cancelled = true; };
  }, [code, retry]);

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind); setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not continue. Please try again.'); }
    finally { setBusy(null); }
  };
  const sendCode = () => run('code', async () => {
    const result = await requestEmailCode(email, code);
    setDemoCode(result.demoCode ?? null); setOtp(''); setCodeSent(true);
  });
  const google = () => run('google', async () => {
    const session = await signInWithGoogle(email, code);
    if (session) onAuthenticated(session);
  });
  const verify = (event: FormEvent) => {
    event.preventDefault();
    void run('verify', async () => onAuthenticated(await verifyEmailCode(email, otp, code)));
  };
  const leave = (action: () => void) => { setPendingInvite(); action(); };
  const used = Boolean(invite?.redeemed);
  const expired = Boolean(invite && invite.expiresAt <= Date.now());
  const available = invite && !used && !expired;

  return <div className="login-page"><div className="login-left"><div className="login-card login-card--simple">
    <button type="button" className="beta-link-btn login-back" disabled={busy !== null} onClick={() => leave(onBack)}>← Home</button>
    <img className="login-logo" src="/brand-droplet.svg" alt="Smart Ink" width={60} height={72} />
    <p className="beta-eyebrow">Your private beta invitation</p>
    <h2>{codeSent ? 'Check your email' : used ? 'Already accepted' : expired ? 'Let’s get you a new invite' : 'You’re invited to Smart Ink'}</h2>
    <p className="login-subtitle">{codeSent ? `Enter the code sent to ${email.trim()}.` : used ? 'If you accepted this invitation, sign in to pick up where you left off.' : expired ? 'Ask the person who invited you for a fresh link, or request access from the homepage.' : 'Bring your tattoo ideas to life. Sign in below to accept your invitation and enter the studio. No password needed.'}</p>
    {invite === undefined && <p role="status" className="beta-muted">Checking your invitation…</p>}
    {notice && !busy && <p role="alert" className="beta-error">{notice}</p>}
    {error && <p role="alert" className="beta-error">{error}</p>}
    {invite === null && <div className="beta-form"><p className="beta-muted">{error ? 'Your invitation could not be checked.' : 'We couldn’t find this invitation. Check the link or ask the sender for a new one.'}</p><button className="btn-login" onClick={() => setRetry(value => value + 1)}>Try again</button><button className="beta-inline-link" onClick={() => leave(onBack)}>Request access</button></div>}
    {(used || expired) && <div className="beta-form"><button className="btn-continue" onClick={() => leave(onLogin)}>Go to sign in</button><button className="beta-inline-link" onClick={() => leave(onBack)}>Request a new invitation</button></div>}
    {available && !codeSent && <>
      {invite.email && <p className="beta-muted" style={{ marginBottom: 16 }}>For <strong>{invite.email}</strong>. Use this same email with Google or an email code.</p>}
      {!nativeHost && !demo && <><button className="btn-google" disabled={busy !== null} onClick={() => void google()}><span className="g-icon" aria-hidden="true">G</span>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button><div className="login-method-divider"><span>or use email</span></div></>}
      <form onSubmit={event => { event.preventDefault(); void sendCode(); }}>
        <label className="beta-label" htmlFor="invite-email">Email address</label>
        <input id="invite-email" className="login-input" type="email" autoComplete="email" required value={email} readOnly={Boolean(invite.email)} disabled={busy !== null} onChange={event => setEmail(event.target.value)} placeholder="you@studio.com" />
        <button className="btn-continue" type="submit" disabled={busy !== null}>{busy === 'code' ? 'Sending…' : 'Continue with email'}</button>
      </form>
      <p className="login-footer">Your invitation is accepted once you finish signing in.</p>
    </>}
    {available && codeSent && <>
      {demoCode && <p className="beta-banner" role="status">Local preview code: <strong>{demoCode}</strong>. No email was sent.</p>}
      <form onSubmit={verify}>
        <label className="beta-label" htmlFor="invite-otp">Sign-in code</label>
        <input id="invite-otp" className="login-input" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="6-digit code" value={otp} disabled={busy !== null} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} />
        <button className="btn-continue" type="submit" disabled={busy !== null || otp.length !== 6}>{busy === 'verify' ? 'Opening your studio…' : 'Accept invitation & enter studio'}</button>
      </form>
      <div className="login-code-actions"><button className="beta-inline-link" disabled={busy !== null} onClick={() => void sendCode()}>{busy === 'code' ? 'Sending…' : 'Send a new code'}</button><button className="beta-inline-link" disabled={busy !== null} onClick={() => { setCodeSent(false); setOtp(''); setDemoCode(null); setError(null); setPendingInvite(); }}>{invite.email ? 'Other sign-in options' : 'Use another email'}</button></div>
    </>}
  </div></div></div>;
}
