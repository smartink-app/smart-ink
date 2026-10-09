import { validMoodboardSnapshot } from '../moodboard/model';
import { demoData, type ArtistData } from './model';

export const artistStorageKey = (owner: string) => `smartink:artist-demo:v1:${encodeURIComponent(owner)}`;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: Record<string, unknown>, keys: string[]) => keys.every(k => typeof v[k] === 'string');
const list = (v: unknown, check: (entry: Record<string, unknown>) => boolean) => Array.isArray(v) && v.every(e => record(e) && check(e));
/** Refuse unreadable data rather than silently replacing someone's local work. */
export function parseArtistData(raw: string): ArtistData {
  const v: unknown = JSON.parse(raw);
  if (!record(v) || v.version !== 1 || !Number.isInteger(v.revision)
    || !list(v.clients, c => strings(c, ['id', 'name', 'email', 'phone', 'notes']))
    || !list(v.bookings, b => strings(b, ['id', 'clientId', 'title', 'service', 'date', 'time', 'status', 'brief', 'notes', 'projectId']) && ['duration', 'price', 'deposit'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k])) && (b.moodboard === undefined || validMoodboardSnapshot(b.moodboard)) && typeof b.depositPaid === 'boolean' && ['requested', 'confirmed', 'completed', 'cancelled', 'declined'].includes(String(b.status)))
    || !list(v.messages, m => strings(m, ['id', 'clientId', 'text', 'at']) && ['artist', 'client'].includes(String(m.from)) && typeof m.read === 'boolean' && (m.bookingId === undefined || typeof m.bookingId === 'string'))
    || !list(v.timeOff, t => strings(t, ['id', 'date', 'start', 'end', 'label']))
    || !record(v.availability) || !strings(v.availability, ['start', 'end']) || !Array.isArray(v.availability.days) || !v.availability.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) || typeof v.availability.buffer !== 'number') {
    throw new Error('The saved artist workspace could not be read. Your data has been kept; restore it before continuing.');
  }
  return v as ArtistData;
}
export function loadArtistData(owner: string): ArtistData {
  const raw = localStorage.getItem(artistStorageKey(owner));
  return raw === null ? demoData() : parseArtistData(raw);
}
/** Persist before painting success. A stale tab may not overwrite newer edits. */
export function persistArtistData(owner: string, next: ArtistData, revision: number): ArtistData {
  const key = artistStorageKey(owner), raw = localStorage.getItem(key);
  if (raw !== null && parseArtistData(raw).revision !== revision) throw new Error('This workspace changed in another tab. Reload the workspace before saving again.');
  const saved = { ...next, revision: revision + 1 };
  localStorage.setItem(key, JSON.stringify(saved));
  return saved;
}
