import { useEffect, useRef, useState } from 'react';
import { FiArrowUpRight, FiCheck, FiCalendar, FiMessageCircle, FiImage, FiBox, FiSend, FiPlus, FiClock, FiArrowLeft } from 'react-icons/fi';
import type { SceneData } from '../types';
import { clock, minutes, money, prettyDate, STATUS_LABEL, type ArtistData } from '../artist/model';
import { artistStorageKey, loadArtistData, persistArtistData } from '../artist/storage';
import { useFeedback } from '../feedback/useFeedback';
import MoodboardPreview from '../moodboard/MoodboardPreview';
import { loadMoodboards } from '../moodboard/storage';
import type { Moodboard } from '../moodboard/model';
import FocusDialog from '../FocusDialog';
import { attachBoard, clientProject, nextStep, sendProjectMessage, sharePreview, type ClientProject, type ProjectRole } from './model';
import './clientSpace.css';

type Props = {
  owner: string; feedbackOwner: string; scenes: SceneData[]; scenesLoading: boolean; scenesError: string;
  initialProjectId?: string; initialRole?: ProjectRole; onDirtyChange?: (dirty: boolean) => void;
  onReview: (scene: SceneData, bookingId: string, role: ProjectRole) => void;
  onDesk: (bookingId?: string) => void; onMoodboard: () => void;
};
const messageOf = (e: unknown) => e instanceof Error ? e.message : 'Could not save. Your changes have not been applied.';
export default function ClientProjectSpace({ owner, feedbackOwner, scenes, scenesLoading, scenesError, initialProjectId, initialRole = 'client', onDirtyChange, onReview, onDesk, onMoodboard }: Props) {
  const [loaded, setLoaded] = useState<{ data: ArtistData | null; error: string }>(() => {
    try { return { data: loadArtistData(owner), error: '' }; } catch (e) { return { data: null, error: messageOf(e) }; }
  });
  const current = useRef(loaded.data);
  const [selected, setSelected] = useState(initialProjectId ?? '');
  const [clientId, setClientId] = useState(() => {
    const data = loaded.data;
    return data?.bookings.find(b => b.id === initialProjectId)?.clientId
      ?? data?.clients.find(c => c.email.toLowerCase() === feedbackOwner.toLowerCase())?.id
      ?? data?.bookings.find(b => b.moodboard)?.clientId ?? data?.clients[0]?.id ?? '';
  });
  const [role, setRole] = useState<ProjectRole>(initialRole);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const reload = () => {
    try { const data = loadArtistData(owner); current.current = data; setLoaded({ data, error: '' }); }
    catch (e) { current.current = null; setLoaded({ data: null, error: messageOf(e) }); }
  };
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === artistStorageKey(owner) || e.key === null) reload(); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
    // This component is keyed by account; reload keeps the latest store snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);
  const leave = (action: () => void) => {
    if (dirty && !window.confirm('Leave without saving your message draft?')) return;
    setDirty(false); action();
  };
  const commit = (change: (data: ArtistData) => ArtistData) => {
    if (!current.current) throw Error('Reload the project space before saving.');
    const saved = persistArtistData(owner, change(current.current), current.current.revision);
    current.current = saved; setLoaded({ data: saved, error: '' });
  };
  const data = loaded.data;
  if (!data) return <section className="client-space"><h1>Client project space</h1><p role="alert">{loaded.error}</p><button className="focus-primary" onClick={reload}>Reload project space</button></section>;
  const projects = data.bookings.filter(b => b.clientId === clientId);
  const booking = projects.find(b => b.id === selected) ?? projects.find(b => b.moodboard) ?? projects[0];
  const project = booking ? clientProject(data, clientId, booking.id) : null;
  return <section className="client-space" aria-label="Client project space">
    <header className="client-heading"><div><p className="focus-eyebrow">From first thought to finished tattoo</p><h1>Your tattoo, together.</h1><p>One place for the idea, the details and the conversation.</p></div><button className="client-button" onClick={() => leave(onMoodboard)}><FiImage aria-hidden />My moodboards</button></header>
    <div className="client-demo"><span><strong>Local demo</strong> · Preview both sides. Nothing is sent.</span><label>Preview client<select value={clientId} onChange={e => leave(() => { setClientId(e.target.value); setSelected(''); })}>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="client-role" role="group" aria-label="Project demo role">{(['client', 'artist'] as const).map(r => <button key={r} aria-pressed={role === r} onClick={() => leave(() => setRole(r))}>{r === 'client' ? 'Client view' : 'Artist view'}</button>)}</div></div>
    <div className="client-project-picker"><label>Your projects<select value={project?.id ?? ''} onChange={e => leave(() => setSelected(e.target.value))}>{!projects.length && <option value="">No projects yet</option>}{projects.map(b => <option key={b.id} value={b.id}>{b.title} · {STATUS_LABEL[b.status]}</option>)}</select></label><span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span></div>
    {project ? <ProjectDetail key={`${project.id}:${role}`} project={project} role={role} scenes={scenes} scenesLoading={scenesLoading} scenesError={scenesError} owner={owner} feedbackOwner={feedbackOwner}
      commit={commit} onDirty={setDirty} onReload={reload} onMoodboard={() => leave(onMoodboard)} onDesk={() => leave(() => onDesk(project.id))}
      onReview={scene => leave(() => onReview(scene, project.id, role))} />
      : <div className="client-empty"><FiImage aria-hidden /><h2>A new tattoo starts with an idea.</h2><p>Collect a few references, then create an artist request.<br />Your brief and appointment will come together here.</p><button className="focus-primary" onClick={onMoodboard}>Start with a moodboard <FiArrowUpRight aria-hidden /></button></div>}
  </section>;
}

type DetailProps = Pick<Props, 'owner' | 'feedbackOwner' | 'scenes' | 'scenesLoading' | 'scenesError' | 'onMoodboard'> & {
  project: ClientProject; role: ProjectRole; commit: (change: (data: ArtistData) => ArtistData) => void;
  onDirty: (dirty: boolean) => void; onReload: () => void; onDesk: () => void; onReview: (scene: SceneData) => void;
};
function ProjectDetail({ project: p, role, scenes, scenesLoading, scenesError, owner, feedbackOwner, commit, onDirty, onReload, onMoodboard, onDesk, onReview }: DetailProps) {
  const [tab, setTab] = useState('overview');
  const [draft, setDraft] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [attach, setAttach] = useState(false), [share, setShare] = useState(false);
  const feedback = useFeedback(feedbackOwner, p.sceneId || undefined);
  const end = useRef<HTMLDivElement>(null);
  const scene = scenes.find(s => s.id === p.sceneId);
  const next = nextStep(p);
  const openNotes = feedback.data.threads.filter(t => !t.resolved).length;
  useEffect(() => {
    onDirty(!!draft.trim());
    if (!draft.trim()) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft, onDirty]);
  useEffect(() => { if (tab === 'conversation') end.current?.scrollIntoView({ block: 'nearest' }); }, [p.messages.length, tab]);
  const compose = (text = '') => { if (!draft.trim()) setDraft(text); setTab('conversation'); };
  const previewImage = scene?.thumbnail || p.moodboard?.items.find(i => i.kind === 'image' && !i.removed)?.image;
  const appointmentLabel = p.status === 'requested' ? 'Preferred session' : p.status === 'confirmed' ? 'Your appointment' : 'Session details';
  return <>
    <div className="client-project-heading"><div><p className="focus-eyebrow">{p.clientName} <span>/</span> {p.moodboard?.artistName ?? 'Your artist'}</p><h2>{p.title}</h2></div><span className={`client-status client-status--${p.status}`}><i />{STATUS_LABEL[p.status]}</span></div>
    <nav className="client-tabs" aria-label="Client project sections">{[{ id: 'overview', name: 'Overview' }, { id: 'inspiration', name: 'Brief & inspiration' }, { id: 'conversation', name: 'Conversation' }, { id: 'appointment', name: 'Appointment' }].map(t => <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.name}{t.id === 'conversation' && p.messages.length > 0 && <span>{p.messages.length}</span>}</button>)}</nav>
    {error && <div className="client-error" role="alert">{error}<button onClick={() => { onReload(); setError(''); }}>Reload saved project</button></div>}
    {notice && <p className="client-notice" role="status"><FiCheck aria-hidden />{notice}</p>}
    <div className="client-layout">
      <div className="client-main">
        {tab === 'overview' && <>
          <section className="client-next"><span className="client-next-symbol"><FiArrowUpRight aria-hidden /></span><div><p className="focus-eyebrow">The next little step</p><h3>{next.title}</h3><p>{next.text}</p>{scene && <button className="focus-primary" onClick={() => onReview(scene)}>Explore 3D & leave feedback <FiArrowUpRight aria-hidden /></button>}{!scene && <button className="client-text-button" onClick={() => compose()}>Leave a message <FiMessageCircle aria-hidden /></button>}</div></section>
          <section className="client-card client-preview"><div className="client-card-heading"><div><p className="focus-eyebrow">Made to fit you</p><h3>Your design preview</h3></div><FiBox aria-hidden /></div>
            <div className={`client-preview-image${!scene ? ' is-inspiration' : ''}`}>{previewImage ? <img src={previewImage} alt={scene ? `3D placement preview: ${scene.name}` : 'A reference from your inspiration board'} /> : <div className="client-preview-placeholder"><FiBox aria-hidden /><p>A space for your future ink.</p></div>}<span>{scene ? 'Shared 3D placement' : 'Inspiration · design to come'}</span></div>
            <div className="client-preview-footer"><div><strong>{scene?.name ?? (scenesLoading ? 'Loading your preview…' : p.sceneId ? 'This preview is unavailable.' : 'Your artist hasn’t shared a preview yet.')}</strong><p>{scene ? 'Rotate the model. Pin the details. Make it feel right.' : 'Once a design is shared, you can explore the placement here.'}</p></div>{scene && <button className="client-button" onClick={() => onReview(scene)}>Open 3D <FiArrowUpRight aria-hidden /></button>}</div>
            {scenesError && <p className="client-error" role="alert">{scenesError}</p>}
            {p.sceneId && feedback.error && <p className="client-error" role="alert">{feedback.error}<button onClick={feedback.reload}>Reload feedback</button></p>}
            {scene && feedback.ready && <button className="client-feedback-link" onClick={() => onReview(scene)}><FiMessageCircle aria-hidden />{openNotes ? `${openNotes} open ${openNotes === 1 ? 'note' : 'notes'} on the 3D preview` : feedback.data.threads.length ? 'All preview feedback resolved' : 'Be the first to leave feedback'}<FiArrowUpRight aria-hidden /></button>}
            {role === 'artist' && <button className="client-text-button" disabled={scenesLoading || !!scenesError} onClick={() => setShare(true)}>{p.sceneId ? 'Change shared preview' : 'Share a 3D design'} <FiPlus aria-hidden /></button>}
          </section>
          <section className="client-card"><div className="client-card-heading"><h3>The idea, in your words</h3><button className="client-text-button" onClick={() => setTab('inspiration')}>View brief <FiArrowUpRight aria-hidden /></button></div><p className="client-brief">{p.brief || 'The conversation is just getting started. Share what matters to you in a message.'}</p>{p.moodboard && <div className="client-reference-strip">{p.moodboard.items.filter(i => !i.removed).slice(0, 4).map(i => <button key={i.id} onClick={() => setTab('inspiration')} aria-label={`View reference ${i.title}`}>{i.kind === 'image' ? <img src={i.image} alt={i.title} /> : <span>{i.kind === 'note' ? '“' : '↗'}<small>{i.title}</small></span>}</button>)}</div>}</section>
        </>}
        {tab === 'inspiration' && <section className="client-card"><div className="client-card-heading"><div><p className="focus-eyebrow">What makes it yours</p><h3>Brief & inspiration</h3></div><button className="client-button" onClick={() => setAttach(true)}><FiPlus aria-hidden />{p.moodboard ? 'Update shared board' : 'Attach moodboard'}</button></div><p className="client-brief">{p.brief || 'No written brief yet. Tell your artist about the idea in the conversation.'}</p>{p.moodboard ? <MoodboardPreview board={p.moodboard} /> : <div className="client-empty client-empty--small"><FiImage aria-hidden /><h3>Bring the feeling into focus.</h3><p>Share a board of references with notes about what draws you in.</p><button className="client-text-button" onClick={onMoodboard}>Collect inspiration <FiArrowUpRight aria-hidden /></button></div>}<p className="client-muted">This is a saved copy. Changes to your personal board are shared only when you choose “Update shared board”.</p></section>}
        {tab === 'conversation' && <section className="client-card client-conversation"><div className="client-card-heading"><div><p className="focus-eyebrow">A conversation, not a guessing game</p><h3>Talk it through.</h3></div><FiMessageCircle aria-hidden /></div><div className="client-messages" role="log" aria-label="Project conversation" aria-live="polite">{!p.messages.length && <div className="client-empty client-empty--small"><FiMessageCircle aria-hidden /><h3>Say what’s on your mind.</h3><p>Questions, a new idea, or a small detail.<br />This conversation stays with this project.</p></div>}{p.messages.map(m => <article key={m.id} className={`client-message${m.from === role ? ' is-own' : ''}`}><header><strong>{m.from === 'client' ? p.clientName : p.moodboard?.artistName ?? 'Your artist'}</strong><time dateTime={m.at}>{new Date(m.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></header><p>{m.text}</p></article>)}<div ref={end} /></div>
          <form className="client-compose" onSubmit={e => { e.preventDefault(); try { commit(d => sendProjectMessage(d, p.clientId, p.id, draft, role)); setDraft(''); setError(''); setNotice('Message saved in this project. Nothing was sent outside the demo.'); } catch (e) { setError(messageOf(e)); } }}><label htmlFor="client-project-message">{role === 'client' ? 'Message your artist' : `Reply to ${p.clientName}`}</label><textarea id="client-project-message" value={draft} onChange={e => setDraft(e.target.value)} rows={3} required maxLength={4000} placeholder="I’d love to explore…" /><footer><small>Only this project’s conversation</small><button className="focus-primary" disabled={!draft.trim()}>Save message <FiSend aria-hidden /></button></footer></form></section>}
        {tab === 'appointment' && <section className="client-card"><p className="focus-eyebrow">Make time for something meaningful</p><h3>{appointmentLabel}</h3><div className="client-date-large"><FiCalendar aria-hidden /><div><strong>{prettyDate(p.date)}</strong><span>{p.time}–{clock(minutes(p.time) + p.duration)} · {p.duration} minutes</span></div></div><p className="client-muted">{p.service} · Times shown in the studio’s local time.</p><p className="client-appointment-explanation">{p.status === 'requested' ? 'This is your preferred time. It is not reserved until the artist confirms it.' : p.status === 'confirmed' ? 'Your artist has confirmed this time. Need a change? Discuss it here before making new plans.' : `This appointment is ${STATUS_LABEL[p.status].toLowerCase()}. It is not an upcoming booking.`}</p><dl className="client-costs"><div><dt>Session quote</dt><dd>{p.price > 0 ? money(p.price) : 'To be agreed'}</dd></div><div><dt>Deposit</dt><dd>{p.deposit > 0 ? `${money(p.deposit)} · ${p.depositPaid ? 'recorded as received' : 'not yet recorded as paid'}` : 'Not requested'}</dd></div></dl><p className="client-muted">Payment details are recorded by the artist. No payments are collected in this demo.</p><button className="client-button" onClick={() => compose('Could we discuss another time for this appointment? ')}>Discuss a different time <FiMessageCircle aria-hidden /></button>{role === 'artist' && <button className="client-text-button" onClick={onDesk}>Manage appointment in artist desk <FiArrowUpRight aria-hidden /></button>}</section>}
      </div>
      <aside className="client-aside">
        <section className="client-card client-together"><span className="client-monogram">{(p.moodboard?.artistName ?? 'Smart Ink').split(' ').map(s => s[0]).slice(0, 2).join('')}</span><p className="focus-eyebrow">Creating with</p><h3>{p.moodboard?.artistName ?? 'Your artist'}</h3><p>Good tattoos start with<br />a shared understanding.</p><button className="client-button" onClick={() => compose()}><FiMessageCircle aria-hidden />{role === 'artist' ? 'Open conversation' : 'Message artist'}</button></section>
        <section className="client-card client-session"><div className="client-card-heading"><h3>{appointmentLabel}</h3><FiCalendar aria-hidden /></div><strong>{prettyDate(p.date)}</strong><p>{p.time} · {p.service}</p>{p.status === 'requested' && <span className="client-pending"><FiClock aria-hidden />Awaiting confirmation</span>}{['cancelled', 'declined', 'completed'].includes(p.status) && <span className="client-pending">{STATUS_LABEL[p.status]}</span>}<button className="client-text-button" onClick={() => setTab('appointment')}>View details <FiArrowUpRight aria-hidden /></button></section>
        <section className="client-card client-checklist"><p className="focus-eyebrow">Where things stand</p>{[{ label: 'Idea shared', done: !!p.brief || !!p.moodboard }, { label: '3D preview shared', done: !!scene }, { label: 'Session confirmed', done: p.status === 'confirmed' || p.status === 'completed' }, { label: 'Session complete', done: p.status === 'completed' }].map(step => <div key={step.label} className={step.done ? 'is-done' : ''}><span aria-label={step.done ? 'Done' : 'Pending'}>{step.done ? <FiCheck /> : <i />}</span>{step.label}</div>)}</section>
        {role === 'artist' && <button className="client-text-button" onClick={onDesk}><FiArrowLeft aria-hidden />Open artist desk</button>}
      </aside>
    </div>
    <p className="client-local-note">Local preview · Project spaces use this account’s demo data. Client and artist roles simulate collaboration on this device; there are no client invitations or shared online accounts yet.</p>
    {share && <ShareDialog scenes={scenes} selected={p.sceneId} onClose={() => setShare(false)} onSave={sceneId => { commit(d => sharePreview(d, p.id, sceneId, role, scenes.map(s => s.id))); setShare(false); setNotice(sceneId ? 'Design preview shared in this project space.' : 'Preview removed from this project space.'); }} />}
    {attach && <AttachDialog owner={owner} onClose={() => setAttach(false)} onSave={board => { commit(d => attachBoard(d, p.clientId, p.id, board)); setAttach(false); setNotice('A copy of your moodboard is now shared with this project.'); }} />}
  </>;
}
function ShareDialog({ scenes, selected, onClose, onSave }: { scenes: SceneData[]; selected: string; onClose: () => void; onSave: (id: string) => void }) {
  const [value, setValue] = useState(selected), [error, setError] = useState('');
  return <FocusDialog title="Share a design preview" onClose={onClose}><form className="mood-form" onSubmit={e => { e.preventDefault(); try { onSave(value); } catch (e) { setError(messageOf(e)); } }}><p className="client-muted">The client can rotate this design and leave feedback. Editing stays with the artist. Feedback follows the linked studio project.</p><label>Tattoo project<select value={value} onChange={e => setValue(e.target.value)}><option value="">No preview shared</option>{selected && !scenes.some(s => s.id === selected) && <option value={selected} disabled>Previously linked preview (unavailable)</option>}{scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{error && <p className="client-error" role="alert">{error}</p>}<footer><button type="button" className="client-button" onClick={onClose}>Cancel</button><button className="focus-primary">Save shared preview</button></footer></form></FocusDialog>;
}
function AttachDialog({ owner, onClose, onSave }: { owner: string; onClose: () => void; onSave: (board: Moodboard) => void }) {
  const [loaded] = useState(() => { try { return { boards: loadMoodboards(owner).boards, error: '' }; } catch (e) { return { boards: [], error: messageOf(e) }; } });
  const boards = loaded.boards.filter(b => b.items.some(i => !i.removed));
  const [selected, setSelected] = useState(boards[0]?.id ?? ''), [error, setError] = useState(loaded.error);
  return <FocusDialog title="Share your inspiration" onClose={onClose}><form className="mood-form" onSubmit={e => { e.preventDefault(); const board = boards.find(b => b.id === selected); if (!board) return; try { onSave(board); } catch (e) { setError(messageOf(e)); } }}><p className="client-muted">Attach a fresh copy of a board. This replaces the references shared here, and keeps your personal board unchanged.</p>{boards.length ? <label>Moodboard<select value={selected} onChange={e => setSelected(e.target.value)}>{boards.map(b => <option key={b.id} value={b.id}>{b.title} · {b.items.filter(i => !i.removed).length} references</option>)}</select></label> : <p className="client-muted">Add references to a moodboard first, then return here to share it.</p>}{error && <p className="client-error" role="alert">{error}</p>}<footer><button type="button" className="client-button" onClick={onClose}>Cancel</button><button className="focus-primary" disabled={!selected}>Share board with project</button></footer></form></FocusDialog>;
}
