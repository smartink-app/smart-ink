import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadScenes, addScene, deleteScene, updateScene } from './sceneStorage';
import { FINAL_SAMPLES } from './render/registry';
import type { SceneData } from './types';
import type { BetaSession } from './auth/types';
import { authMode } from './auth/betaAuthService';
import AccountSettings from './AccountSettings';
import StudioRail, { type StudioSection } from './StudioRail';
import ArtistPanel from './artist/ArtistPanel';
import FocusDialog from './FocusDialog';
import TattooLibrary from './TattooLibrary';
import RenderHistoryModal from './RenderHistoryModal';
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
}

export default function ScenesDashboard({ onSelectScene, onOpenLanding, session, onSignOut, onResume, initialSection = 'projects' }: Props) {
  const [section, setSection] = useState<StudioSection>(initialSection);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [rendersOpen, setRendersOpen] = useState(false);
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
    const q = searchQuery.trim().toLowerCase();
    const recent = [...scenes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (!q) return recent;
    return recent.filter((s) => s.name.toLowerCase().includes(q));
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
      <StudioRail active={rendersOpen ? 'renders' : section} studioAvailable={!!onResume} onHome={() => onOpenLanding?.()}
        onNavigate={next => {
          if (next === 'studio') { onResume?.(); return; }
          if (next === 'renders') { setRendersOpen(true); return; }
          setSection(next);
        }} />
      <div className="main-content focus-dashboard-content">
        {authMode() === 'demo' && <p className="focus-local-note">Local preview · Projects and uploads are saved in this browser.</p>}
        {section === 'artist' ? <ArtistPanel key={session.userId ?? session.email} owner={session.userId ?? session.email} scenes={scenes} onOpenProject={openScene} /> : section === 'account' ? <AccountSettings session={session} onSignOut={onSignOut} /> : section === 'artwork' ? <>
          <header className="focus-page-heading"><div><p className="focus-eyebrow">Your collection</p><h1>Artwork</h1><p>Keep your designs close. Choose one to start a project.</p></div></header>
          <div className="focus-library-page"><TattooLibrary currentImage={draftArtwork} onChoose={source => { setDraftArtwork(source); setNewProjectOpen(true); }} /></div>
        </> : <>
        <header className="focus-page-heading">
          <div><p className="focus-eyebrow">Your workspace</p><h1>Projects</h1><p>A space for every idea. Pick up where you left off.</p></div>
          <button type="button" className="focus-primary" onClick={() => { setDraftArtwork(null); setProjectName(''); setNewProjectOpen(true); }} disabled={unavailable}><FiPlus aria-hidden />New project</button>
        </header>
        <div className="focus-project-tools">
          <span>{loading ? 'Loading projects…' : `${scenes.length} ${scenes.length === 1 ? 'project' : 'projects'}`}</span>
          <label className="search-box"><FiSearch aria-hidden /><input type="search" placeholder="Search projects" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} aria-label="Search projects" /></label>
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
                <button type="button" className="focus-primary" onClick={() => setNewProjectOpen(true)}><FiPlus aria-hidden />Create your first project</button>
              </>
            ) : (
              <>No projects match your search.</>
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
        <p className="focus-muted">Choose a starting view. Every body and setting stays editable.</p>
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
      {rendersOpen && <RenderHistoryModal onClose={() => setRendersOpen(false)} />}
    </div>
  );
}
