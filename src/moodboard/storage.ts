import { newBoard, parseMoodboards, type MoodboardData } from './model';
export const moodboardKey = (owner: string) => `smartink:moodboards:v1:${encodeURIComponent(owner)}`;
export function loadMoodboards(owner: string): MoodboardData {
  const raw = localStorage.getItem(moodboardKey(owner));
  return raw === null ? { version: 1, revision: 0, boards: [newBoard()] } : parseMoodboards(raw);
}
export function persistMoodboards(owner: string, next: MoodboardData, revision: number): MoodboardData {
  if (loadMoodboards(owner).revision !== revision) throw Error('Your boards changed in another tab. Reload before saving; this draft is still here.');
  const data = parseMoodboards(JSON.stringify({ ...next, revision: revision + 1 }));
  const raw = JSON.stringify(data);
  if (raw.length > 3000000) throw Error('The local demo collection is full. Download your brief before starting more boards.');
  try { localStorage.setItem(moodboardKey(owner), raw); }
  catch { throw Error('Your browser could not save this board. Nothing was removed; free some browser storage and try again.'); }
  return data;
}
