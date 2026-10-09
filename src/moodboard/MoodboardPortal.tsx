import { useRef, useState } from 'react';
import { FiArrowLeft, FiArrowUpRight, FiPlus, FiImage, FiLink, FiEdit3, FiExternalLink, FiArrowUp, FiArrowDown, FiX, FiDownload, FiCheck } from 'react-icons/fi';
import FocusDialog from '../FocusDialog';
import { ThemeToggle } from '../Theme';
import { DEMO_ARTISTS, type PortfolioImage } from '../discovery/artists';
import { addInspiration, newBoard, updateBoard, type Inspiration, type Moodboard, type MoodboardData } from './model';
import { loadMoodboards, persistMoodboards } from './storage';
import { prepareInspirationImage } from './images';
import { downloadBrief } from './brief';
import { requestWithMoodboard, type MoodboardRequest } from './request';
import { loadArtistData, persistArtistData } from '../artist/storage';
import { dateKey, shiftDate } from '../artist/model';
import MoodboardPreview from './MoodboardPreview';
import './moodboard.css';

const blankItem = (kind: Inspiration['kind']): Inspiration => ({ id: crypto.randomUUID(), kind, title: '', note: '', image: '', url: '' });
export default function MoodboardPortal({ owner, pending, onCollected, onArtists, onStudio, onDesk }: {
  owner: string; pending: PortfolioImage | null; onCollected: () => void; onArtists: () => void; onStudio: () => void; onDesk: () => void;
}) {
  const [loaded, setLoaded] = useState<{ data: MoodboardData | null; error: string }>(() => {
    try { return { data: loadMoodboards(owner), error: '' }; } catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Could not load moodboards.' }; }
  });
  const ref = useRef(loaded.data); ref.current = loaded.data;
  const [chosen, setChosen] = useState<string | null>(null), [editing, setEditing] = useState<Inspiration | null>(null), [details, setDetails] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false), [preview, setPreview] = useState(false), [downloadBusy, setDownloadBusy] = useState(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const data = loaded.data, board = data?.boards.find(b => b.id === chosen) ?? data?.boards[0];
  const reload = () => { try { const next = loadMoodboards(owner); ref.current = next; setLoaded({ data: next, error: '' }); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not reload.'); } };
  const commit = (nextBoard: Moodboard) => {
    if (!ref.current) throw Error('Reload your boards before saving.');
    const next = persistMoodboards(owner, updateBoard(ref.current, nextBoard), ref.current.revision);
    ref.current = next; setLoaded({ data: next, error: '' }); setError(''); setNotice('Saved on this device.');
  };
  const attempt = (action: () => void) => { try { action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } };
  const download = async () => { if (!board) return; setDownloadBusy(true); setError(''); try { await downloadBrief(board); setNotice('Brief downloaded. You can attach this file to a message to your artist.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not download.'); } finally { setDownloadBusy(false); } };
  if (!data || !board) return <main className="mood-page"><p role="alert">{loaded.error || error}</p><button className="focus-primary" onClick={reload}>Reload moodboards</button></main>;
  const visible = board.items.filter(i => !i.removed), removed = board.items.filter(i => i.removed).at(-1);
  const patchItem = (item: Inspiration) => commit({ ...board, items: board.items.map(i => i.id === item.id ? item : i) });
  const move = (id: string, offset: number) => attempt(() => {
    const items = [...board.items], from = items.findIndex(i => i.id === id), target = visible[visible.findIndex(i => i.id === id) + offset];
    if (!target) return; const to = items.findIndex(i => i.id === target.id); [items[from], items[to]] = [items[to], items[from]]; commit({ ...board, items });
  });
  return <div className="mood-page">
    <header className="mood-nav"><button onClick={onArtists}><FiArrowLeft aria-hidden />Artists</button><span className="mood-wordmark">Smart Ink <i>/</i> Inspiration</span><div><ThemeToggle /><button onClick={onStudio}>Studio <FiArrowUpRight aria-hidden /></button></div></header>
    <main className="mood-main">
      <header className="mood-hero"><p className="focus-eyebrow">Before the first line</p><h1>Collect a feeling.<br /><span>Make it your own.</span></h1><p>A shape. A story. A detail you can’t stop thinking about.<br />Bring it all together for your artist.</p></header>
      <div className="mood-board-tabs" role="group" aria-label="Your moodboards">{data.boards.map(b => <button key={b.id} aria-pressed={b.id === board.id} onClick={() => { setChosen(b.id); setNotice(''); setSent(false); }}>{b.title}</button>)}<button onClick={() => attempt(() => { const next = newBoard(`New idea ${data.boards.length + 1}`); commit(next); setChosen(next.id); setDetails(true); setSent(false); })}><FiPlus aria-hidden />New board</button></div>
      <section className="mood-board" aria-label={board.title}>
        <div className="mood-board-heading"><div><p className="focus-eyebrow">Your inspiration board · {visible.length} references</p><h2>{board.title}</h2><p className="mood-brief">{board.brief || 'What would you love this tattoo to say?'}</p><div className="mood-tags">{[board.placement, board.size].filter(Boolean).map(v => <span key={v}>{v}</span>)}</div></div><button className="mood-button" onClick={() => setDetails(true)}><FiEdit3 aria-hidden />Edit brief</button></div>
        {pending && <div className="mood-collect-banner"><img src={pending.src} alt={pending.alt} /><div><strong>A little inspiration from the portfolio.</strong><p>{pending.alt}</p></div><button className="focus-primary" onClick={() => attempt(() => { commit(addInspiration(board, { ...blankItem('image'), title: pending.alt.slice(0, 120), image: pending.src, note: 'What I like about this reference: ' })); onCollected(); })}>Add to this board</button><button className="mood-icon" aria-label="Dismiss portfolio reference" onClick={onCollected}><FiX /></button></div>}
        <div className="mood-actions"><div><button className="mood-button" onClick={() => setEditing(blankItem('image'))}><FiImage aria-hidden />Add image</button><button className="mood-button" onClick={() => setEditing(blankItem('link'))}><FiLink aria-hidden />Save link</button><button className="mood-button" onClick={() => setEditing(blankItem('note'))}><FiEdit3 aria-hidden />Add note</button></div><button className="mood-text-button" disabled={!visible.length} onClick={() => setPreview(true)}>Preview brief <FiArrowUpRight aria-hidden /></button></div>
        {error && <p className="mood-error" role="alert">{error}<button onClick={reload}>Reload boards</button></p>}
        {notice && <p className="mood-status" role="status"><FiCheck aria-hidden />{notice}</p>}
        {removed && <div className="mood-undo">Removed “{removed.title}”<button onClick={() => attempt(() => patchItem({ ...removed, removed: false }))}>Undo removal</button></div>}
        {!visible.length ? <div className="mood-empty"><div className="mood-empty-art"><FiImage /><FiEdit3 /><FiLink /></div><h3>Start with whatever draws you in.</h3><p>A tattoo reference, a photograph, a colour, a meaningful word.<br />Add a note about what you like — that’s the useful part.</p><button className="focus-primary" onClick={onArtists}>Find inspiration in portfolios <FiArrowUpRight aria-hidden /></button><button className="mood-text-button" onClick={() => attempt(() => { const sample = DEMO_ARTISTS[0].work[1]; commit(addInspiration(board, { ...blankItem('image'), image: sample.src, title: 'Botanical lines', note: 'I like the delicate linework and the way the leaves flow.' })); })}>Try a sample reference</button></div>
          : <div className="mood-grid">{visible.map((item, index) => <article className={`mood-card mood-card--${item.kind}`} key={item.id}>
            <button className="mood-card-visual" onClick={() => setEditing(item)} aria-label={`Edit reference ${item.title}`}>{item.kind === 'image' ? <img src={item.image} alt={item.title} loading="lazy" /> : item.kind === 'link' ? <><FiLink aria-hidden /><span>{new URL(item.url).hostname}</span></> : <><span className="mood-note-quote">“</span><span>{item.note || item.title}</span></>}</button>
            <div className="mood-card-body"><span className="mood-kind">{item.kind === 'image' ? 'Visual reference' : item.kind === 'link' ? 'Saved from the web' : 'A thought to keep'}</span><h3>{item.title}</h3>{item.kind !== 'note' && <p>{item.note || 'Add what you like about this reference.'}</p>}{item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">Source <FiExternalLink aria-hidden /></a>}<div className="mood-card-tools"><button onClick={() => setEditing(item)}>Edit note</button><span /><button className="mood-icon" aria-label={`Move ${item.title} earlier`} disabled={index === 0} onClick={() => move(item.id, -1)}><FiArrowUp /></button><button className="mood-icon" aria-label={`Move ${item.title} later`} disabled={index === visible.length - 1} onClick={() => move(item.id, 1)}><FiArrowDown /></button><button className="mood-icon" aria-label={`Remove ${item.title}`} onClick={() => attempt(() => patchItem({ ...item, removed: true }))}><FiX /></button></div></div>
          </article>)}</div>}
      </section>
      <section className="mood-handoff"><div><p className="focus-eyebrow">Turn inspiration into a conversation</p><h2>Ready to bring an artist in?</h2><p>Share the idea, the placement and what matters to you.<br />The artist reviews the request before confirming a session.</p></div><div className="mood-handoff-actions"><button className="focus-primary" disabled={!visible.length} onClick={() => setRequestOpen(true)}>Create artist request <FiArrowUpRight aria-hidden /></button><button className="mood-button" disabled={!visible.length || downloadBusy} onClick={() => void download()}><FiDownload aria-hidden />{downloadBusy ? 'Preparing…' : 'Download brief'}</button>{sent && <button className="mood-text-button" onClick={onDesk}>View request in artist desk <FiArrowUpRight aria-hidden /></button>}</div></section>
      <p className="mood-local-note">Demo · Boards stay in this browser. Artist requests appear in your local artist desk; nothing is sent. Download a brief to share yourself.</p>
    </main>
    {editing && <ReferenceForm key={editing.id} initial={editing} onClose={() => setEditing(null)} onSave={item => { if (board.items.some(i => i.id === item.id)) patchItem(item); else commit(addInspiration(board, item)); setEditing(null); }} />}
    {details && <BriefForm board={board} onClose={() => setDetails(false)} onSave={value => { commit(value); setDetails(false); }} />}
    {preview && <FocusDialog title="Your inspiration brief" wide onClose={() => setPreview(false)}><MoodboardPreview board={board} /><button className="focus-primary" disabled={downloadBusy} onClick={() => void download()}>Download brief</button></FocusDialog>}
    {requestOpen && <RequestForm board={board} onClose={() => setRequestOpen(false)} onSave={request => {
      const current = loadArtistData(owner); const next = requestWithMoodboard(current, board, request);
      persistArtistData(owner, next, current.revision); setRequestOpen(false); setSent(true); setNotice('Request and moodboard saved in the demo artist desk. No message was sent.');
    }} />}
  </div>;
}

function ReferenceForm({ initial, onClose, onSave }: { initial: Inspiration; onClose: () => void; onSave: (item: Inspiration) => void }) {
  const [value, setValue] = useState(initial), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const active = useRef(true);
  return <FocusDialog title={initial.title ? 'Refine your reference' : 'Add a little inspiration'} onClose={() => { active.current = false; onClose(); }}>
    <form className="mood-form" onSubmit={e => { e.preventDefault(); try { onSave(value); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save reference.'); } }}>
      {value.kind === 'image' && <><label>Reference image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError('');
        try { const image = await prepareInspirationImage(file); if (active.current) setValue(v => ({ ...v, image, title: v.title || file.name.replace(/\.[^.]+$/, '').slice(0, 120) })); }
        catch (err) { if (active.current) setError(err instanceof Error ? err.message : 'Could not read the image.'); }
        finally { if (active.current) setBusy(false); }
      }} /></label>{value.image && <img className="mood-upload-preview" src={value.image} alt="Reference preview" />}<small>JPG, PNG or WebP · up to 12 MB · kept on this device</small></>}
      <label>Reference title<input value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} required maxLength={120} placeholder="e.g. The flow of these leaves" /></label>
      <label>{value.kind === 'note' ? 'Your thought' : 'What do you like about it?'}<textarea value={value.note} onChange={e => setValue({ ...value, note: e.target.value })} maxLength={2000} rows={4} placeholder="The line weight, the mood, the placement…" required={value.kind === 'note'} /></label>
      {value.kind !== 'note' && <label>{value.kind === 'link' ? 'Link' : 'Source link (optional)'}<input type="url" value={value.url} onChange={e => setValue({ ...value, url: e.target.value })} required={value.kind === 'link'} maxLength={2000} placeholder="https://…" /></label>}
      {error && <p role="alert" className="mood-error">{error}</p>}
      <footer><button type="button" className="mood-button" onClick={() => { active.current = false; onClose(); }}>Cancel</button><button type="submit" className="focus-primary" disabled={busy || value.kind === 'image' && !value.image}>{busy ? 'Preparing image…' : 'Save reference'}</button></footer>
    </form>
  </FocusDialog>;
}
function BriefForm({ board, onClose, onSave }: { board: Moodboard; onClose: () => void; onSave: (board: Moodboard) => void }) {
  const [value, setValue] = useState(board), [error, setError] = useState('');
  return <FocusDialog title="The idea behind your board" onClose={onClose}><form className="mood-form" onSubmit={e => { e.preventDefault(); try { onSave({ ...value, title: value.title.trim() }); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); } }}>
    <label>Board name<input value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} required maxLength={100} /></label>
    <label>Your idea<textarea value={value.brief} onChange={e => setValue({ ...value, brief: e.target.value })} rows={4} maxLength={3000} placeholder="The story, the feeling, and anything you definitely want or want to avoid." /></label>
    <div className="mood-form-row"><label>Placement<input value={value.placement} onChange={e => setValue({ ...value, placement: e.target.value })} maxLength={100} placeholder="e.g. Outer forearm" /></label><label>Approximate size<input value={value.size} onChange={e => setValue({ ...value, size: e.target.value })} maxLength={100} placeholder="e.g. 12–15 cm" /></label></div>
    {error && <p role="alert" className="mood-error">{error}</p>}<footer><button type="button" className="mood-button" onClick={onClose}>Cancel</button><button className="focus-primary">Save brief</button></footer>
  </form></FocusDialog>;
}
function RequestForm({ board, onClose, onSave }: { board: Moodboard; onClose: () => void; onSave: (request: MoodboardRequest) => void }) {
  const [value, setValue] = useState<MoodboardRequest>(() => ({ id: crypto.randomUUID(), artistId: '', name: '', email: '', date: shiftDate(dateKey(), 3), time: '10:00' }));
  const [error, setError] = useState(''); const sent = useRef(false);
  return <FocusDialog title="Bring your board to an artist" onClose={onClose}><form className="mood-form" onSubmit={e => { e.preventDefault(); if (sent.current) return; try { onSave(value); sent.current = true; } catch (err) { setError(err instanceof Error ? err.message : 'Could not create request.'); } }}>
    <p className="mood-muted">“{board.title}” and its {board.items.filter(i => !i.removed).length} references will be attached as a saved copy. Later edits to your board won’t change this request.</p>
    <label>Choose an artist<select value={value.artistId} onChange={e => setValue({ ...value, artistId: e.target.value })} required><option value="">Choose from the demo artists</option>{DEMO_ARTISTS.map(a => <option key={a.id} value={a.id} disabled={!a.open}>{a.name} · {a.city}{!a.open ? ' · books closed' : ''}</option>)}</select></label>
    <div className="mood-form-row"><label>Your name<input value={value.name} onChange={e => setValue({ ...value, name: e.target.value })} maxLength={100} required placeholder="Demo Guest" /></label><label>Email<input type="email" value={value.email} onChange={e => setValue({ ...value, email: e.target.value })} maxLength={254} required placeholder="guest@example.invalid" /></label></div>
    <div className="mood-form-row"><label>Preferred date<input type="date" value={value.date} min={dateKey()} onChange={e => setValue({ ...value, date: e.target.value })} required /></label><label>Preferred time<input type="time" value={value.time} onChange={e => setValue({ ...value, time: e.target.value })} required /></label></div>
    <p className="mood-muted">A request for a one-hour consultation. The artist agrees the time before it becomes an appointment.</p>
    <p className="mood-local-note">Local demo · this appears in your artist desk. No artist is contacted.</p>
    {error && <p role="alert" className="mood-error">{error}</p>}<footer><button type="button" className="mood-button" onClick={onClose}>Cancel</button><button className="focus-primary">Create demo request <FiArrowUpRight aria-hidden /></button></footer>
  </form></FocusDialog>;
}
