export type InspirationKind = 'image' | 'link' | 'note';
export interface Inspiration {
  id: string; kind: InspirationKind; title: string; note: string;
  image: string; url: string; removed?: boolean;
}
export interface Moodboard {
  id: string; title: string; brief: string; placement: string; size: string; items: Inspiration[];
}
export interface MoodboardSnapshot extends Moodboard { artistId: string; artistName: string; capturedAt: string }
export interface MoodboardData { version: 1; revision: number; boards: Moodboard[] }
export function newBoard(title = 'My next tattoo'): Moodboard {
  return { id: crypto.randomUUID(), title, brief: '', placement: '', size: '', items: [] };
}
export function safeReferenceUrl(value: string): string {
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw Error('Use a full link beginning with https:// or http://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || value.length > 2000) throw Error('Use a public http or https link without sign-in details.');
  return url.href;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
export const safeImage = (v: unknown): v is string => typeof v === 'string' && v.length <= 240000 && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^\/(tattoos|renders)\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$/.test(v));
function validItem(v: unknown): v is Inspiration {
  if (!record(v) || !text(v.id, 100) || !text(v.title, 120) || !String(v.title).trim() || !text(v.note, 2000) || !text(v.url, 2000) || (v.removed !== undefined && typeof v.removed !== 'boolean')) return false;
  try { safeReferenceUrl(String(v.url)); } catch { return false; }
  return v.kind === 'image' ? safeImage(v.image) : (v.kind === 'note' && !!String(v.note).trim() || v.kind === 'link' && !!v.url) && v.image === '';
}
export function validBoard(v: unknown): v is Moodboard {
  return record(v) && text(v.id, 100) && text(v.title, 100) && !!String(v.title).trim() && text(v.brief, 3000) && text(v.placement, 100) && text(v.size, 100)
    && Array.isArray(v.items) && v.items.length <= 48 && v.items.every(validItem) && v.items.filter(i => !i.removed).length <= 24 && new Set(v.items.map(i => i.id)).size === v.items.length;
}
export function validMoodboardSnapshot(v: unknown): v is MoodboardSnapshot {
  return validBoard(v) && record(v) && text(v.artistId, 100) && text(v.artistName, 100) && typeof v.capturedAt === 'string' && Number.isFinite(Date.parse(v.capturedAt));
}
export function parseMoodboards(raw: string): MoodboardData {
  const v: unknown = JSON.parse(raw);
  if (!record(v) || v.version !== 1 || !Number.isInteger(v.revision) || Number(v.revision) < 0 || !Array.isArray(v.boards) || v.boards.length < 1 || v.boards.length > 12 || !v.boards.every(validBoard)
    || new Set(v.boards.map(b => b.id)).size !== v.boards.length) throw Error('Your saved moodboards could not be read. They have been kept untouched.');
  return v as unknown as MoodboardData;
}
export function updateBoard(data: MoodboardData, board: Moodboard): MoodboardData {
  if (!validBoard(board)) throw Error('Check the board title, notes and reference details.');
  if (JSON.stringify(board).length > 1200000) throw Error('This board is full. Start another board for more image references.');
  if (!data.boards.some(b => b.id === board.id) && data.boards.length >= 12) throw Error('This demo supports up to 12 moodboards.');
  return { ...data, boards: data.boards.some(b => b.id === board.id) ? data.boards.map(b => b.id === board.id ? board : b) : [...data.boards, board] };
}
export function addInspiration(board: Moodboard, item: Inspiration): Moodboard {
  const next = { ...item, title: item.title.trim(), note: item.note.trim(), url: safeReferenceUrl(item.url) };
  if (!validItem(next)) throw Error('Add a title and a valid image, link or note.');
  if (board.items.length >= 48) throw Error('Start another board for more references.');
  if (board.items.filter(i => !i.removed).length >= 24) throw Error('Keep up to 24 references on each board.');
  return { ...board, items: [...board.items, next] };
}
export function snapshotBoard(board: Moodboard, artist: { id: string; name: string }): MoodboardSnapshot {
  if (!validBoard(board) || !board.items.some(i => !i.removed)) throw Error('Add at least one reference before creating a request.');
  return structuredClone({ ...board, items: board.items.filter(i => !i.removed), artistId: artist.id, artistName: artist.name, capturedAt: new Date().toISOString() });
}
