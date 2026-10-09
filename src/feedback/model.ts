import type { SurfaceAnchor } from '../render/surfacePlacement';
import type { CameraView } from '../render/cameraTransition';

export type ReviewRole = 'client' | 'artist';
export interface FeedbackLocation {
  anchor: Pick<SurfaceAnchor, 'bodyMeshId' | 'faceIndex' | 'barycentric'>;
  label: string;
  camera: CameraView;
}
export interface FeedbackMessage { id: string; role: ReviewRole; text: string; at: string }
export interface FeedbackThread {
  id: string;
  location: FeedbackLocation | null;
  resolved: boolean;
  messages: FeedbackMessage[];
}
export interface FeedbackData { version: 1; revision: number; threads: FeedbackThread[] }
export const emptyFeedback = (): FeedbackData => ({ version: 1, revision: 0, threads: [] });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const triple = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));
export function validLocation(v: unknown): v is FeedbackLocation {
  if (!record(v) || typeof v.label !== 'string' || !record(v.anchor) || !record(v.camera)) return false;
  const a = v.anchor, c = v.camera;
  return typeof a.bodyMeshId === 'string' && !!a.bodyMeshId && Number.isInteger(a.faceIndex) && Number(a.faceIndex) >= 0
    && triple(a.barycentric) && a.barycentric.every(n => n >= -.0001 && n <= 1.0001) && Math.abs(a.barycentric.reduce((s, n) => s + n, 0) - 1) < .001
    && triple(c.position) && triple(c.target) && typeof c.fov === 'number' && c.fov > 0 && c.fov < 180;
}
export function parseFeedback(raw: string): FeedbackData {
  const v: unknown = JSON.parse(raw);
  if (!record(v) || v.version !== 1 || !Number.isInteger(v.revision) || Number(v.revision) < 0 || !Array.isArray(v.threads) || v.threads.length > 200
    || !v.threads.every(t => record(t) && typeof t.id === 'string' && typeof t.resolved === 'boolean' && (t.location === null || validLocation(t.location))
      && Array.isArray(t.messages) && t.messages.length > 0 && t.messages.length <= 100 && t.messages.every(m => record(m) && typeof m.id === 'string'
        && (m.role === 'artist' || m.role === 'client') && typeof m.text === 'string' && !!m.text.trim() && m.text.length <= 2000 && typeof m.at === 'string' && Number.isFinite(Date.parse(m.at))))
    || new Set(v.threads.map(t => t.id)).size !== v.threads.length) {
    throw new Error('Saved feedback could not be read. It has been kept untouched.');
  }
  return v as unknown as FeedbackData;
}
function message(text: string, role: ReviewRole): FeedbackMessage {
  if (!text.trim() || text.trim().length > 2000) throw new Error('Write a comment of 1–2,000 characters.');
  if (role !== 'artist' && role !== 'client') throw new Error('Choose a review role.');
  return { id: crypto.randomUUID(), text: text.trim(), role, at: new Date().toISOString() };
}
export function addFeedback(data: FeedbackData, text: string, role: ReviewRole, location: FeedbackLocation | null): FeedbackData {
  if (data.threads.length >= 200) throw new Error('This demo supports up to 200 feedback threads per project.');
  if (location !== null && !validLocation(location)) throw new Error('Choose a point on the skin again.');
  return { ...data, threads: [...data.threads, { id: crypto.randomUUID(), location: structuredClone(location), resolved: false, messages: [message(text, role)] }] };
}
export function replyToFeedback(data: FeedbackData, id: string, text: string, role: ReviewRole): FeedbackData {
  const thread = data.threads.find(t => t.id === id);
  if (!thread) throw new Error('This feedback is no longer available.');
  if (thread.resolved) throw new Error('The artist needs to reopen this feedback before replying.');
  if (thread.messages.length >= 100) throw new Error('This thread has reached the demo reply limit.');
  const reply = message(text, role);
  return { ...data, threads: data.threads.map(t => t.id === id ? { ...t, messages: [...t.messages, reply] } : t) };
}
export function resolveFeedback(data: FeedbackData, id: string, resolved: boolean, role: ReviewRole): FeedbackData {
  if (role !== 'artist') throw new Error('Only the artist can resolve or reopen feedback.');
  if (!data.threads.some(t => t.id === id)) throw new Error('This feedback is no longer available.');
  return { ...data, threads: data.threads.map(t => t.id === id ? { ...t, resolved } : t) };
}
