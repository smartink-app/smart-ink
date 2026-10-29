import { ShareCreation } from '../beta-creations/Creations';
import { authMode } from '../auth/backend';
import { deliverFeedback } from './delivery';
import DeliveryStatus from './DeliveryStatus';
import GoogleSyncStatus from './GoogleSyncStatus';
import JourneyReview from './JourneyReview';
import { useEffect, useRef, useState } from 'react';
import FocusDialog from '../FocusDialog';
import { clearCommentDraft, readCommentDraft, saveCommentDraft, type CommentDraft } from './store';
import './beta-feedback.css';

export default function BetaFeedback({ tester, owner }: { tester: string; owner?: string }) {
  const [sharing,setSharing] = useState(false);
  const [mode, setMode] = useState<'closed' | 'comment' | 'review' | 'pick' | 'done' | 'journey'>('closed');
  const [loaded] = useState(() => { try { return readCommentDraft(tester); } catch { return undefined; } });
  const hosted = authMode() === 'supabase';
  const [busy, setBusy] = useState(false);
  const submissionId = useRef(loaded?.submissionId || crypto.randomUUID());
  const [message, setMessage] = useState(loaded?.message || ''), [expected, setExpected] = useState(loaded?.expected || '');
  const [goal, setGoal] = useState(loaded?.goal || ''), [progress, setProgress] = useState(loaded?.progress || '');
  const [target, setTarget] = useState(loaded?.target || ''), [screen, setScreen] = useState(loaded?.screen || '');
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const start = (next: 'comment' | 'review') => {
    if (!message && !expected) setScreen(document.querySelector('.studio-rail [aria-current="page"]')?.textContent?.trim() || 'Workspace');
    setMode(next); setError('');
  };
  const keepDraft = (changes: Partial<CommentDraft> = {}) => {
    try { saveCommentDraft(tester, { submissionId: submissionId.current, message, expected, goal, progress, target, screen, ...changes }); setError(''); return true; }
    catch { setError('Draft could not be saved. Keep this window open and try again.'); return false; }
  };
  const close = () => {
    if (busy) return;
    if (!keepDraft()) return;
    setMode('closed'); trigger.current?.focus();
  };
  useEffect(() => {
    if (mode !== 'pick') return;
    let highlighted: HTMLElement | null = null;
    const clear = () => { highlighted?.classList.remove('bf-highlight'); highlighted = null; };
    const choose = (event: Event) => {
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest('[data-beta-feedback]')) return;
      clear();
      highlighted = el?.closest<HTMLElement>('button, a, input, select, textarea, canvas, [data-feedback-target], h1, h2') ?? null;
      highlighted?.classList.add('bf-highlight');
    };
    const stopAction = (event: Event) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-beta-feedback]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    const pick = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-beta-feedback]')) return;
      choose(event); stopAction(event);
      if (!highlighted) return;
      const label = highlighted.getAttribute('data-feedback-target') || highlighted.getAttribute('aria-label') || highlighted.getAttribute('title') || (['INPUT','TEXTAREA'].includes(highlighted.tagName) ? 'Text field' : highlighted.tagName === 'CANVAS' ? '3D preview' : highlighted.textContent?.trim()) || 'Interface element';
      setTarget(label.slice(0, 100)); try { saveCommentDraft(tester, { submissionId: submissionId.current, message, expected, goal, progress, target: label.slice(0, 100), screen }); setError(''); } catch { setError('Could not save your selected element.'); } clear(); setMode('comment');
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setMode('comment'); } };
    document.addEventListener('pointerover', choose, true);
    document.addEventListener('pointerdown', stopAction, true);
    document.addEventListener('click', pick, true);
    document.addEventListener('keydown', escape, true);
    return () => { clear(); document.removeEventListener('pointerover', choose, true); document.removeEventListener('pointerdown', stopAction, true); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', escape, true); };
  }, [mode, tester, message, expected, goal, progress, screen]);
  const submit = async () => {
    if (busy || !keepDraft()) return;
    setBusy(true);
    try {
      await deliverFeedback(owner, { id: submissionId.current, tester, createdAt: new Date().toISOString(), kind: mode === 'review' ? 'review' : 'comment', screen, target: mode === 'review' ? '' : target, message: message.trim(), expected: expected.trim(), goal: goal.trim(), progress: progress.trim(), version: 'beta-feedback v2', status: 'new', notes: '' });
      try { clearCommentDraft(tester); } catch { /* A confirmed report remains confirmed even if local cleanup fails. */ }
      submissionId.current = crypto.randomUUID();
      setMode('done'); setMessage(''); setExpected(''); setGoal(''); setProgress(''); setTarget(''); setError('');
    } catch { setError('Delivery is not confirmed. Your draft is still here; retry to send the same submission.'); } finally { setBusy(false); }
  };
  return <div data-beta-feedback>{hosted && owner ? <DeliveryStatus owner={owner} /> : <GoogleSyncStatus quiet />}
    {sharing && <ShareCreation owner={owner || tester} onClose={()=>setSharing(false)} />}
    <div className="bf-launch"><button onClick={()=>setSharing(true)}>Share a creation</button><button ref={trigger} onClick={() => start('comment')}>Give feedback</button><button onClick={() => setMode('journey')}>Review my experience</button></div>
    {mode === 'journey' && <JourneyReview tester={tester} owner={owner} onClose={() => { setMode('closed'); trigger.current?.focus(); }} />}
    {mode === 'pick' && <div className="bf-pick" role="status" data-beta-feedback><strong>Select something to comment on</strong><span>Click or tap a control. Keyboard users can cancel and describe it in a general comment.</span><button onClick={() => setMode('comment')}>Cancel selection</button></div>}
    {(mode === 'comment' || mode === 'review') && <FocusDialog title={mode === 'review' ? 'Your experience' : 'Give feedback'} onClose={close}>
      <form className="bf-form" data-beta-feedback onSubmit={e => { e.preventDefault(); void submit(); }}><fieldset disabled={busy} style={{border:0,padding:0,margin:0,display:'contents'}}>
        <p className="bf-muted">{hosted ? 'Drafts stay on this device. Submitted feedback is sent to the Smart Ink team. If delivery fails, queued submissions retry when you reconnect or press Retry delivery.' : 'Drafts save in this browser. Submitted comments appear in the local inbox and sync to Google when connected.'}</p>
        {mode === 'review' ? <><label>What were you trying to do?<textarea required maxLength={2000} value={goal} onChange={e => { setGoal(e.target.value); keepDraft({ goal: e.target.value }); }} /></label><label>How far did you get?<textarea required maxLength={2000} value={progress} onChange={e => { setProgress(e.target.value); keepDraft({ progress: e.target.value }); }} /></label></> : <div className="bf-target"><span>{target ? `About: ${target}` : `General feedback · ${screen}`}</span><button type="button" onClick={() => setMode('pick')}>{target ? 'Choose another element' : 'Point to something'}</button>{target && <button type="button" onClick={() => { setTarget(''); keepDraft({ target: '' }); }}>Remove selection</button>}</div>}
        <label>{mode === 'review' ? 'What, if anything, surprised you? (optional)' : 'What happened, or what would you like us to know?'}<textarea required={mode === 'comment'} maxLength={4000} value={message} onChange={e => { setMessage(e.target.value); keepDraft({ message: e.target.value }); }} /></label>
        {mode === 'comment' && <label>What did you expect? (optional)<textarea maxLength={2000} value={expected} onChange={e => { setExpected(e.target.value); keepDraft({ expected: e.target.value }); }} /></label>}
        <p className="bf-muted">Includes your account, screen, selected control, time and app version. No screenshots, artwork or field contents are collected automatically.</p>
        {error && <p role="alert">{error}</p>}<footer><button type="button" onClick={close}>Keep draft & close</button><button className="bf-primary" disabled={mode === 'comment' ? !message.trim() : !goal.trim() || !progress.trim()}>{busy ? 'Sending…' : hosted ? 'Send feedback' : 'Save feedback locally'}</button></footer></fieldset>
      </form>
    </FocusDialog>}
    {mode === 'done' && <FocusDialog title="Thank you for the feedback" onClose={() => setMode('closed')}><div className="bf-form" data-beta-feedback><p>{hosted ? 'Your feedback has been received by Smart Ink.' : 'Your feedback is saved in this browser’s Beta feedback inbox.'}</p><p className="bf-muted">You can keep exploring or add a comment about a specific part of the interface.</p><footer><button onClick={() => start('comment')}>Add another comment</button><button className="bf-primary" onClick={() => setMode('closed')}>Back to exploring</button></footer></div></FocusDialog>}
  </div>;
}
