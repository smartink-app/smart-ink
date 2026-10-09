import { useRef, useEffect, useState } from 'react';
import { FiCheck, FiMapPin, FiMessageCircle, FiArrowLeft, FiCornerUpLeft } from 'react-icons/fi';
import type { ReviewController } from './useReview';
import type { FeedbackLocation } from './model';
import './feedback.css';

export function FeedbackToolbar({ review, name, onClose }: { review: ReviewController; name: string; onClose: () => void }) {
  return <header className="feedback-toolbar">
    <button className="ep-btn" type="button" onClick={onClose}><FiArrowLeft aria-hidden /> Back to editing</button>
    <div className="feedback-heading"><strong>3D feedback</strong><span>{name}</span></div>
    <div className="feedback-role" role="group" aria-label="Demo review role">
      {(['client', 'artist'] as const).map(role => <button type="button" key={role} aria-pressed={review.role === role}
        disabled={review.dirty || !!review.composer} title={review.dirty || review.composer ? 'Post or discard your draft before switching roles' : undefined}
        onClick={() => review.setRole(role)}>{role === 'client' ? 'Client view' : 'Artist view'}</button>)}
    </div>
  </header>;
}

export default function FeedbackPanel({ review: r, bodyMeshId, onView }: { review: ReviewController; bodyMeshId: string; onView: (location: FeedbackLocation) => void }) {
  const [filter, setFilter] = useState('open');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (r.composer) input.current?.focus(); }, [r.composer]);
  const selected = r.data.threads.find(t => t.id === r.selected);
  const open = r.data.threads.filter(t => !t.resolved).length;
  const threads = r.data.threads.filter(t => filter === 'all' || (filter === 'resolved' ? t.resolved : !t.resolved));
  const replyKey = `${r.role}:${selected?.id}`;
  return <aside className="feedback-panel" aria-label="3D preview feedback">
    <div className="feedback-intro">
      <div className="feedback-eyebrow"><span className="feedback-live-dot" /> Local review demo</div>
      <h2>{r.role === 'client' ? 'Make it feel right.' : 'Refine it together.'}</h2>
      <p>{r.role === 'client' ? 'Pin a thought to the skin. Your artist takes care of the changes.' : 'Review each note, discuss the details and resolve it when you’re done.'}</p>
      <div className="feedback-create">
        <button className="ep-btn ep-btn--primary" type="button" aria-pressed={r.armed} disabled={!r.ready} onClick={r.arm}><FiMapPin aria-hidden />{r.armed ? 'Cancel pin' : r.composer?.location ? 'Move pin' : 'Pin feedback'}</button>
        <button className="ep-btn" type="button" disabled={!r.ready || !!r.composer} onClick={r.general}><FiMessageCircle aria-hidden />General note</button>
      </div>
    </div>
    {r.error && <div className="feedback-error" role="alert">{r.error}<button type="button" className="ep-btn" onClick={r.reload}>Reload feedback</button></div>}
    {r.armed && <p className="feedback-instruction" role="status">Click bare skin or the tattoo to place your pin. Drag to rotate.</p>}
    {r.composer && <form className="feedback-composer" onSubmit={e => { e.preventDefault(); r.post(); }}>
      <label htmlFor="feedback-draft">{r.composer.location ? `New pin · ${r.composer.location.label}` : 'General feedback'}</label>
      <textarea ref={input} id="feedback-draft" maxLength={2000} placeholder="Could we make this a little smaller?" value={r.text} onChange={e => r.setText(e.target.value)} required />
      <div className="feedback-form-actions"><button type="button" className="ep-btn" onClick={r.cancel}>Discard draft</button><button type="submit" className="ep-btn ep-btn--primary" disabled={!r.text.trim() || !r.ready}>Post comment</button></div>
    </form>}
    <div className="feedback-list-heading"><strong>Conversation <span>{open} open</span></strong>
      <select aria-label="Filter feedback" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option></select>
    </div>
    <div className="feedback-thread-list">
      {!threads.length && <div className="feedback-empty"><FiMessageCircle aria-hidden /><strong>{r.data.threads.length ? 'All clear here.' : 'A better tattoo starts with a conversation.'}</strong><p>{r.data.threads.length ? 'Switch the filter to see other feedback.' : 'Add a pin for a specific spot, or leave a general note.'}</p></div>}
      {threads.map(t => <button className={`feedback-thread${t.id === r.selected ? ' is-selected' : ''}`} type="button" key={t.id} onClick={() => r.setSelected(t.id)} aria-pressed={t.id === r.selected}>
        <span className="feedback-number">{t.location ? r.data.threads.indexOf(t) + 1 : <FiMessageCircle aria-hidden />}</span>
        <span><strong>{t.location?.label ?? 'General note'} {t.resolved && <FiCheck aria-label="Resolved" />}</strong><span className="feedback-excerpt">{t.messages[0].text}</span><small>{t.messages.length > 1 ? `${t.messages.length - 1} ${t.messages.length === 2 ? 'reply' : 'replies'}` : 'No replies yet'}</small></span>
      </button>)}
    </div>
    {selected && <section className="feedback-detail" aria-label="Selected feedback">
      <div className="feedback-detail-heading"><strong>{selected.location ? `Pin ${r.data.threads.indexOf(selected) + 1} · ${selected.location.label}` : 'General note'}</strong><span>{selected.resolved ? 'Resolved' : 'Open'}</span></div>
      {selected.location && (selected.location.anchor.bodyMeshId === bodyMeshId
        ? <button type="button" className="feedback-text-button" onClick={() => onView(selected.location!)}><FiMapPin aria-hidden />Go to this view</button>
        : <p className="feedback-instruction">This pin belongs to a different body model. The comment is still available.</p>)}
      <ol className="feedback-messages">{selected.messages.map(m => <li key={m.id} className={`feedback-message feedback-message--${m.role}`}>
        <div><strong>{m.role === 'client' ? 'Client' : 'Artist'}</strong><time dateTime={m.at}>{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{m.text}</p>
      </li>)}</ol>
      {!selected.resolved && <form className="feedback-reply" onSubmit={e => { e.preventDefault(); r.reply(selected.id); }}>
        <label htmlFor="feedback-reply">Reply as {r.role}</label><textarea id="feedback-reply" value={r.replies[replyKey] ?? ''} onChange={e => r.setReplies(v => ({ ...v, [replyKey]: e.target.value }))} maxLength={2000} placeholder="Keep the conversation going…" required />
        <button type="submit" className="ep-btn" disabled={!r.replies[replyKey]?.trim() || !r.ready}>Add reply <FiCornerUpLeft aria-hidden /></button>
      </form>}
      {r.role === 'artist' && <button className="ep-btn feedback-resolve" type="button" disabled={!r.ready} onClick={() => r.resolve(selected.id, !selected.resolved)}><FiCheck aria-hidden />{selected.resolved ? 'Reopen feedback' : 'Mark resolved'}</button>}
    </section>}
    <p className="feedback-status" role="status">{r.notice}</p>
    <footer className="feedback-footer">Saved in this browser. Client and artist views simulate a shared review; nothing is sent yet.</footer>
  </aside>;
}
