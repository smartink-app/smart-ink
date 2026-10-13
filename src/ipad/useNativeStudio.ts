import { useEffect, useRef } from 'react';

export type NativeCommand = { action: string; value?: unknown; key?: string; id?: string };
declare global {
  interface Window { smartInkStudio?: { command: (command: NativeCommand) => Promise<unknown> } }
}

/** One authenticated editor owns the bridge. Never expose arbitrary JS or URLs. */
export function useNativeStudio(state: Record<string, unknown>, command: (command: NativeCommand) => Promise<unknown>) {
  const latest = useRef(command);
  latest.current = command;
  useEffect(() => {
    if (window.smartInkNativeHost !== true) return;
    let active = true;
    const bridge = { async command(input: NativeCommand) {
      if (!active || !input || typeof input.action !== 'string') throw new Error('Studio unavailable.');
      return latest.current(input);
    } };
    window.smartInkStudio = bridge;
    document.documentElement.classList.add('native-studio');
    return () => {
      active = false;
      if (window.smartInkStudio === bridge) delete window.smartInkStudio;
      document.documentElement.classList.remove('native-studio');
      window.webkit?.messageHandlers?.studioState?.postMessage({ version: 1, workspace: null });
    };
  }, []);
  const serialized = JSON.stringify(state);
  useEffect(() => {
    if (window.smartInkNativeHost === true) window.webkit?.messageHandlers?.studioState?.postMessage({ version: 1, workspace: JSON.parse(serialized) });
  }, [serialized]);
}

export function boundedNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid adjustment.');
  return value;
}
export function shortName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new Error('Use a project name of 1–100 characters.');
  return value.trim();
}
export async function blobBase64(blob: Blob): Promise<string> {
  if (blob.size > 40 * 1024 * 1024) throw new Error('This image is too large to share.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}
