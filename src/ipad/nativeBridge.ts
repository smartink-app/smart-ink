import { MAX_TATTOO_BYTES } from '../utils/tattooUpload';

declare global {
  interface Window {
    smartInkNativeHost?: boolean;
    smartInkNativeArtwork?: { importArtwork: (payload: unknown) => Promise<void> };
    webkit?: { messageHandlers?: { studioState?: { postMessage: (value: unknown) => void } } };
  }
}

/** Only file bytes cross this bridge. URLs and JavaScript are never accepted. */
export function nativeArtworkFile(payload: unknown): File {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid artwork.');
  const { name, base64 } = payload as Record<string, unknown>;
  if (typeof name !== 'string' || !name.toLowerCase().endsWith('.png') || name.length > 255
      || typeof base64 !== 'string' || !base64.length || base64.length > 4 * Math.ceil(MAX_TATTOO_BYTES / 3)
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error('Choose a PNG artwork file up to 20 MB.');
  }
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  if (bytes.length > MAX_TATTOO_BYTES) throw new Error('Choose a PNG artwork file up to 20 MB.');
  return new File([bytes], name.replace(/[/\\]/g, '_'), { type: 'image/png' });
}

export function reportNativeStudio(editing: boolean): void {
  if (window.smartInkNativeHost === true) {
    window.webkit?.messageHandlers?.studioState?.postMessage({ version: 1, editing });
  }
}
