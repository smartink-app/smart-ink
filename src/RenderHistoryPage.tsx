import { useCallback, useEffect, useState } from 'react';
import { REGISTRY, findById } from './render/registry';
import {
  canShareRenders,
  clearRenderHistory,
  createRenderShareLink,
  deleteRenderHistory,
  getRenderImageBlob,
  listRenderHistory,
  type RenderHistoryEntry,
} from './renderHistoryStorage';

interface RenderHistoryPageProps {
  onOpenStudio: () => void;
  studioAvailable?: boolean;
}

function formatSource(entry: RenderHistoryEntry): string {
  if (entry.source === 'cycles') {
    const tier = entry.qualityTier === 'final' ? 'Final' : 'Preview';
    return `Photo · ${tier}`;
  }
  return entry.exportPreset ? `Export · ${entry.exportPreset}` : 'Image export';
}

function formatMeta(entry: RenderHistoryEntry): string {
  const parts = [`${entry.width}×${entry.height}`];
  if (entry.sceneName) parts.push(entry.sceneName);
  if (entry.lookId) {
    const look = findById(REGISTRY.looks, entry.lookId);
    if (look) parts.push(look.label);
  }
  return parts.join(' · ');
}

export default function RenderHistoryPage({ onOpenStudio, studioAvailable = false }: RenderHistoryPageProps) {
  const [entries, setEntries] = useState<RenderHistoryEntry[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageWarning, setImageWarning] = useState('');
  const [mutating, setMutating] = useState(false);
  const [share, setShare] = useState<{ id: string; text: string; url?: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareable = canShareRenders();

  const handleShare = async (entry: RenderHistoryEntry) => {
    setSharing(true);
    setShare(null);
    try {
      const { url, expiresAt } = await createRenderShareLink(entry.id);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }
      const until = new Date(expiresAt).toLocaleDateString();
      setShare({
        id: entry.id,
        url,
        text: `${copied ? 'Link copied.' : 'Link ready.'} Anyone with it can view this render until ${until}.`,
      });
    } catch (e) {
      setShare({ id: entry.id, text: e instanceof Error ? e.message : 'Could not create a share link.' });
    } finally {
      setSharing(false);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listRenderHistory();
      setEntries(list);
      setSelectedId((previous) => list.some((entry) => entry.id === previous) ? previous : list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load render history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const urls: Record<string, string> = {};

    void (async () => {
      const results = await Promise.allSettled(
        entries.map(async (entry) => {
          const blob = await getRenderImageBlob(entry.id);
          if (!blob) throw new Error('This saved image is unavailable.');
          if (!cancelled) {
            urls[entry.id] = URL.createObjectURL(blob);
          }
        })
      );
      if (!cancelled) {
        setImageWarning(results.some((result) => result.status === 'rejected') ? 'Some images could not be loaded. The other renders are still available.' : '');
        setThumbUrls((prev) => {
          Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
          return urls;
        });
      }
    })();

    return () => {
      cancelled = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [entries]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const selectedUrl = selected ? thumbUrls[selected.id] : null;

  const handleDelete = async (id: string) => {
    if (mutating || !window.confirm('Delete this saved render?')) return;
    setMutating(true);
    try { await deleteRenderHistory(id); await refresh(); }
    catch (e) { setImageWarning(e instanceof Error ? e.message : 'Could not delete this render. Please retry.'); }
    finally { setMutating(false); }
  };

  const handleClearAll = async () => {
    if (mutating || !window.confirm('Delete all saved renders? This cannot be undone.')) return;
    setMutating(true);
    try { await clearRenderHistory(); await refresh(); }
    catch (e) { setImageWarning(e instanceof Error ? e.message : 'Could not clear history. Please retry.'); }
    finally { setMutating(false); }
  };

  const handleDownload = (entry: RenderHistoryEntry) => {
    const url = thumbUrls[entry.id];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-ink-${entry.source}-${entry.createdAt}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <section className="renders-page" aria-label="Saved renders">
      <header className="focus-page-heading"><div><p className="focus-eyebrow">Your output</p><h1>Renders</h1><p>Your finished images, ready to review, download and share.</p></div><button type="button" className="focus-primary" onClick={onOpenStudio}>{studioAvailable ? 'Back to studio' : 'Open projects'}</button></header>
      <div className="render-history-card">
        <p className="render-history-desc">
          {shareable
            ? 'Photos and exported images are saved to your account (up to 100). Create a viewing link when you’re ready to share.'
            : 'Photos and exported images stay in this browser (up to 40). Online sharing is available with a hosted account.'}
        </p>

        {loading && <p className="render-history-empty">Loading…</p>}
        {error && <p className="render-history-error" role="alert">{error} <button type="button" onClick={() => void refresh()}>Retry</button></p>}
        {imageWarning && <p className="editor-feedback-warning" role="status">{imageWarning} <button type="button" onClick={() => void refresh()}>Reload images</button></p>}
        {!loading && !error && entries.length === 0 && (
          <div className="empty-scenes"><h2>Your next finished piece belongs here.</h2><p>Open a project, then open Shoot to create a photo or save a quick export.</p><button type="button" className="focus-primary" onClick={onOpenStudio}>{studioAvailable ? 'Back to studio' : 'Browse projects'}</button></div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            {selected && selectedUrl && (
              <div className="render-history-preview">
                <img src={selectedUrl} alt="Selected render" />
                <div className="render-history-preview-meta">
                  <div>
                    <strong>{formatSource(selected)}</strong>
                    <span>{new Date(selected.createdAt).toLocaleString()}</span>
                  </div>
                  <span>{formatMeta(selected)}</span>
                </div>
                <div className="render-history-preview-actions">
                  <button type="button" className="focus-primary" onClick={() => handleDownload(selected)}>
                    Download
                  </button>
                  <button
                    type="button"
                    className="ep-btn"
                    disabled={!shareable || sharing}
                    title={shareable ? 'Copy a read-only link' : 'Share links need the hosted backend'}
                    onClick={() => void handleShare(selected)}
                  >
                    {sharing ? 'Creating link…' : 'Share link'}
                  </button>
                  <button
                    type="button"
                    className="ep-btn"
                    disabled={mutating}
                    onClick={() => void handleDelete(selected.id)}
                  >
                    Delete
                  </button>
                </div>
                {share && share.id === selected.id && (
                  <p className="render-history-share" role="status">
                    {share.text}
                    {share.url && (
                      <>
                        {' '}
                        <a href={share.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="render-history-grid">
              {entries.map((entry) => {
                const url = thumbUrls[entry.id];
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`render-history-thumb${entry.id === selectedId ? ' render-history-thumb--active' : ''}`}
                    onClick={() => setSelectedId(entry.id)}
                    title={new Date(entry.createdAt).toLocaleString()}
                  >
                    {url ? (
                      <img src={url} alt="" />
                    ) : (
                      <span className="render-history-thumb-placeholder">…</span>
                    )}
                    <span className="render-history-thumb-label">{formatSource(entry)}</span>
                  </button>
                );
              })}
            </div>

            <div className="render-history-footer">
              <button type="button" className="ep-btn" disabled={mutating}
                  onClick={() => void handleClearAll()}>
                Clear all
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
