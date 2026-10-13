import * as THREE from 'three';
import type { CameraView } from './cameraTransition';

export type RevealPreset = 'reveal' | 'orbit';
export interface RevealSettings { version: 1; preset: RevealPreset; durationSeconds: 4; fps: 24 }
export const REVEAL_PRESETS = [
  { id: 'reveal' as const, name: 'Slow reveal', description: 'A gentle pull-back from your composed shot.' },
  { id: 'orbit' as const, name: 'Small orbit', description: 'A restrained 12° arc around the tattoo.' },
];
export function revealSettings(preset: RevealPreset): RevealSettings {
  return { version: 1, preset, durationSeconds: 4, fps: 24 };
}
/** Mirrored in smartink-live/revealRender.py. No body or light animation.
 * Blender checks every camera position against the actual posed geometry.
 */
export function revealCamera(base: CameraView, preset: RevealPreset, progress: number): CameraView {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const target = new THREE.Vector3(...base.target);
  const offset = new THREE.Vector3(...base.position).sub(target);
  if (preset === 'reveal') offset.multiplyScalar(1 + .12 * eased);
  else offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-6 + 12 * eased));
  return { ...base, position: target.clone().add(offset).toArray() as [number, number, number], target: [...base.target] };
}
