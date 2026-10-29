import { useEffect, useRef, useState } from 'react';
import type { BetaSession } from './auth/types';
import { authMode } from './auth/betaAuthService';
import { loadAccountProfile, saveAccountProfile, updateAccountPassword, type AccountProfile } from './accountProfile';
import { getAppearance, setAppearance, type Appearance } from './appearancePreference';
import './account-settings.css';

type Props = { session: BetaSession; onSignOut: (opts?: { everywhere?: boolean }) => void | Promise<void> };
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export default function AccountSettings({ session, onSignOut }: Props) {
  const [profile, setProfile] = useState<AccountProfile>({ displayName: session.displayName, studioName: '', website: '', bio: '' });
  const [original, setOriginal] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [appearance, updateAppearance] = useState(getAppearance);
  const lock = useRef(false);
  const identity = session.userId ?? session.email;
  // Auth emits USER_UPDATED after a save. A changed display name must not reset an in-progress form.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const hosted = authMode() === 'supabase';
  const dirty = original !== null && JSON.stringify(profile) !== JSON.stringify(original);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setOriginal(null); setError(''); setNotice(''); setPassword(''); setConfirmation('');
    void loadAccountProfile(sessionRef.current).then(data => {
      if (!cancelled) { setProfile(data); setOriginal(data); }
    }).catch(err => { if (!cancelled) setError(message(err)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [identity, attempt]);

  useEffect(() => {
    if (!dirty && !password && !confirmation) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, password, confirmation]);

  useEffect(() => {
    const sync = () => updateAppearance(getAppearance());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  async function run(action: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(action); setError(''); setNotice('');
    try { await work(); } catch (err) { setError(message(err)); }
    finally { lock.current = false; setBusy(''); }
  }
  const edit = (key: keyof AccountProfile, value: string) => { setProfile(current => ({ ...current, [key]: value })); setNotice(''); };
  const save = () => run('profile', async () => {
    const saved = await saveAccountProfile(session, profile);
    setProfile(saved); setOriginal(saved); setNotice('Your profile has been saved.');
  });
  const signOut = (everywhere = false) => run('signout', async () => {
    if (dirty || password || confirmation) throw new Error('Save or discard your edits before signing out.');
    await onSignOut({ everywhere });
  });
  function downloadProfile() {
    void run('export', async () => {
      const saved = await loadAccountProfile(session);
      const data = { exportedAt: new Date().toISOString(), account: { email: session.email, signInMethod: session.method }, profile: saved };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'smart-ink-profile.json'; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Your saved profile download is ready.');
    });
  }

  return <section className="account-settings account-settings--complete" aria-busy={loading || !!busy}>
    <header className="account-heading"><span className="account-eyebrow">YOUR WORKSPACE</span><h1>Account settings</h1><p>Make Smart Ink feel like yours. Manage your profile, appearance and sign-in.</p></header>
    <div className="account-summary"><span className="account-avatar" aria-hidden="true">{(original?.displayName ?? session.displayName).slice(0, 1).toUpperCase()}</span><div><strong>{original?.displayName ?? session.displayName}</strong><span>{session.email}</span></div><span className="account-badge">{hosted ? 'Beta member' : 'Local demo'}</span></div>
    {!hosted && <p className="account-info">Demo account · Your profile is saved in this browser. Password and remote session management require a hosted account.</p>}
    {loading && <p role="status">Loading your account…</p>}
    {error && <div className="account-feedback" role="alert">{error}{!original && !loading && <button type="button" className="btn-open" onClick={() => setAttempt(n => n + 1)}>Try again</button>}</div>}
    {notice && <p className="account-feedback" role="status">{notice}</p>}
    <form className="account-card" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="account-section-title"><h2>Profile</h2><p>Your name and studio details.</p></div>
      <fieldset disabled={loading || !!busy || !original}>
        <div className="account-columns">
          <label>Display name<input autoComplete="name" value={profile.displayName} maxLength={80} required onChange={event => edit('displayName', event.target.value)} /></label>
          <label>Studio name <span className="optional">(optional)</span><input autoComplete="organization" value={profile.studioName} maxLength={120} onChange={event => edit('studioName', event.target.value)} /></label>
        </div>
        <label>Website <span className="optional">(optional)</span><input type="url" placeholder="https://your-studio.com" autoComplete="url" maxLength={300} value={profile.website} onChange={event => edit('website', event.target.value)} /></label>
        <label>About you <span className="optional">(optional)</span><textarea rows={3} maxLength={500} value={profile.bio} onChange={event => edit('bio', event.target.value)} aria-describedby="account-bio-count" /><span id="account-bio-count" className="account-count">{profile.bio.length}/500 characters</span></label>
        <div className="account-actions"><button type="submit" className="btn-create" disabled={!dirty}>{busy === 'profile' ? 'Saving…' : 'Save changes'}</button><button type="button" className="btn-open" disabled={!dirty} onClick={() => { if (original) setProfile(original); setError(''); setNotice('Changes discarded.'); }}>Discard changes</button><span className="settings-hint">{dirty ? 'You have unsaved changes' : 'Up to date'}</span></div>
      </fieldset>
    </form>
    <section className="account-card" aria-labelledby="appearance-title"><div className="account-section-title"><h2 id="appearance-title">Appearance</h2><p>Choose how Smart Ink looks on this browser. Changes apply immediately.</p></div><div className="account-theme-options" role="group" aria-label="Color theme">{(['dark', 'light', 'system'] as Appearance[]).map(mode => <button type="button" className="btn-open" key={mode} aria-pressed={appearance === mode} disabled={!!busy} onClick={() => { try { setAppearance(mode); updateAppearance(mode); setNotice('Appearance saved for this browser.'); setError(''); } catch (err) { setError(message(err)); } }}>{mode === 'system' ? 'Use device setting' : `${mode[0].toUpperCase()}${mode.slice(1)}`}</button>)}</div></section>
    <section className="account-card" aria-labelledby="security-title"><div className="account-section-title"><h2 id="security-title">Sign-in & security</h2><p>Keep access to your account secure.</p></div><label>Email address<input type="email" value={session.email} readOnly aria-describedby="account-email-note" /></label><p id="account-email-note" className="settings-hint">Your beta invitation is linked to this email. Email changes are not available during the beta.</p><p className="settings-hint">Sign-in method: {session.method === 'google' ? 'Google. Manage your Google password through your Google account.' : 'Email. You can continue signing in with an emailed code.'}</p>
      {hosted && session.method === 'email' && <form className="account-password-form" onSubmit={event => { event.preventDefault(); void run('password', async () => {
        if (password !== confirmation) throw new Error('Your passwords do not match.');
        await updateAccountPassword(session, password); setPassword(''); setConfirmation(''); setNotice('Your password has been updated.');
      }); }}><fieldset disabled={!!busy || loading || !original}><label>New password<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} aria-describedby="account-password-note" /></label><p id="account-password-note" className="settings-hint">Use at least 12 characters. A long, unique passphrase works well.</p><label>Confirm new password<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><div className="account-actions"><button className="btn-create" type="submit" disabled={!password || !confirmation}>{busy === 'password' ? 'Updating…' : 'Set password'}</button><button type="button" className="btn-open" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide passwords' : 'Show passwords'}</button></div></fieldset></form>}
    </section>
    <section className="account-card" aria-labelledby="data-title"><div className="account-section-title"><h2 id="data-title">Your data</h2><p>Download a copy of your saved profile and sign-in details. Projects, artwork and renders are not included; export those from your workspace.</p></div><button type="button" className="btn-open" disabled={loading || !!busy || !original} onClick={downloadProfile}>{busy === 'export' ? 'Preparing download…' : 'Download profile'}</button></section>
    <section className="account-card" aria-labelledby="session-title"><div className="account-section-title"><h2 id="session-title">Sessions</h2><p>Sign out when you’re finished, especially on a shared device.</p></div>{(dirty || password || confirmation) && <p className="settings-hint">Save or discard your profile edits and clear password fields before signing out.</p>}<div className="account-actions"><button type="button" className="btn-open" disabled={!!busy || dirty || !!password || !!confirmation} onClick={() => void signOut()}>{busy === 'signout' ? 'Signing out…' : 'Sign out'}</button>{hosted && <button type="button" className="btn-open" disabled={!!busy || dirty || !!password || !!confirmation} onClick={() => setConfirmSignOut(true)}>Sign out everywhere</button>}</div>{confirmSignOut && <div className="account-confirm"><p>Sign out on all devices, including this one? Other devices may stay active until their current access token expires.</p><div className="account-actions"><button type="button" className="btn-create" disabled={!!busy} onClick={() => void signOut(true)}>Confirm sign out</button><button type="button" className="btn-open" disabled={!!busy} onClick={() => setConfirmSignOut(false)}>Cancel</button></div></div>}</section>
  </section>;
}
