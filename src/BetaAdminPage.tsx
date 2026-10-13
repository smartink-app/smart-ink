import { useEffect, useState, type FormEvent } from 'react';
import {
  approveWaitlistEntry,
  createInvite,
  inviteUrl,
  revokeAccess,
  sendInviteEmail,
  type AuthMode,
} from './auth/betaAuthService';
import type { BetaSession, Invite, WaitlistEntry } from './auth/types';

export interface BetaAdminPageProps {
  mode: AuthMode;
  session: BetaSession | null;
  /** Operator access granted: profiles.is_admin on Supabase, passphrase in the demo. */
  unlocked: boolean;
  waitlist: WaitlistEntry[];
  invites: Invite[];
  activeEmails: string[];
  loadError: string | null;
  onUnlock: (passphrase: string) => Promise<void>;
  onLock: () => void;
  onRefresh: () => Promise<void>;
  onBack: () => void;
  onGoLogin: () => void;
  onSignOut: () => void;
}

export default function BetaAdminPage({
  mode,
  session,
  unlocked,
  waitlist,
  invites,
  activeEmails,
  loadError,
  onUnlock,
  onLock,
  onRefresh,
  onBack,
  onGoLogin,
  onSignOut,
}: BetaAdminPageProps) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<'waitlisted' | 'invited' | 'active' | 'revoked' | 'invites'>('waitlisted');
  const [inviteFilter, setInviteFilter] = useState('all');
  const [note, setNote] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (unlocked) void onRefresh();
  }, [unlocked, onRefresh]);

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onUnlock(passphrase);
      setPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock.');
    }
  };

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  /** Shared tail of approve and mint: copy the link, try to email it, report. */
  const deliver = async (invite: Invite, created: string) => {
    const link = inviteUrl(invite.code);
    setLastLink(link);
    const copied = await copy(link);
    let text = `${created}${copied ? ' Link copied.' : ''}`;
    if (invite.email) {
      try {
        const result = await sendInviteEmail(invite.code);
        text += result.sent ? ` Emailed to ${invite.email}.` : ` Not emailed: ${result.reason ?? 'Use the invitation link or retry from Invite links.'}`;
      } catch {
        text += ' Invitation saved, but email delivery failed. Retry from Invite links.';
      }
    }
    setMessage(text);
    await onRefresh();
  };

  const handleApprove = async (entry: WaitlistEntry) => {
    setError(null);
    setMessage(null);
    setBusy(entry.id);
    try {
      const invite = await approveWaitlistEntry(entry.id);
      await deliver(invite, `Invite created for ${entry.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleCreateInvite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy('mint');
    try {
      const invite = await createInvite({
        email: manualEmail.trim() ? manualEmail : null,
        note: note.trim() || 'Manual invite',
      });
      setManualEmail('');
      setNote('');
      await deliver(invite, invite.email ? `Invite created for ${invite.email}.` : 'Open invite created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invite.');
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async (entry: WaitlistEntry) => {
    if (!window.confirm(`Revoke beta access for ${entry.email}? They will lose beta access when access is next checked.`)) {
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(entry.id);
    try {
      await revokeAccess(entry.id);
      setMessage(`Access revoked for ${entry.email}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke access.');
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    setBusy('refresh'); setError(null);
    try { await onRefresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not refresh.'); }
    finally { setBusy(null); }
  };

  const handleResend = async (invite: Invite) => {
    setBusy(invite.code); setError(null); setMessage(null);
    try {
      const result = await sendInviteEmail(invite.code);
      if (!result.sent) throw new Error(result.reason || 'Email could not be sent. You can copy the link instead.');
      setMessage(`Invitation sent to ${invite.email}.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send invitation.'); }
    finally { setBusy(null); }
  };

  const handleCopyLink = async (code: string) => {
    const link = inviteUrl(code);
    setMessage((await copy(link)) ? 'Link copied.' : link);
  };

  if (!unlocked) {
    return (
      <div className="beta-gate-page">
        <div className="beta-gate-card">
          <button type="button" className="beta-link-btn" onClick={onBack}>
            ← Back
          </button>
          <p className="beta-eyebrow">Operator</p>
          <h1>Beta console</h1>

          {mode === 'demo' && (
            <>
              <p className="beta-lead">
                Local demo backend. Everything here lives in this browser only. Enter the operator
                passphrase, or sign in as <code className="beta-code">admin</code> on the login page.
              </p>
              <form className="beta-form" onSubmit={handleUnlock}>
                <input
                  className="login-input"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Operator passphrase"
                  autoComplete="current-password"
                />
                {error && <p className="beta-error">{error}</p>}
                <button type="submit" className="btn-cta" style={{ width: '100%' }}>
                  Unlock
                </button>
              </form>
            </>
          )}

          {mode === 'supabase' && !session && (
            <>
              <p className="beta-lead">Sign in with your operator account to continue.</p>
              <button type="button" className="btn-cta" style={{ width: '100%' }} onClick={onGoLogin}>
                Log in
              </button>
            </>
          )}

          {mode === 'supabase' && session && (
            <>
              <p className="beta-lead">
                <strong>{session.email}</strong> is signed in but is not an operator. Promote it
                once in the Supabase SQL editor:
              </p>
              <pre className="beta-code-block">
                {`update public.profiles set is_admin = true where email = '${session.email}';`}
              </pre>
              <p className="beta-muted">Then reload this page.</p>
              <button type="button" className="btn-login" onClick={onSignOut}>
                Sign out
              </button>
            </>
          )}

          {mode === 'unconfigured' && (
            <p className="beta-lead">
              The hosted backend isn’t configured on this deployment. See docs/supabase-setup.md.
            </p>
          )}
        </div>
      </div>
    );
  }

  const matches = (...values: (string | null | undefined)[]) => values.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const counts = {
    waitlisted: waitlist.filter(w => w.status === 'waitlisted').length,
    invited: waitlist.filter(w => w.status === 'invited').length,
    active: new Set([...waitlist.filter(w => w.status === 'active').map(w => w.email), ...activeEmails]).size,
    revoked: waitlist.filter(w => w.status === 'revoked').length,
    invites: invites.length,
  };
  const people = waitlist.filter(w => w.status === section && matches(w.email, w.source)).sort((a,b) => b.createdAt - a.createdAt);
  const extraActive = section === 'active' ? activeEmails.filter(email => !waitlist.some(w => w.status === 'active' && w.email === email) && matches(email)) : [];
  const inviteStatus = (invite: Invite) => invite.redeemedAt ? 'used' : invite.expiresAt < Date.now() ? 'expired' : 'open';
  const shownInvites = invites.filter(i => matches(i.email, i.code, i.note, i.redeemedByEmail) && (inviteFilter === 'all' || inviteStatus(i) === inviteFilter)).sort((a,b) => b.createdAt - a.createdAt);

  return <div className="beta-admin-page">
    <header className="beta-admin-header">
      <div><p className="beta-eyebrow">Beta management</p><h1>Beta console</h1><p className="beta-muted">Review requests, invite artists, and manage access.</p></div>
      <div className="beta-admin-actions">
        <button className="btn-login" onClick={onBack}>Back to studio</button>
        <button className="btn-login" disabled={busy !== null} onClick={() => void handleRefresh()}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn-login" onClick={mode === 'demo' ? onLock : onSignOut}>{mode === 'demo' ? 'Lock' : 'Sign out'}</button>
      </div>
    </header>
    <p className="beta-admin-note">{mode === 'demo' ? 'Local preview · Changes stay in this browser. No real invitation emails are sent.' : `Hosted beta · Signed in as ${session?.email ?? 'operator'}`}</p>
    <div className="admin-summary">
      {(['waitlisted','invited','active','revoked'] as const).map(status => <button key={status} aria-pressed={section === status} onClick={() => setSection(status)}><strong>{counts[status]}</strong><span>{status === 'waitlisted' ? 'Awaiting review' : status === 'invited' ? 'Invited' : status === 'active' ? 'Active access' : 'Revoked'}</span></button>)}
    </div>
    {message && <div className="beta-banner" role="status">{message}</div>}
    {(error || loadError) && <div className="beta-banner beta-banner--error" role="alert">{error || loadError}</div>}
    {lastLink && <div className="beta-banner admin-last-link"><span>Latest invitation</span><input aria-label="Latest invitation link" value={lastLink} readOnly onFocus={e => e.target.select()} /><button className="btn-login" onClick={() => void copy(lastLink).then(ok => setMessage(ok ? 'Link copied.' : 'Select and copy the link manually.'))}>Copy link</button></div>}

    <details className="beta-admin-section admin-create">
      <summary>Create an invitation</summary>
      <p className="beta-muted">Enter an email to reserve and send the invitation. Leave it blank for a single-use link you can share yourself.</p>
      <form className="beta-admin-inline-form" onSubmit={handleCreateInvite}>
        <input className="login-input" aria-label="Invitation email" type="email" placeholder="Email address (optional)" value={manualEmail} onChange={e => setManualEmail(e.target.value)} />
        <input className="login-input" aria-label="Invitation note" maxLength={200} placeholder="Internal note (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn-getstarted" disabled={busy !== null}>{busy === 'mint' ? 'Creating…' : manualEmail.trim() ? 'Create & send invite' : 'Create invite link'}</button>
      </form>
    </details>

    <section className="beta-admin-section">
      <div className="admin-list-tools">
        <nav aria-label="Beta records" className="admin-record-tabs">{(['waitlisted','invited','active','revoked','invites'] as const).map(status => <button key={status} aria-pressed={section === status} onClick={() => setSection(status)}>{status === 'waitlisted' ? 'Requests' : status === 'invites' ? 'Invite links' : status[0].toUpperCase()+status.slice(1)} <span>{counts[status]}</span></button>)}</nav>
        <input type="search" className="login-input" aria-label="Search beta records" placeholder="Search email, source or invite…" value={query} onChange={e => setQuery(e.target.value)} />
        {section === 'invites' && <select aria-label="Invitation status" value={inviteFilter} onChange={e => setInviteFilter(e.target.value)}><option value="all">All invitations</option><option value="open">Open</option><option value="used">Used</option><option value="expired">Expired</option></select>}
      </div>
      <p className="beta-muted">{section === 'invites' ? shownInvites.length : people.length + extraActive.length} results{query && <> for “{query}” <button className="beta-link-btn" onClick={() => setQuery('')}>Clear search</button></>}</p>
      {section === 'invites' ? <ul className="beta-admin-list">{shownInvites.map(invite => <li key={invite.code}>
        <div><strong>{invite.email || 'Shareable invitation'}</strong><span className="admin-status">{inviteStatus(invite)}</span><p className="beta-muted"><code>{invite.code}</code> · {invite.redeemedAt ? `Redeemed ${new Date(invite.redeemedAt).toLocaleDateString()}` : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}</p>{invite.note && <p className="beta-muted">{invite.note}</p>}</div>
        {inviteStatus(invite) === 'open' && <div className="beta-admin-actions"><button className="btn-login" onClick={() => void handleCopyLink(invite.code)}>Copy link</button>{invite.email && <button className="btn-login" disabled={busy !== null} onClick={() => void handleResend(invite)}>{busy === invite.code ? 'Sending…' : 'Resend email'}</button>}</div>}
      </li>)}</ul> : <ul className="beta-admin-list">{people.map(entry => <li key={entry.id}>
        <div><strong>{entry.email}</strong><p className="beta-muted">Requested {new Date(entry.createdAt).toLocaleDateString()}{entry.source ? ` · ${entry.source}` : ''}</p>{entry.activatedAt && <p className="beta-muted">Activated {new Date(entry.activatedAt).toLocaleDateString()}</p>}</div>
        {section === 'waitlisted' && <button className="btn-getstarted" disabled={busy !== null} onClick={() => void handleApprove(entry)}>{busy === entry.id ? 'Approving…' : 'Approve & invite'}</button>}
        {section === 'invited' && <button className="btn-login" onClick={() => { setQuery(entry.email); setSection('invites'); setInviteFilter('all'); }}>View invitations</button>}
        {section === 'active' && <button className="btn-login" disabled={busy !== null || entry.email === session?.email} title={entry.email === session?.email ? 'You cannot revoke your own access here' : undefined} onClick={() => void handleRevoke(entry)}>{busy === entry.id ? 'Revoking…' : 'Revoke access'}</button>}
      </li>)}{extraActive.map(email => <li key={email}><strong>{email}</strong><span className="beta-muted">Active account</span></li>)}</ul>}
      {(section === 'invites' ? shownInvites.length === 0 : people.length + extraActive.length === 0) && <div className="admin-empty"><h3>{query ? 'No matching records' : 'Nothing here yet'}</h3><p className="beta-muted">{query ? 'Try another email or clear your search.' : 'New records will appear here as people move through the beta.'}</p></div>}
    </section>
  </div>;
}
