import { blobBase64 } from './useNativeStudio';
import type { RenderContract } from '../render/contract';
import type { CloudRenderOptions } from '../services/cloudRenderService';

declare global {
  interface Window {
    smartInkRenderReply?: (id: string, result: { base64?: string; error?: string }) => void;
  }
}
const waiting = new Map<string, (result: { base64?: string; error?: string }) => void>();

/** Native background uploads outlive the web viewport; the native library owns their results. */
export async function renderOnIPad(contract: RenderContract, ink: Blob, options: CloudRenderOptions = {}): Promise<string> {
  const id = crypto.randomUUID();
  const base64 = await blobBase64(ink);
  options.signal?.throwIfAborted();
  window.smartInkRenderReply ??= (id, result) => waiting.get(id)?.(result);
  options.onStatusChange?.('uploading', 'Sending your shot…');
  return new Promise((resolve, reject) => {
    const clean = () => { waiting.delete(id); options.signal?.removeEventListener('abort', abort); };
    // Closing a composition detaches its viewer. The app retains the job and finished image.
    const abort = () => { clean(); reject(new DOMException('View closed. Check the native render library for the job.', 'AbortError')); };
    waiting.set(id, result => {
      clean();
      if (result.error || !result.base64) { reject(new Error(result.error || 'Render unavailable.')); return; }
      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      options.onStatusChange?.('done', 'Photo saved on this iPad.');
      resolve(URL.createObjectURL(new Blob([bytes], { type: 'image/png' })));
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    window.webkit?.messageHandlers?.studioState?.postMessage({ version: 1, renderRequest: { id, contract, base64 } });
    options.onStatusChange?.('rendering', 'Rendering with Blender. You can find this job in Saved renders.');
  });
}
