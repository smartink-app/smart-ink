import { useEffect, useId, useRef, useState } from 'react';
import { removeWhite } from './render/removeWhite.mjs';
import { resolveTattooSource } from './render/tattooSource';
import { loadTattooLibrary, rememberTattoo } from './storage/tattooLibrary';
import { MAX_TATTOO_DIMENSION, MAX_TATTOO_PIXELS } from './utils/tattooUpload';

type Props = { source: string | null; disabled?: boolean; onChange: (source: string | null) => void };
export default function WhiteBackgroundControls({ source, disabled = false, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [cleanup, setCleanup] = useState(2);
  const [original, setOriginal] = useState<string | null>(null);
  const [pixels, setPixels] = useState<ImageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [error, setError] = useState('');
  const preview = useRef<HTMLCanvasElement>(null);
  const current = useRef({ source, disabled });
  current.current = { source, disabled };
  const request = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const pending = request;
    setOpen(false); setPixels(null); setOriginal(null); setError(''); setBusy(false);
    request.current++; setRecovering(true);
    void loadTattooLibrary().then(items => {
      if (cancelled) return;
      const asset = items.find(item => item.source === source);
      setOriginal(asset?.originalSource ?? null);
      setCleanup(asset?.paperCleanup ?? 2);
    }).catch(() => {}).finally(() => { if (!cancelled) setRecovering(false); });
    return () => { cancelled = true; pending.current++; };
  }, [source]);

  useEffect(() => {
    if (!open || !pixels || !preview.current) return;
    const canvas = preview.current;
    canvas.width = pixels.width; canvas.height = pixels.height;
    canvas.getContext('2d')?.putImageData(new ImageData(removeWhite(pixels.data, cleanup), pixels.width, pixels.height), 0, 0);
  }, [open, pixels, cleanup]);

  async function begin() {
    const token = ++request.current;
    setError(''); setBusy(true);
    try {
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.src = original ?? resolveTattooSource(source);
      await image.decode();
      if (token !== request.current) return;
      if (image.naturalWidth > MAX_TATTOO_DIMENSION || image.naturalHeight > MAX_TATTOO_DIMENSION || image.naturalWidth * image.naturalHeight > MAX_TATTOO_PIXELS) throw new Error('This image is too large. Use a PNG up to 8192 pixels and 32 megapixels.');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 700 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image preview is unavailable.');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setPixels(ctx.getImageData(0, 0, canvas.width, canvas.height)); setOpen(true);
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : 'Could not open this artwork.'); }
    finally { if (token === request.current) setBusy(false); }
  }

  async function apply() {
    const token = ++request.current;
    const before = source;
    const originalSource = original ?? resolveTattooSource(source);
    setBusy(true); setError('');
    try {
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = originalSource;
      await image.decode();
      if (token !== request.current || current.current.disabled) return;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image processing is unavailable.');
      ctx.drawImage(image, 0, 0);
      const input = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.putImageData(new ImageData(removeWhite(input.data, cleanup), canvas.width, canvas.height), 0, 0);
      const result = canvas.toDataURL('image/png');
      await rememberTattoo(result, 'Artwork · white removed', { originalSource, paperCleanup: cleanup });
      if (token !== request.current || current.current.source !== before || current.current.disabled) return;
      onChange(result); setOpen(false);
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : 'Could not remove the white background.'); }
    finally { if (token === request.current) setBusy(false); }
  }

  return <div className="white-removal">
    <button type="button" className="ep-btn ep-btn--block" disabled={disabled || busy || recovering} onClick={() => void begin()}>{busy ? 'Preparing artwork…' : original ? 'Adjust white removal' : 'Remove white background'}</button>
    {original && <button type="button" className="ep-btn ep-btn--block ep-btn--ghost" disabled={disabled || busy || recovering} onClick={() => onChange(original)}>Restore original artwork</button>}
    {open && <div className="white-removal-editor" aria-label="White background removal">
      <p className="ep-hint">For black and gray artwork on white. Colors become black ink; light shading becomes transparent.</p>
      <div className="white-removal-previews">
        <figure><img src={original ?? resolveTattooSource(source)} alt="Original artwork before white removal" /><figcaption>Original</figcaption></figure>
        <figure><div className="white-removal-checker"><canvas ref={preview} aria-label="Transparent artwork preview" /></div><figcaption>Transparent</figcaption></figure>
      </div>
      <label className="ep-hint" htmlFor={id}>Paper cleanup · {cleanup}%</label>
      <input id={id} type="range" min="0" max="20" step="0.5" value={cleanup} disabled={busy || disabled} onChange={e => setCleanup(Number(e.target.value))} />
      <p className="ep-hint">Increase to clear off-white paper. Lower it to preserve faint detail. Your original is kept in this browser.</p>
      <button type="button" className="ep-btn ep-btn--block" disabled={busy || disabled || !pixels} onClick={() => void apply()}>Apply to tattoo</button>
      <button type="button" className="ep-btn ep-btn--block ep-btn--ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </div>}
    {error && <p className="ep-hint ep-upload-error" role="alert">{error}</p>}
  </div>;
}
