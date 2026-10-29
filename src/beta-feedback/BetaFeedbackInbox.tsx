import { authMode } from '../auth/backend';
import { readFeedbackInbox, saveTriage } from './delivery';
import GoogleSyncStatus from './GoogleSyncStatus';
import { useEffect, useState } from 'react';
import { isTestReport, type Report, type ReviewSession } from './store';
import './beta-feedback.css';

export default function BetaFeedbackInbox({ initialTester = 'all' }: { initialTester?: string }) {
  const hosted = authMode() === 'supabase';
  const [data, setData] = useState({reports:[] as Report[],sessions:[] as ReviewSession[],error:''});
  const [loading,setLoading] = useState(true), [revision,setRevision] = useState(0);
  useEffect(()=>{let cancelled=false;setLoading(true);readFeedbackInbox().then(value=>{if(!cancelled)setData({...value,error:''});}).catch(e=>{if(!cancelled)setData(old=>({...old,error:String(e)}));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[revision]);
  const [view, setView] = useState<'reports' | 'sessions'>('reports');
  const [tester, setTester] = useState(initialTester), [step, setStep] = useState('all'), [dataset, setDataset] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [filter, setFilter] = useState('all'), [query, setQuery] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const refresh = () => setRevision(r=>r+1);
  const matching = data.reports.filter(r => (tester === 'all' || r.tester.trim().toLowerCase() === tester.trim().toLowerCase()) && (step === 'all' || r.screen === step) && (dataset === 'all' || isTestReport(r) === (dataset === 'test')) && (sessionFilter === 'all' || r.sessionId === sessionFilter) && [r.message,r.target,r.tester,r.screen,r.goal,r.progress].join(' ').toLowerCase().includes(query.toLowerCase()));
  const shown = matching.filter(r => filter === 'all' || r.status === filter);
  const sessions = data.sessions.filter(s => (tester === 'all' || s.tester.trim().toLowerCase() === tester.trim().toLowerCase()) && (dataset === 'all' || s.isTest === (dataset === 'test')));
  const testers = [...new Set([...(initialTester === 'all' ? [] : [initialTester]),...data.reports.map(r => r.tester), ...data.sessions.map(s => s.tester)])];
  const report = data.reports.find(r => r.id === selected);
  return <section className="bf-inbox" aria-label="Beta feedback inbox">
    <div className="bf-inbox-heading"><div><h2>Beta feedback</h2><p className="bf-muted">Listen first. Keep the original words alongside your next action.</p></div><button onClick={refresh}>Refresh feedback</button></div>
    <p className="beta-admin-note">{hosted ? 'Shared inbox · Confirmed submissions from beta testers. Internal notes are visible only to operators.' : 'Local prototype · Reports from this browser only. Automatic export runs while the feedback page or studio is open.'}</p>
    {!hosted && <GoogleSyncStatus />}{loading && <p role="status">Loading feedback…</p>}<nav className="bf-admin-tabs" aria-label="Feedback views"><button aria-pressed={view === 'reports'} onClick={() => setView('reports')}>Comments</button><button aria-pressed={view === 'sessions'} onClick={() => setView('sessions')}>Review sessions</button></nav>
    <div className="bf-tools"><select aria-label="Filter by tester" value={tester} onChange={e => { setTester(e.target.value); setSelected(null); }}><option value="all">All testers</option>{testers.map(t => <option key={t}>{t}</option>)}</select><select aria-label="Feedback data type" value={dataset} onChange={e => { setDataset(e.target.value); setSelected(null); }}><option value="all">All data</option><option value="real">Tester feedback</option><option value="test">Test data only</option></select></div>
    {view === 'sessions' ? <><p className="bf-muted">{sessions.length} review sessions · Unsubmitted draft text stays private.</p>{sessions.length === 0 && <div className="bf-empty">No matching sessions yet. Reviews started before session tracking was added remain in Comments.</div>}{sessions.map(session => <article className="bf-session" key={session.id}><header><div><h3>{session.tester} {session.isTest && <small>Test data</small>}</h3><p className="bf-muted">{session.status.replace('-', ' ')} · Updated {new Date(session.updatedAt).toLocaleString()}</p></div><button onClick={() => { setSessionFilter(session.id); setView('reports'); setStep('all'); setQuery(''); setFilter('all'); setSelected(null); }}>View submitted comments</button></header><ol>{session.steps.map(item => <li key={item.id}><span>{item.title}</span><span>{item.outcome.replaceAll('-', ' ')}{item.hasDraft && ' · private draft'}</span></li>)}</ol></article>)}</> : <>
    <div className="bf-counts">{(['new','investigating','resolved'] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}><strong>{matching.filter(r => r.status === status).length}</strong><span>{status}</span></button>)}</div>
    <div className="bf-tools"><select aria-label="Filter by review step" value={step} onChange={e => { setStep(e.target.value); setSelected(null); }}><option value="all">All steps</option>{[...new Set(data.reports.map(r => r.screen))].map(s => <option key={s}>{s}</option>)}</select><input aria-label="Search feedback" type="search" placeholder="Search comments, screens or testers…" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} /><select aria-label="Feedback status filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All feedback</option><option value="new">New</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select></div>
    <p className="bf-muted">{shown.length} of {data.reports.length} reports · Counts above follow your search and tester/step filters.{sessionFilter !== 'all' && <button onClick={() => setSessionFilter('all')}>Clear session filter</button>}</p>
    {data.error && <p role="alert">{data.error}</p>}
    <div className="bf-columns"><div className="bf-reports">{shown.map(r => <button key={r.id} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}><span className="bf-muted">{isTestReport(r) && 'Test data · '}{r.kind === 'journey' ? `Journey · ${r.screen}` : r.kind === 'review' ? 'Session reflection' : r.target || 'General comment'} · {r.status}</span><strong>{r.message || r.goal}</strong><span className="bf-muted">{r.screen} · {r.tester}</span></button>)}{!shown.length && <div className="bf-empty"><h3>{data.reports.length ? 'No matching feedback' : 'Ready to hear from testers'}</h3><p>{data.reports.length ? 'Try another search or status.' : 'Use Give feedback in the studio. Reports will appear here.'}</p></div>}</div>
    {report && shown.some(r => r.id === report.id) ? <ReportDetail key={report.id} report={report} onSaved={refresh} /> : <div className="bf-empty"><h3>Every comment has context</h3><p>Select a report to read it, set its status and keep internal notes.</p></div>}</div>
    </>}
    {view === 'sessions' && data.error && <p role="alert">{data.error}</p>}
  </section>;
}
function ReportDetail({ report, onSaved }: { report: Report; onSaved: () => void }) {
  const [busy,setBusy] = useState(false);
  const [status, setStatus] = useState(report.status), [notes, setNotes] = useState(report.notes), [notice, setNotice] = useState('');
  return <article className="bf-detail"><p className="bf-muted">{report.kind === 'journey' ? `Journey review · ${report.progress}` : report.kind === 'review' ? 'Session reflection' : 'Interface feedback'}</p><h3>{report.target || report.screen}</h3><p className="bf-muted">{report.tester} · {new Date(report.createdAt).toLocaleString()}</p>
    {report.goal && <><h4>Trying to do</h4><p className="bf-verbatim">{report.goal}</p></>}{report.progress && <><h4>{report.kind === 'journey' ? 'Review step' : 'How far they got'}</h4><p className="bf-verbatim">{report.progress}</p></>}{report.message && <><h4>Original comment</h4><p className="bf-verbatim">{report.message}</p></>}{report.expected && <><h4>Expected</h4><p className="bf-verbatim">{report.expected}</p></>}
    <p className="bf-muted">{report.screen} · {report.version}</p>
    <form className="bf-form" onSubmit={async e => { e.preventDefault(); if(busy)return;setBusy(true); try { await saveTriage(report.id, status, notes); onSaved(); setNotice('Changes saved.'); } catch (error) { setNotice(String(error)); } finally { setBusy(false); } }}><label>Report status<select value={status} onChange={e => setStatus(e.target.value as Report['status'])}><option value="new">New</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select></label><label>Internal notes<textarea maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Next action, reproduction steps, or a decision…" /></label><button className="bf-primary" disabled={busy}>{busy ? 'Saving…' : 'Save report changes'}</button><p role="status">{notice}</p></form>
  </article>;
}
