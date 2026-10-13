import { get, set } from 'idb-keyval';
import type { SceneData } from '../types';
import { migrateScene, type SceneStore } from '../storage/sceneStoreTypes';

let owner: string | null = null;
export function setNativeDraftOwner(value: string | null) { owner = value; }

/** Account-scoped drafts are local-first. Publishing makes an explicit cloud copy. */
export function createNativeDraftStore(read: (key: string) => Promise<SceneData[] | undefined>, write: (key: string, value: SceneData[]) => Promise<void>, account: () => string | null): SceneStore {
  let tail: Promise<unknown> = Promise.resolve();
  const key = () => {
    const id = account();
    if (!id) throw new Error('Sign in to open your iPad projects.');
    return `ipad-drafts:v1:${id}`;
  };
  const load = async (scope: string) => {
    const saved = await read(scope);
    if (saved !== undefined && !Array.isArray(saved)) throw new Error('Your iPad projects could not be read.');
    return (saved ?? []).map(migrateScene);
  };
  const mutate = (apply: (scenes: SceneData[]) => SceneData[]) => {
    const scope = key();
    const result = tail.then(async () => {
      if (scope !== key()) throw new Error('The signed-in account changed.');
      const scenes = await load(scope);
      await write(scope, apply(scenes));
    });
    tail = result.catch(() => {});
    return result;
  };
  return {
    async loadScenes() { const scope = key(); await tail; return load(scope); },
    async getScene(id) { const scope = key(); await tail; return (await load(scope)).find(s => s.id === id); },
    addScene(scene) { return mutate(scenes => {
      if (scenes.some(s => s.id === scene.id)) throw new Error('Project already exists.');
      return [...scenes, scene];
    }); },
    updateScene(scene) { return mutate(scenes => {
      if (!scenes.some(s => s.id === scene.id)) throw new Error('Project not found. Your changes are still in the editor.');
      return scenes.map(s => s.id === scene.id ? scene : s);
    }); },
    deleteScene(id) { return mutate(scenes => scenes.filter(s => s.id !== id)); },
  };
}
export const nativeDraftStore = createNativeDraftStore(get, set, () => owner);

export async function cacheSceneImages(scene: SceneData): Promise<SceneData> {
  const inline = async (source: string | null) => {
    if (!source || source.startsWith('data:') || source.startsWith('/')) return source;
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('Could not download the project artwork. Try again while connected.');
    const blob = await response.blob();
    if (blob.size > 30 * 1024 * 1024) throw new Error('Project artwork is too large.');
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not save artwork for offline use.')); reader.readAsDataURL(blob);
    });
  };
  const [decalImage, thumbnail] = await Promise.all([inline(scene.decalImage), inline(scene.thumbnail)]);
  return { ...scene, decalImage, thumbnail };
}
