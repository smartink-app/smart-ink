import type { SceneData } from '../types';
import type { ProjectRole } from '../client/model';

export type DesignDecision = { kind: 'approved' | 'changes_requested'; note: string; at: string; clientName: string };
export interface DesignVersion {
  id: string; number: number; title: string; note: string; sharedAt: string;
  sourceSceneId: string; scene: SceneData; decision: DesignDecision | null;
}
export interface DesignHistory { schema: 1; revision: number; projectId: string; clientId: string; versions: DesignVersion[] }
export const emptyHistory = (projectId: string, clientId: string): DesignHistory => ({ schema: 1, revision: 0, projectId, clientId, versions: [] });
export const versionSceneId = (projectId: string, versionId: string) => `design-version:${encodeURIComponent(projectId)}:${encodeURIComponent(versionId)}`;
export const decisionLabel = (version: DesignVersion) => version.decision?.kind === 'approved' ? 'Approved' : version.decision ? 'Changes requested' : 'Awaiting review';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const nonempty = (v: unknown, max: number) => text(v, max) && !!String(v).trim();
const date = (v: unknown) => (typeof v === 'string' || v instanceof Date) && Number.isFinite(new Date(v).getTime());
const triple = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
/** Saved images are embedded, never expiring signed URLs or mutable references. */
export const inlineImage = (v: unknown): v is string => typeof v === 'string' && v.length <= 32_000_000 && /^data:image\/(png|jpeg|webp|svg\+xml)(;[^,]*)?,.+$/s.test(v);
export function validVersionScene(v: unknown): v is SceneData {
  if (!record(v) || !nonempty(v.id, 500) || !nonempty(v.name, 300) || v.model !== 'FinalBaseMesh'
    || !inlineImage(v.decalImage) || !(v.thumbnail === null || inlineImage(v.thumbnail))
    || !['decalRotation', 'decalScale', 'decalOpacity'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
    || typeof v.decalVisible !== 'boolean' || !text(v.decalColor, 100) || !text(v.background, 100) || !text(v.lightingPreset, 100)
    || !record(v.camera) || !triple(v.camera.position) || !triple(v.camera.target) || typeof v.camera.fov !== 'number' || v.camera.fov <= 0 || v.camera.fov >= 180
    || !(v.decalPosition === null || triple(v.decalPosition)) || !(v.decalNormal === null || triple(v.decalNormal))
    || !date(v.createdAt) || !date(v.updatedAt) || v.createdBy !== '') return false;
  // Bound recursive scene payloads and reject non-finite numeric settings before review.
  const walk = (value: unknown, depth = 0): boolean => depth <= 12 && (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string' || value instanceof Date
    || typeof value === 'number' && Number.isFinite(value) || Array.isArray(value) && value.length <= 1000 && value.every(x => walk(x, depth + 1))
    || record(value) && Object.keys(value).length <= 100 && Object.values(value).every(x => walk(x, depth + 1)));
  return walk(v);
}
export function parseHistory(value: unknown, projectId: string, clientId: string): DesignHistory {
  if (!record(value) || value.schema !== 1 || !Number.isInteger(value.revision) || Number(value.revision) < 0
    || value.projectId !== projectId || value.clientId !== clientId || !Array.isArray(value.versions) || value.versions.length > 30) throw Error('The saved design history could not be read for this client. Your saved versions have been kept.');
  const ids = new Set<string>();
  for (const [index, v] of value.versions.entries()) {
    if (!record(v) || !nonempty(v.id, 100) || ids.has(String(v.id)) || v.number !== index + 1 || !nonempty(v.title, 100) || !nonempty(v.note, 2000)
      || !date(v.sharedAt) || !nonempty(v.sourceSceneId, 300) || !validVersionScene(v.scene) || v.scene.id !== versionSceneId(projectId, String(v.id))) throw Error('A saved design version could not be read. Your history has been kept.');
    if (v.decision !== null && (!record(v.decision) || !['approved', 'changes_requested'].includes(String(v.decision.kind)) || !text(v.decision.note, 2000)
      || v.decision.kind === 'changes_requested' && !String(v.decision.note).trim() || !date(v.decision.at) || !nonempty(v.decision.clientName, 100))) throw Error('A saved design decision could not be read. Your history has been kept.');
    ids.add(String(v.id));
  }
  return value as unknown as DesignHistory;
}
export function publishVersion(history: DesignHistory, role: ProjectRole, input: { id: string; title: string; note: string; scene: SceneData }, now = new Date()): DesignHistory {
  if (role !== 'artist') throw Error('Only the artist can share a new design version.');
  if (history.versions.some(v => v.id === input.id)) throw Error('This version has already been shared. Reload the history.');
  if (history.versions.length >= 30) throw Error('This demo supports up to 30 versions per project.');
  if (!nonempty(input.title.trim(), 100) || !nonempty(input.note.trim(), 2000)) throw Error('Add a version title and a note of up to 2,000 characters describing the design.');
  if (!input.scene.decalVisible || !input.scene.decalImage) throw Error('Choose a saved project with a visible tattoo before sharing.');
  const scene = structuredClone(input.scene);
  const sourceSceneId = scene.id;
  scene.id = versionSceneId(history.projectId, input.id); scene.createdBy = '';
  scene.name = `V${history.versions.length + 1} · ${input.title.trim()}`;
  if (!validVersionScene(scene)) throw Error('The design could not be captured completely. Reopen and save it in the studio, then try again.');
  const v: DesignVersion = { id: input.id, number: history.versions.length + 1, title: input.title.trim(), note: input.note.trim(), sharedAt: now.toISOString(), sourceSceneId, scene, decision: null };
  return parseHistory({ ...history, versions: [...history.versions, v] }, history.projectId, history.clientId);
}
export function decideVersion(history: DesignHistory, versionId: string, role: ProjectRole, clientId: string, decision: Omit<DesignDecision, 'at'>, now = new Date()): DesignHistory {
  if (role !== 'client' || clientId !== history.clientId) throw Error('Only this project’s client can approve or request changes.');
  const latest = history.versions.at(-1);
  if (!latest || latest.id !== versionId) throw Error('A newer version is available. Review the latest version before deciding.');
  if (latest.decision) throw Error('A decision is already recorded for this version. The artist can share a new revision.');
  if (!['approved', 'changes_requested'].includes(decision.kind) || !nonempty(decision.clientName.trim(), 100) || !text(decision.note, 2000)
    || decision.kind === 'changes_requested' && !decision.note.trim()) throw Error('Describe the changes you would like in up to 2,000 characters.');
  return { ...history, versions: history.versions.map(v => v.id === versionId ? { ...v, decision: { ...decision, note: decision.note.trim(), clientName: decision.clientName.trim(), at: now.toISOString() } } : v) };
}
/** Compare design settings, not incidental timestamps, owner IDs or preview thumbnails. */
export function designChanges(before: SceneData, after: SceneData): string[] {
  const same = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
    if (record(a) && record(b)) { const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]; return keys.every(k => same(a[k], b[k])); }
    return false;
  };
  const groups: [string, (keyof SceneData)[]][] = [
    ['Artwork', ['decalImage']], ['Tattoo size', ['decalScale']], ['Rotation', ['decalRotation']],
    ['Placement & wrap', ['surfacePlacement', 'decalPosition', 'decalNormal']], ['Ink appearance', ['decalColor', 'decalOpacity', 'decalVisible']],
    ['Body & measurements', ['bodyMeshId', 'bodyShape', 'bodyFit']], ['Pose', ['bodyPose', 'poseId']],
    ['Skin & appearance', ['skinToneId', 'bodyAppearance']], ['Studio & framing', ['lightingPreset', 'lights', 'studio', 'background', 'camera', 'bodyRegion', 'lookId']],
  ];
  return groups.filter(([, keys]) => keys.some(k => !same(before[k], after[k]))).map(([label]) => label);
}
