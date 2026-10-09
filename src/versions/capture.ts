import type { SceneData } from '../types';
import { inlineImage } from './model';
async function captureImage(source: string | null): Promise<string | null> {
  if (!source) return null;
  if (inlineImage(source)) return source;
  const url = new URL(source, window.location.href);
  if (!['http:', 'https:', 'blob:'].includes(url.protocol)) throw Error('This image cannot be saved into a design version.');
  const response = await fetch(url.href, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('An image could not be copied. Reopen the saved design and try again.');
  const blob = await response.blob();
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(blob.type) || blob.size > 23_000_000) throw Error('Use PNG, JPG, WebP or SVG images under 23 MB for design versions.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('The design image could not be copied.')); reader.readAsDataURL(blob);
  });
  if (!inlineImage(data)) throw Error('The image could not be captured.');
  return data;
}
/** Freeze the source before awaiting image copies. No live URLs remain in saved artwork. */
export async function captureDesign(source: SceneData): Promise<SceneData> {
  const scene = structuredClone(source);
  const [artwork, thumbnail] = await Promise.all([captureImage(scene.decalImage), captureImage(scene.thumbnail)]);
  return { ...scene, decalImage: artwork, thumbnail, createdBy: '' };
}
