import { useEffect, useRef, useState } from 'react';
import { FiArrowUpRight, FiBox, FiCheck, FiClock, FiLayers, FiPlus, FiMessageCircle as FiMessage } from 'react-icons/fi';
import FocusDialog from '../FocusDialog';
import type { SceneData } from '../types';
import type { ClientProject, ProjectRole } from '../client/model';
import { getScene } from '../sceneStorage';
import { captureDesign } from './capture';
import { decideVersion, decisionLabel, designChanges, publishVersion, type DesignVersion } from './model';
import type { DesignVersionsController } from './useDesignVersions';
import './designVersions.css';

const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Please try again.';
type Props = {
  history: DesignVersionsController; project: ClientProject; role: ProjectRole;
  scenes: SceneData[]; scenesLoading: boolean; scenesError: string; initialVersionId?: string;
  onReview: (scene: SceneData, versionId?: string) => void;
};
export default function DesignVersions({ history, project, role, scenes, scenesLoading, scenesError, initialVersionId, onReview }: Props) {
  const [selectedId, setSelectedId] = useState(initialVersionId ?? '');
  const [compareId, setCompareId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [decision, setDecision] = useState<{ kind: 'approved' | 'changes_requested'; version: DesignVersion } | null>(null);
  const [notice, setNotice] = useState('');
  const versions = history.data.versions, latest = versions.at(-1);
  const selected = versions.find(v => v.id === selectedId) ?? latest;
  const otherVersions = versions.filter(v => v.id !== selected?.id);
  const compare = otherVersions.find(v => v.id === compareId) ?? otherVersions.at(-1);
  const changes = selected && compare ? designChanges(compare.scene, selected.scene) : [];
  return <section className="design-versions" aria-label="Design versions and approval">
    <header className="client-card-heading"><div><p className="focus-eyebrow">Every detail, agreed together</p><h3>Design versions</h3></div>{role === 'artist' && <button className="client-button" disabled={!history.ready || history.busy || scenesLoading || !!scenesError} onClick={() => setSharing(true)}><FiPlus aria-hidden />Share a version</button>}</header>
    <p className="client-muted design-intro">A saved design, a clear decision. Each version keeps its own artwork, placement and feedback.</p>
    {history.error && <div className="client-error" role="alert">{history.error}<button onClick={() => void history.reload()} disabled={history.busy}>Reload design history</button></div>}
    {scenesError && role === 'artist' && <p className="client-error" role="alert">{scenesError} Saved versions below can still be reviewed.</p>}
    {notice && <p className="client-notice" role="status"><FiCheck aria-hidden />{notice}</p>}
    {!history.ready && !history.error && <p className="client-muted" role="status">Loading saved versions…</p>}
    {history.ready && !selected && <div className="client-card client-empty"><FiLayers aria-hidden /><h3>A little closer, with every version.</h3><p>{role === 'artist' ? 'Choose a saved studio design and add a note for your client. We’ll keep a copy here for them to review.' : 'Your artist will share a design here. Explore it in 3D, ask for changes, or approve it when it feels right.'}</p>{role === 'artist' && <button className="focus-primary" disabled={scenesLoading || !!scenesError} onClick={() => setSharing(true)}>Share the first version <FiPlus aria-hidden /></button>}</div>}
    {selected && <>
      <div className="design-history" role="group" aria-label="Version history">{[...versions].reverse().map(v => <button key={v.id} className={selected.id === v.id ? 'is-selected' : ''} aria-pressed={selected.id === v.id} onClick={() => { setSelectedId(v.id); setCompareId(''); setNotice(''); }}><span className="design-number">V{v.number}</span><span><strong>{v.title}</strong><small>{v.id === latest?.id ? 'Latest · ' : ''}{decisionLabel(v)}</small></span>{v.decision?.kind === 'approved' ? <FiCheck aria-hidden /> : <FiClock aria-hidden />}</button>)}</div>
      <section className="client-card design-review">
        <header className="client-card-heading"><div><p className="focus-eyebrow">Version {selected.number}{selected.id === latest?.id ? ' / Latest' : ' / Earlier version'}</p><h3>{selected.title}</h3><time className="client-muted" dateTime={selected.sharedAt}>Shared {dateLabel(selected.sharedAt)}</time></div><span className={`design-status design-status--${selected.decision?.kind ?? 'pending'}`}>{selected.decision?.kind === 'approved' ? <FiCheck aria-hidden /> : <FiClock aria-hidden />}{decisionLabel(selected)}</span></header>
        <p className="design-note">{selected.note}</p>
        {compare && <label className="design-compare-label">Compare with<select value={compare.id} onChange={e => setCompareId(e.target.value)}>{otherVersions.map(v => <option key={v.id} value={v.id}>Version {v.number} · {v.title}</option>)}</select></label>}
        <div className={`design-previews${compare ? ' is-comparing' : ''}`}>{compare && <VersionPreview version={compare} onReview={onReview} />}<VersionPreview version={selected} onReview={onReview} /></div>
        {compare && <div className="design-differences"><span>Differences between V{compare.number} and V{selected.number}</span>{changes.length ? <ul>{changes.map(label => <li key={label}>{label}</li>)}</ul> : <p>No changes to artwork, placement or body settings.</p>}</div>}
        {selected.decision ? <div className={`design-decision design-decision--${selected.decision.kind}`}><span className="design-decision-icon">{selected.decision.kind === 'approved' ? <FiCheck aria-hidden /> : <FiMessage aria-hidden />}</span><div><strong>{selected.decision.kind === 'approved' ? `Version ${selected.number} approved` : 'A few changes to explore'}</strong><p className="client-muted">{selected.decision.clientName} · {dateLabel(selected.decision.at)}</p>{selected.decision.note && <p className="design-note">{selected.decision.note}</p>}{selected.id !== latest?.id && <p className="client-muted">This decision applies to version {selected.number}. Version {latest?.number} has its own review.</p>}</div></div>
          : selected.id !== latest?.id ? <p className="design-review-hint">A newer version is available. Review version {latest?.number} to approve or request changes.</p>
          : role === 'client' ? <div className="design-decision-actions"><div><strong>Does this feel like you?</strong><p>Explore the design and placement in 3D before deciding.</p></div><div><button className="client-button" disabled={!history.ready || history.busy} onClick={() => setDecision({ kind: 'changes_requested', version: selected })}>Request changes</button><button className="focus-primary" disabled={!history.ready || history.busy} onClick={() => setDecision({ kind: 'approved', version: selected })}><FiCheck aria-hidden />Approve version {selected.number}</button></div></div>
          : <p className="design-review-hint"><FiClock aria-hidden />Awaiting your client’s review. Switch to Client view to try it in this demo.</p>}
      </section>
      <p className="client-muted">Approval records the design and placement for this version. It doesn’t confirm an appointment or record a payment. Your final stencil is agreed together at the studio.</p>
    </>}
    {sharing && <PublishDialog history={history} scenes={scenes} preferred={project.sceneId} role={role} onClose={() => setSharing(false)} onSaved={v => { setSharing(false); setSelectedId(v.id); setCompareId(''); setNotice(`Version ${v.number} saved and ready for review in this demo.`); }} />}
    {decision && <DecisionDialog key={decision.version.id + decision.kind} history={history} version={decision.version} project={project} role={role} kind={decision.kind} onClose={() => setDecision(null)} onSaved={() => { setDecision(null); setNotice(decision.kind === 'approved' ? `Approval saved for version ${decision.version.number}.` : `Your changes are recorded on version ${decision.version.number}.`); }} />}
  </section>;
}
function VersionPreview({ version, onReview }: { version: DesignVersion; onReview: Props['onReview'] }) {
  return <article className="design-preview"><div className="design-preview-image">{version.scene.thumbnail ? <img src={version.scene.thumbnail} alt={`Saved placement preview for version ${version.number}`} /> : <div className="design-no-preview"><FiBox aria-hidden /><span>Explore the saved design in 3D</span></div>}<span>V{version.number} · Saved preview</span></div><footer><strong>{version.title}</strong><button className="client-text-button" onClick={() => onReview(version.scene, version.id)}>Open V{version.number} in 3D <FiArrowUpRight aria-hidden /></button></footer></article>;
}
function useDraftWarning() {
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
}
function PublishDialog({ history, scenes, preferred, role, onClose, onSaved }: { history: DesignVersionsController; scenes: SceneData[]; preferred: string; role: ProjectRole; onClose: () => void; onSaved: (version: DesignVersion) => void }) {
  const eligible = scenes.filter(s => s.decalImage && s.decalVisible);
  const [sceneId, setSceneId] = useState(eligible.find(s => s.id === preferred)?.id ?? eligible[0]?.id ?? '');
  const [title, setTitle] = useState(''), [note, setNote] = useState(''), [error, setError] = useState('');
  const submitting = useRef(false);
  useDraftWarning();
  const close = () => { if (!submitting.current) onClose(); };
  return <FocusDialog title="Share a design version" onClose={close}><form className="mood-form" onSubmit={async e => {
    e.preventDefault(); if (submitting.current) return; submitting.current = true; setError('');
    try {
      const saved = await history.change(async () => {
        const source = await getScene(sceneId);
        if (!source) throw Error('This studio design is no longer available. Choose another saved design.');
        const scene = await captureDesign(source);
        const input = { id: crypto.randomUUID(), title, note, scene };
        return current => publishVersion(current, role, input);
      });
      onSaved(saved.versions.at(-1)!);
    } catch (e) { setError(messageOf(e)); } finally { submitting.current = false; }
  }}>
    <p className="client-muted">A separate copy of the saved artwork, body and placement will be kept here. Later studio edits won’t change this version. Each new version needs a fresh review.</p>
    <label>Saved studio design<select value={sceneId} onChange={e => setSceneId(e.target.value)} required disabled={history.busy}>{!eligible.length && <option value="">Save a design with a visible tattoo first</option>}{eligible.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Version title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} required disabled={history.busy} placeholder="A little more breathing room" /></label>
    <label>Note for your client<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={4} required disabled={history.busy} placeholder="What’s new, and what would you like them to look at?" /></label>
    {error && <p className="client-error" role="alert">{error}</p>}
    <footer><button className="client-button" type="button" disabled={history.busy} onClick={close}>Cancel</button><button className="focus-primary" disabled={history.busy || !history.ready || !sceneId || !title.trim() || !note.trim()}>{history.busy ? 'Saving a copy…' : `Share version ${history.data.versions.length + 1}`}</button></footer>
  </form></FocusDialog>;
}
function DecisionDialog({ history, version, project, role, kind, onClose, onSaved }: { history: DesignVersionsController; version: DesignVersion; project: ClientProject; role: ProjectRole; kind: 'approved' | 'changes_requested'; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(''), [acknowledged, setAcknowledged] = useState(false), [error, setError] = useState('');
  const submitting = useRef(false); useDraftWarning();
  const approving = kind === 'approved';
  const close = () => { if (!submitting.current) onClose(); };
  return <FocusDialog title={approving ? `Approve version ${version.number}` : `Request changes to version ${version.number}`} onClose={close}><form className="mood-form" onSubmit={async e => {
    e.preventDefault(); if (submitting.current || approving && !acknowledged) return; submitting.current = true; setError('');
    try { await history.change(async () => current => decideVersion(current, version.id, role, project.clientId, { kind, note, clientName: project.clientName })); onSaved(); }
    catch (e) { setError(messageOf(e)); } finally { submitting.current = false; }
  }}><p className="design-dialog-version">V{version.number} <span>·</span> {version.title}</p><p className="client-muted">{approving ? 'Your approval stays with this exact version. A later revision will need a new decision.' : 'Tell your artist what you’d like adjusted. They can share a new version for you to review.'}</p>
    <label>{approving ? 'Note to your artist (optional)' : 'What would you like changed?'}<textarea value={note} onChange={e => setNote(e.target.value)} required={!approving} maxLength={2000} rows={4} disabled={history.busy} placeholder={approving ? 'This feels right…' : 'Could we adjust…'} /></label>
    {approving && <label className="design-acknowledge"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} required disabled={history.busy} /><span>I’ve reviewed version {version.number} and approve its artwork and placement.</span></label>}
    {error && <p className="client-error" role="alert">{error}</p>}
    <footer><button className="client-button" type="button" disabled={history.busy} onClick={close}>Cancel</button><button className="focus-primary" disabled={history.busy || !history.ready || (approving ? !acknowledged : !note.trim())}>{history.busy ? 'Saving…' : approving ? 'Confirm approval' : 'Save change request'}</button></footer>
  </form></FocusDialog>;
}
