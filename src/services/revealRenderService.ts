import type { RenderContract } from '../render/contract';
import { revealSettings, type RevealPreset } from '../render/reveal';
import { getRenderTargetLabel, getRenderUrl, usesRunpodGateway } from './cloudRenderService';

export interface RevealCapabilities { supported: boolean; message: string; durationSeconds?: number; fps?: number; maxDimension?: number }
export interface RevealJob {
  id: string; status: 'preparing' | 'rendering' | 'encoding' | 'complete' | 'failed' | 'cancelled';
  frame: number; totalFrames: number; message: string; preset: RevealPreset;
  createdAt: string; updatedAt: string; downloadUrl?: string;
}
const base = () => getRenderUrl().replace(/\/$/, '');
function localOnly() {
  if (usesRunpodGateway() || getRenderTargetLabel() !== 'local') throw new Error('Motion export is available on the local studio renderer only.');
}
async function checked(response: Response) {
  if (!response.ok) {
    let message = `Motion request failed (${response.status}).`;
    try { const body = await response.json(); if (typeof body.detail === 'string') message = body.detail; } catch { /* keep HTTP error */ }
    throw new Error(message);
  }
  return response;
}
export async function getRevealCapabilities(signal?: AbortSignal): Promise<RevealCapabilities> {
  if (usesRunpodGateway() || getRenderTargetLabel() !== 'local') return { supported: false, message: 'Motion export is being tested locally. Cloud export is not enabled yet.' };
  try {
    const response = await checked(await fetch(`${base()}/health`, { signal }));
    const body = await response.json();
    if (!body.ready) return { supported: false, message: body.message ?? 'The local renderer is not ready.' };
    return body.capabilities?.video ?? { supported: false, message: 'Restart the local renderer to enable motion export.' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { supported: false, message: 'The local motion renderer is offline.' };
  }
}
export async function submitReveal(contract: RenderContract, ink: Blob, preset: RevealPreset, signal?: AbortSignal): Promise<RevealJob> {
  localOnly();
  const max = Math.max(contract.output.width, contract.output.height);
  const scale = Math.min(1, 1280 / max);
  const dimension = (v: number) => Math.max(64, 2 * Math.floor(v * scale / 2));
  const width = dimension(contract.output.width), height = dimension(contract.output.height);
  const bounded: RenderContract = { ...contract, inkTextureUrl: 'ink.png', reveal: revealSettings(preset),
    camera: { ...contract.camera, preserveFraming: true, aspect: width / height },
    output: { qualityTier: 'final', width, height, samples: 64 } };
  const form = new FormData();
  form.append('contract', new Blob([JSON.stringify(bounded)], { type: 'application/json' }), 'contract.json');
  form.append('ink_layer', ink, 'ink.png');
  return (await checked(await fetch(`${base()}/video-jobs`, { method: 'POST', body: form, signal }))).json();
}
export async function getRevealJob(id: string, signal?: AbortSignal): Promise<RevealJob> {
  localOnly();
  return (await checked(await fetch(`${base()}/video-jobs/${encodeURIComponent(id)}`, { signal, cache: 'no-store' }))).json();
}
export async function cancelReveal(id: string): Promise<RevealJob> {
  localOnly();
  return (await checked(await fetch(`${base()}/video-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }))).json();
}
export function revealOutputUrl(id: string): string { localOnly(); return `${base()}/video-jobs/${encodeURIComponent(id)}/output`; }
