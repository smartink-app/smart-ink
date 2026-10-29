import { authMode } from '../auth/backend';
import { deliverFeedback } from './delivery';
import type { ReviewSession } from './store';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiArrowLeft, FiArrowRight, FiCheck, FiX, FiImage, FiPlus, FiSave, FiSliders, FiCamera } from 'react-icons/fi';
import LandingPage from '../LandingPage';
import LoginPage from '../LoginPage';
import { persistReview, readReviewDraft, type ReviewDraft, type Report } from './store';
import './journey-review.css';

const REVIEW_STEPS = [
  { id: 'front-page', title: 'Front page', caption: 'Your first impression of Smart Ink', area: 'The introduction and request-access area' },
  { id: 'sign-in', title: 'Registration & login', caption: 'Getting access to your workspace', area: 'The sign-in screen' },
  { id: 'projects', title: 'Your projects', caption: 'Arriving in your workspace', area: 'The project overview' },
  { id: 'create-project', title: 'Creating a project', caption: 'Starting something new', area: 'The new-project choices' },
  { id: 'artwork', title: 'Adding artwork', caption: 'Bringing your design into Smart Ink', area: 'The artwork panel' },
  { id: 'placement', title: 'Placement', caption: 'Working with the design on the body', area: 'The body preview and placement controls' },
  { id: 'saving', title: 'Saving', caption: 'Keeping your work', area: 'The project save control' },
  { id: 'rendering', title: 'Rendering', caption: 'Creating an image of your design', area: 'The shot and render controls' },
] as const;
const noop = () => {};

export default function JourneyReview({ tester, owner, onClose }: { tester: string; owner?: string; onClose: () => void }) {
  const [loaded] = useState(() => {
    try { return { draft: readReviewDraft(tester), error: '' }; }
    catch { return { draft: undefined, error: 'Stored feedback could not be read. Your existing data has been preserved.' }; }
  });
  const [draft, setDraft] = useState<ReviewDraft>(() => loaded.draft ?? {
    id: crypto.randomUUID(), tester, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    index: 0, answers: REVIEW_STEPS.map(() => ({ text: '', saved: '' })), steps: REVIEW_STEPS.map(({id,title}) => ({id,title})), isTest: false,
  });
  const hosted = authMode() === 'supabase';
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState(loaded.error);
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const { index, answers, id: sessionId } = draft;
  const step = REVIEW_STEPS[index], answer = answers[index];
  const unsaved = answers.some(a => a.text.trim() !== a.saved);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  useEffect(() => { heading.current?.focus(); }, [index, finished]);
  const commit = (next: ReviewDraft, status: 'in-progress' | 'paused' | 'completed' = 'in-progress', report?: Report) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setDraft(updated);
    try { persistReview(updated, status, report); setError(''); return true; }
    catch { setError('Could not save in this browser. Keep this review open and retry; your latest changes are only in memory.'); return false; }
  };
  const move = (nextIndex: number) => { if (commit({ ...draft, index: nextIndex })) setFinished(false); };
  const sync = async (next: ReviewDraft, status: ReviewSession['status'], report?: Report) => {
    if (!hosted) return;
    await deliverFeedback(owner, report, { id: next.id, tester, startedAt: next.startedAt, updatedAt: new Date().toISOString(), isTest: next.isTest, status,
      steps: next.steps.map((s,i)=>({...s,outcome:next.answers[i]?.saved ? 'commented' : next.answers[i]?.disposition || 'not-reviewed',hasDraft:next.answers[i]?.text.trim() !== next.answers[i]?.saved})) });
  };
  const close = async () => {
    if (busy) return;
    const status = finished && !unsaved ? 'completed' : 'paused';
    setBusy(true);
    try { await sync(draft,status); if (commit(draft,status)) onClose(); }
    catch { if (commit(draft,'paused')) onClose(); else setError('Could not preserve your review. Keep it open and retry saving.'); }
    finally { setBusy(false); }
  };
  const advance = (next: ReviewDraft, report?: Report) => {
    const nextIndex = Math.min(index + 1, REVIEW_STEPS.length - 1);
    // Do not mark a response submitted unless the entire write succeeds.
    const before = draft;
    if (commit({ ...next, index: nextIndex }, 'in-progress', report)) {
      if (index === REVIEW_STEPS.length - 1) setFinished(true);
    } else setDraft(before);
  };
  const skip = (disposition: 'skipped' | 'not-tried') => {
    advance({ ...draft, answers: answers.map((a,i) => i === index ? { ...a, disposition: a.saved ? 'commented' : disposition } : a) });
  };
  const save = async () => {
    if (busy) return;
    if (!answer.text.trim()) return;
    const report: Report = { id: `${sessionId}:${step.id}`, sessionId, stepId: step.id, isTest: draft.isTest,
      tester, createdAt: new Date().toISOString(), kind: 'journey', screen: step.title, target: step.area,
      message: answer.text.trim(), expected: '', goal: '', progress: `Step ${index + 1} of ${REVIEW_STEPS.length}`,
      version: 'beta-feedback v2', status: 'new', notes: '' };
    const next: ReviewDraft = { ...draft, answers: answers.map((a,i) => i === index ? { ...a, saved: a.text.trim(), disposition: 'commented' } : a) };
    setBusy(true);
    try { await sync(next,'in-progress',report); advance(next,report); }
    catch { setError('Comment delivery is not confirmed. Retry Save & next; the same comment ID will be used.'); }
    finally { setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="jr-dialog" aria-labelledby="journey-title" data-beta-feedback onCancel={e => { e.preventDefault(); close(); }}>
    <div inert={busy}><header className="jr-header"><div><span className="jr-eyebrow">LOOKING BACK</span><h2 id="journey-title">Review my experience</h2></div><label className="jr-test-label"><input type="checkbox" checked={draft.isTest} onChange={e => commit({ ...draft, isTest: e.target.checked })} /> Test data</label><button className="jr-icon" aria-label="Close experience review" onClick={close}><FiX /></button></header>
    <div className="jr-draft-notice" role="status">{error || (loaded.draft ? 'Resumed your review. ' : '') + 'Drafts save automatically in this browser. Only submitted comments appear in the inbox.'}{error && <button onClick={() => commit(draft)}>Retry saving</button>}</div>
    {finished ? <div className="jr-finished"><span className="jr-complete"><FiCheck /></span><h3 ref={heading} tabIndex={-1}>Thanks for taking a closer look.</h3><p>{answers.filter(a => a.saved).length} {answers.filter(a => a.saved).length === 1 ? 'comment' : 'comments'} {hosted ? 'received by Smart Ink' : 'saved locally'}. You can return to any step before closing.</p><div className="jr-summary">{REVIEW_STEPS.map((s,i) => <button key={s.id} onClick={() => { move(i); }}><span>{s.title}</span><span>{answers[i].text.trim() !== answers[i].saved ? 'Private draft saved' : answers[i].saved ? 'Comment saved' : answers[i].disposition === 'not-tried' ? 'Not tried' : answers[i].disposition === 'skipped' ? 'Skipped' : 'Not reviewed'} <FiArrowRight /></span></button>)}</div>{unsaved && <p role="status">Your unfinished comments are saved privately in this browser. Submit them from their steps, or pause and resume later.</p>}<button className="jr-primary" onClick={close}>{unsaved ? 'Pause & keep drafts' : 'Complete review & return'}</button></div> : <>
      <nav className="jr-timeline" aria-label="Review steps">{REVIEW_STEPS.map((s,i) => <button key={s.id} aria-current={i === index ? 'step' : undefined} onClick={() => { move(i); }}><span>{answers[i].saved ? <FiCheck /> : String(i+1).padStart(2,'0')}</span>{s.title}</button>)}</nav>
      <div className="jr-body"><section className="jr-context" aria-label={`Context for ${step.title}`}><div className="jr-context-heading"><span>{step.caption}</span><span>Read-only reference</span></div><div className="jr-stage" key={step.id}>
        <ContextPreview step={step.id} />
        <div className="jr-context-label"><span />{step.area}</div>
      </div><p className="jr-context-note">Reference screens help you remember each step. They are not a recording of your session; your project stays untouched.</p></section>
      <aside className="jr-comment"><span className="jr-eyebrow">STEP {index+1} OF {REVIEW_STEPS.length}</span><h3 ref={heading} tabIndex={-1}>{step.title}</h3><p>Thinking back to this step, is there anything you’d like to tell us?</p><form onSubmit={e => { e.preventDefault(); save(); }}><label htmlFor="journey-comment">Your comment</label><textarea id="journey-comment" maxLength={4000} placeholder="Anything you noticed, expected, or wanted to share…" value={answer.text} onChange={e => { const text = e.target.value; commit({ ...draft, answers: answers.map((a,i) => i === index ? { ...a, text } : a) }); }} /><span className="jr-save-state">{answer.saved && answer.text.trim() === answer.saved ? 'Comment saved · you can edit it' : answer.text.trim() ? 'Draft saved privately · submit with Save & next' : 'Optional · skip if you have nothing to add'}</span>{error && <p role="alert">{error}</p>}<button className="jr-primary" disabled={!answer.text.trim()}>{index === REVIEW_STEPS.length-1 ? 'Save & finish' : 'Save & next'} <FiArrowRight /></button></form><button className="jr-skip" onClick={() => skip('skipped')}>Skip this step <FiArrowRight /></button><button className="jr-not-tried" onClick={() => skip('not-tried')}>I didn’t try this</button><div className="jr-bottom"><button disabled={index === 0} onClick={() => { move(index-1); }}><FiArrowLeft /> Back</button><button onClick={() => { if (commit(draft)) setFinished(true); }}>Finish review</button></div><p className="jr-local">{hosted ? 'Submitted comments go to Smart Ink. Draft text stays on this device.' : 'Local preview · Comments go to this browser’s Beta feedback inbox.'} Skipping is not a negative rating.</p></aside></div>
    </>}</div>
    {busy && <p role="status">Sending review…</p>}
  </dialog>, document.body);
}
function ContextPreview({ step }: { step: typeof REVIEW_STEPS[number]['id'] }) {
  if (step === 'front-page') return <div className="jr-real-screen" inert aria-hidden="true"><LandingPage onNavigateToLogin={noop} /></div>;
  if (step === 'sign-in') return <div className="jr-real-screen jr-login-screen" inert aria-hidden="true"><LoginPage onAuthenticated={noop} onBackToLanding={noop} onOpenInvite={noop} /></div>;
  return <div className="jr-example" aria-label="Illustrative screen preview"><div className="jr-example-top"><img src="/brand-droplet.svg" alt="" /><span>SMART INK</span><span>Illustrative preview</span></div><div className="jr-example-body">
    {step === 'projects' ? <><span className="jr-eyebrow">YOUR WORKSPACE</span><h3>Projects</h3><div className="jr-outline jr-project-overview"><div><span>Your ideas, together.</span><span className="jr-faux-button"><FiPlus /> New project</span></div><div className="jr-example-projects"><div><img src="/renders/presets/editorial.jpg" alt="Example tattoo project" /><span>Example project</span></div><div className="jr-empty-project"><FiPlus /><span>Start from a template</span></div></div></div></> : step === 'create-project' ? <div className="jr-outline jr-create"><span className="jr-eyebrow">A NEW IDEA</span><h3>New project</h3><span>Project name</span><div className="jr-faux-field">Untitled project</div><span>Starting point</span><div className="jr-choice"><span>Blank project</span><span>Body template</span></div><div className="jr-faux-button">Create project <FiArrowRight /></div></div> : <div className="jr-studio"><div className={`jr-viewport ${step === 'placement' ? 'jr-outline' : ''}`}><img src="/renders/hero-arm.webp" alt="Example tattoo placement on an arm" /><span className="jr-image-caption">Example image · not your project</span></div><div className={`jr-mini-panel ${step !== 'placement' ? 'jr-outline' : ''}`}>
      {step === 'artwork' ? <><FiImage /><h3>Artwork</h3><div className="jr-faux-button">Upload artwork</div><img className="jr-artwork" src="/tattoos/botanical-rose.png" alt="Example rose artwork" /></> : step === 'placement' ? <><FiSliders /><h3>Placement</h3><span>Size</span><div className="jr-faux-slider" /><span>Rotation</span><div className="jr-faux-slider" /><span>Position</span></> : step === 'saving' ? <><FiSave /><h3>Your project</h3><div className="jr-faux-field">Project name</div><div className="jr-faux-button">Save project</div></> : <><FiCamera /><h3>Shoot</h3><span>Framing & lighting</span><img className="jr-render-thumb" src="/renders/presets/detail.jpg" alt="Example detail render" /><div className="jr-faux-button">Render image</div></>}
    </div></div>}
  </div></div>;
}
