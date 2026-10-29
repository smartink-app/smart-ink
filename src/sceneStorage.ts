import { recordJourney } from './beta-journey/tracking';
import { nativeDraftStore } from './ipad/nativeDraftStore';
/**
 * Scene persistence, picked by the same switch as the beta gate: the hosted
 * store when Supabase is configured, the browser-local one otherwise. The
 * workspace only ever calls these functions.
 */
import { authMode } from './auth/betaAuthService';
import { localSceneStore } from './storage/localSceneStore';
import { supabaseSceneStore } from './storage/supabaseSceneStore';
import type { SceneStore } from './storage/sceneStoreTypes';
import type { SceneData } from './types';

export { migrateScene } from './storage/sceneStoreTypes';

function store(): SceneStore {
  if (typeof window !== 'undefined' && window.smartInkNativeHost === true && authMode() === 'supabase') return nativeDraftStore;
  return authMode() === 'supabase' ? supabaseSceneStore : localSceneStore;
}

export function loadScenes(): Promise<SceneData[]> {
  return store().loadScenes();
}

export async function addScene(scene: SceneData): Promise<void> {
  await store().addScene(scene);
  if (authMode() === 'demo' && scene.createdBy) void recordJourney(scene.createdBy, scene.createdBy, 'project_saved');
}

export async function updateScene(scene: SceneData): Promise<void> {
  await store().updateScene(scene);
  if (authMode() === 'demo' && scene.createdBy) void recordJourney(scene.createdBy, scene.createdBy, 'project_saved');
}

export function deleteScene(id: string): Promise<void> {
  return store().deleteScene(id);
}

export function getScene(id: string): Promise<SceneData | undefined> {
  return store().getScene(id);
}
