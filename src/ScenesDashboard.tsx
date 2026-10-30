import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadScenes, addScene, deleteScene, updateScene } from './sceneStorage';
import { FINAL_SAMPLES } from './render/registry';
import type { SceneData } from './types';
import type { BetaSession } from './auth/types';
import { authMode } from './auth/betaAuthService';
import AccountSettings from './AccountSettings';
import StudioRail, { type StudioSection } from './StudioRail';
import ArtistPanel from './artist/ArtistPanel';
import ClientProjectSpace from './client/ClientProjectSpace';
import type { ProjectRole } from './client/model';
import FocusDialog from './FocusDialog';
import TattooLibrary from './TattooLibrary';
import RenderHistoryPage from './RenderHistoryPage';
import { FiSearch, FiPlus, FiArrowUpRight, FiEdit2, FiTrash2 } from 'react-icons/fi';
import './dashboard.css';
import TemplatePreviewRenderer from './TemplatePreviewRenderer';
import { SCENE_TEMPLATES, templatePreviewCache, type TemplatePreview } from './sceneTemplates';

interface Props {
  onSelectScene: (scene: SceneData) => void;
  onOpenLanding?: () => void;
  session: BetaSession;
  onSignOut: () => void;
  onResume?: () => void;
  initialSection?: StudioSection;
  initialClientProject?: string; initialClientRole?: ProjectRole; initialVersionId?: string;
  onReviewScene?: (scene: SceneData, projectId: string, role: ProjectRole, versionId?: string) => void;
  onMoodboard?: () => void;
  onExplore?: () => void;
}

export default function ScenesDashboard({ onSelectScene, onOpenLanding, session, onSignOut, onResume, initialSection = 'projects', initialClientProject, initialClientRole = 'client', initialVersionId, onReviewScene, onMoodboard, onExplore }: Props) {
  const clientDraft = useRef(false);
  const receiveClientDraft = useCallback((dirty: boolean) => { clientDraft.current = dirty; }, []);
  const canLeaveClient = () => !clientDraft.current || window.confirm('Leave without saving your message draft?');
  const [clientProjectId, setClientProjectId] = useState(initialClientProject);
  const [clientRole, setClientRole] = useState<ProjectRole>(initialClientRole);
  const [artistBooking, setArtistBooking] = useState<string | undefined>();
  const [section, setSection] = useState<StudioSection>(initialSection);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [draftArtwork, setDraftArtwork] = useState<string | null>(null);
  const [template, setTemplate] = useState('blank');
  const templates = SCENE_TEMPLATES;
  const [previews, setPreviews] = useState<Record<string, TemplatePreview>>(() => ({ ...templatePreviewCache }));
  const [previewError, setPreviewError] = useState(false);
  const receivePreview = useCallback((id: string, preview: TemplatePreview) => {
    setPreviews((previous) => ({ ...previous, [id]: preview }));
  }, []);
  const failPreview = useCallback(() => setPreviewError(true), []);
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const mounted = useRef(false);
  const mutating = useRef(false);
  const loadingRef = useRef(false);
  const cancelledRename = useRef(false);

  const refreshScenes = useCallback(async () => {
    if (loadingRef.current || mutating.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    setLoadError(false);
    try {
      const loaded = await loadScenes();
      if (mounted.current) setScenes(loaded);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? `Could not load scenes: ${e.message}` : 'Could not load scenes. Please try again.');
        setLoadError(true);
      }
    } finally {
      loadingRef.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshScenes();
    return () => { mounted.current = false; };
  }, [refreshScenes]);

  const runMutation = async (key: string, action: string, work: () => Promise<void>) => {
    // A ref closes the double-click gap before React paints the disabled UI.
    // Serializing mutations also protects the local store's read/write cycle.
    if (mutating.current || loadingRef.current || loadError) return;
    mutating.current = true;
    setBusy(key);
    setError('');
    setLoadError(false);
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError(`Could not ${action}. ${e instanceof Error ? e.message : 'Please try again.'}`);
    } finally {
      mutating.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const unavailable = loading || busy !== null || loadError;
  const openScene = (scene: SceneData) => {
    if (!mutating.current && !loadingRef.current) onSelectScene(scene);
  };

  const filteredScenes = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const recent = [...scenes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (!q.length) return recent;
    return recent.filter((s) => q.every(term => s.name.toLocaleLowerCase().includes(term)));
  }, [scenes, searchQuery]);

  const handleNewScene = () => {
    if (mutating.current || loadingRef.current || loadError) return;
    const newScene: SceneData = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: projectName.trim() || (template === 'blank' ? 'Untitled project' : `${templates.find((item) => item.id === template)?.label} preview`),
      bodyRegion: templates.find((item) => item.id === template)?.region ?? null,
      model: 'FinalBaseMesh',
      decalImage: draftArtwork,
      decalRotation: 0,
      decalScale: 1,
      decalColor: '#ffffff',
      decalOpacity: 1,
      decalVisible: draftArtwork !== null,
      decalPosition: null,
      decalNormal: null,
      lightingPreset: 'studio',
      background: 'dark',
      studio: { mode: 'sweep', color: '#30343c', shadow: .4, showGuides: false },
      thumbnail: previews[template]?.image ?? null,
      camera: previews[template]?.camera ?? {
        position: [6, 4, 6],
        target: [0, 0, 0],
        fov: 45,
      },
      bodyMeshId: 'body_full',
      skinToneId: 'tone_03',
      poseId: 'neutral',
      lookId: 'studio_softbox',
      qualityTier: 'preview',
      finalSamples: FINAL_SAMPLES.default,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: session.userId ?? session.email,
    };
    void runMutation('create', 'create the scene', async () => {
      await addScene(newScene);
      if (mounted.current) {
        setScenes((previous) => [...previous, newScene]);
        onSelectScene(newScene);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (mutating.current || loadingRef.current || loadError) return;
    const name = scenes.find((scene) => scene.id === id)?.name ?? 'this scene';
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    void runMutation(`delete:${id}`, 'delete the scene', async () => {
      await deleteScene(id);
      if (mounted.current) setScenes((previous) => previous.filter((scene) => scene.id !== id));
    });
  };

  const handleNameClick = (scene: SceneData) => {
    if (mutating.current || loadingRef.current || loadError) return;
    cancelledRename.current = false;
    setEditingId(scene.id);
    setEditValue(scene.name);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  const handleNameBlur = (scene: SceneData) => {
    if (cancelledRename.current) { cancelledRename.current = false; return; }
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== scene.name) {
      const updated = { ...scene, name: trimmed, updatedAt: new Date() };
      void runMutation(`rename:${scene.id}`, 'rename the scene', async () => {
        await updateScene(updated);
        if (mounted.current) {
          setScenes((previous) => previous.map((item) => item.id === updated.id ? updated : item));
          setEditingId(null);
        }
      });
    } else setEditingId(null);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      cancelledRename.current = true;
      setEditingId(null);
    }
  };

  const formatUpdated = (d: Date) => {
    try {
      const date = d instanceof Date ? d : new Date(d);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };


  return (
    <div className="dashboard">
      <StudioRail active={section} studioAvailable={!!onResume} onHome={() => { if (canLeaveClient()) onOpenLanding?.(); }}
        onExplore={onExplore ? () => { if (canLeaveClient()) onExplore(); } : undefined}
        onNavigate={next => {
          if (next === section) return;
          if (!canLeaveClient()) return;
          if (next === 'studio') { onResume?.(); return; }
          setSection(next);
        }} />
      <div key={section} className="main-content focus-dashboard-content workspace-page-enter">
        {authMode() === 'demo' && <p className="focus-local-note">Local preview · Projects and uploads are saved in this browser.</p>}
        {(section === 'client' || section === 'artist') && <div className="workspace-area-nav">
          <p className="focus-eyebrow">Clients <span>Preview</span></p>
          <nav aria-label="Client workspace views">
            <button type="button" aria-current={section === 'artist' ? 'page' : undefined} onClick={() => { if (canLeaveClient()) setSection('artist'); }}>Artist desk</button>
            <button type="button" aria-current={section === 'client' ? 'page' : undefined} onClick={() => setSection('client')}>Client space</button>
          </nav>
        </div>}
        {section === 'renders' ? <RenderHistoryPage studioAvailable={!!onResume} onOpenStudio={() => onResume ? onResume() : setSection('projects')} /> : section === 'client' ? <ClientProjectSpace key={session.userId ?? session.email} owner={session.userId ?? session.email} feedbackOwner={session.email} scenes={scenes} scenesLoading={loading} scenesError={loadError ? error : ''}
          onDirtyChange={receiveClientDraft} initialProjectId={clientProjectId} initialRole={clientRole} initialVersionId={clientProjectId === initialClientProject ? initialVersionId : undefined} onMoodboard={() => onMoodboard?.()}
          onDesk={id => { setArtistBooking(id); setSection('artist'); }}
          onReview={(scene, projectId, role, versionId) => { if (versionId) onReviewScene?.(scene, projectId, role, versionId); else if (!unavailable) onReviewScene?.(scene, projectId, role); }} />
          : section === 'artist' ? <ArtistPanel key={session.userId ?? session.email} owner={session.userId ?? session.email} scenes={scenes} initialBookingId={artistBooking} onOpenProject={openScene}
            onClientSpace={id => { setClientProjectId(id); setClientRole('artist'); setSection('client'); }} /> : section === 'account' ? <AccountSettings session={session} onSignOut={onSignOut} /> : section === 'artwork' ? <>
          <header className="focus-page-heading"><div><p className="focus-eyebrow">Your collection</p><h1>Artwork</h1><p>Designs ready to place on the body. Upload, browse, and start a project.</p></div>{onMoodboard && <button type="button" className="ep-btn" onClick={onMoodboard}>Open moodboards <FiArrowUpRight aria-hidden /></button>}</header><p className="artwork-context">Looking for inspiration? Keep references and ideas in Moodboards; keep your ready-to-use designs here.</p>
          <div className="focus-library-page"><TattooLibrary context="library" currentImage={draftArtwork} onChoose={source => { setDraftArtwork(source); setProjectName(''); setNewProjectOpen(true); }} /></div>
        </> : <>
        <header className="focus-page-heading">
          <div><p className="focus-eyebrow">Your workspace</p><h1>Projects</h1><p>A space for every idea. Pick up where you left off.</p></div>
          <button type="button" className="focus-primary" onClick={() => { setDraftArtwork(null); setTemplate('blank'); setProjectName(''); setNewProjectOpen(true); }} disabled={unavailable}><FiPlus aria-hidden />New project</button>
        </header>
        <div className="project-template-entry"><div><strong>Start with a little direction.</strong><p>Try a body template with starter artwork, then make it your own.</p></div><button type="button" className="ep-btn" disabled={unavailable} onClick={() => { setTemplate('arm'); setDraftArtwork('/tattoos/starter-2026/peony.png'); setProjectName('Peony placement study'); setNewProjectOpen(true); }}>Start from a template <FiArrowUpRight aria-hidden /></button></div>
        <div className="focus-project-tools">
          <span role="status">{loading ? 'Loading projects…' : searchQuery.trim() ? `${filteredScenes.length} of ${scenes.length} projects` : `${scenes.length} ${scenes.length === 1 ? 'project' : 'projects'}`}</span>
          <label className="search-box"><FiSearch aria-hidden /><input type="search" placeholder={scenes.length ? "Search projects" : "Create a project to start searching"} disabled={!scenes.length || loading} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} aria-label="Search projects" /></label>{searchQuery && <button type="button" className="ep-btn" onClick={() => setSearchQuery('')}>Clear search</button>}
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: 14, border: '1px solid #a94e59', borderRadius: 10, color: 'var(--focus-error)' }}>
            {error}
            {loadError && <button type="button" className="btn-open" style={{ marginLeft: 12 }} onClick={() => void refreshScenes()} disabled={loading || busy !== null}>Retry</button>}
          </div>
        )}
        {loading && <p role="status">Loading scenes…</p>}
        {busy && <p role="status">{busy === 'create' ? 'Creating scene…' : busy.startsWith('delete:') ? 'Deleting scene…' : 'Saving scene name…'}</p>}

        <section aria-labelledby="recent-title" className="recent-section">
        <h2 id="recent-title" className="focus-sr-only">Recent projects</h2>
        {loading || loadError ? null : filteredScenes.length === 0 ? (
          <div className="empty-scenes">
            {scenes.length === 0 ? (
              <>
                <span className="focus-empty-icon" aria-hidden><FiEdit2 /></span>
                <h3>Start with an idea.</h3><p>Choose a body, place your artwork, and explore how it feels.</p>
                <button type="button" className="focus-primary" onClick={() => { setTemplate('blank'); setDraftArtwork(null); setProjectName(''); setNewProjectOpen(true); }}><FiPlus aria-hidden />Create your first project</button>
              </>
            ) : (
              <><h3>No matching projects.</h3><p>No project names match “{searchQuery.trim()}”. Try another name.</p><button type="button" className="ep-btn" onClick={() => setSearchQuery('')}>Show all projects</button></>
            )}
          </div>
        ) : (
          <div className="file-grid">
            {filteredScenes.map((scene) => (
              <div key={scene.id} className="file-card">
                <div
                  className="file-thumb"
                  role="button"
                  tabIndex={unavailable ? -1 : 0}
                  aria-disabled={unavailable}
                  aria-label={`Open ${scene.name}`}
                  onClick={() => openScene(scene)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openScene(scene); } }}
                  style={{ cursor: 'pointer' }}
                >
                  {scene.thumbnail ? (
                    <img
                      src={scene.thumbnail}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '2rem', opacity: 0.15 }}>◇</span>
                  )}
                </div>
                <div className="file-info">
                  {editingId === scene.id ? (
                    <input
                      className="scene-name-input"
                      value={editValue}
                      onChange={handleNameChange}
                      onBlur={() => handleNameBlur(scene)}
                      onKeyDown={handleNameKeyDown}
                      disabled={unavailable}
                      aria-label="Scene name"
                      autoFocus
                    />
                  ) : (
                    <button type="button"
                      className="file-name"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleNameClick(scene)}
                      title="Click to rename"
                    >
                      {scene.name} <FiEdit2 aria-hidden />
                    </button>
                  )}
                  <div className="file-edited">
                    Updated {formatUpdated(scene.updatedAt)}
                  </div>
                </div>
                <div className="file-card-actions">
                  <button type="button" className="btn-open" onClick={() => openScene(scene)} disabled={unavailable}>
                    Open studio <FiArrowUpRight aria-hidden />
                  </button>
                  <button type="button" className="btn-delete" onClick={() => handleDelete(scene.id)} disabled={unavailable}>
                    <FiTrash2 aria-hidden /><span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </section>
        </>}
      </div>
      {newProjectOpen && <FocusDialog title="New project" wide onClose={() => { if (!busy) setNewProjectOpen(false); }}>
        <p className="focus-muted">Choose a starting view. Every body and setting stays editable.</p>{draftArtwork && <div className="project-artwork-preview"><img src={draftArtwork} alt="Artwork for this project" /><p>Your artwork is ready. Click the skin in the studio to place it.</p></div>}
        <label className="focus-name-label">Project name<input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="e.g. Rose sleeve exploration" maxLength={100} disabled={!!busy} /></label>
        <section className="template-section" aria-labelledby="templates-title">
          <h2 id="templates-title">Start with a view</h2>
          <p>The full body is always available in the studio.</p>
          <div className="template-grid" role="group" aria-label="Scene template">
            {templates.map((item) => <button key={item.id} type="button" className="template-card" aria-pressed={template === item.id} disabled={unavailable} onClick={() => setTemplate(item.id)}>
              <span className="template-art">
                {previews[item.id] ? <img src={previews[item.id].image} alt={`${item.label} scene preview`} /> : <span className="template-loading">{previewError ? 'Preview unavailable' : 'Preparing scene preview…'}</span>}
              </span>
              <span className="template-label">{item.label}<span aria-hidden>{template === item.id ? '✓' : ''}</span></span>
              <span className="template-detail">{item.detail}</span>
            </button>)}
          </div>
          {!previewError && <TemplatePreviewRenderer onPreview={receivePreview} onError={failPreview} />}
          {previewError && <p className="template-preview-error">Some previews could not load. <button type="button" onClick={() => setPreviewError(false)}>Retry previews</button></p>}
        </section>

        {error && <p role="alert" className="focus-error">{error}</p>}
        <footer className="focus-dialog-actions"><button type="button" className="ep-btn" onClick={() => setNewProjectOpen(false)} disabled={!!busy}>Cancel</button><button type="button" className="focus-primary" onClick={handleNewScene} disabled={unavailable}>{busy === 'create' ? 'Creating…' : 'Create project'}</button></footer>
      </FocusDialog>}
    </div>
  );
}
