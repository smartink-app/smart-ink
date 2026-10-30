import * as THREE from 'three';
import { createCameraTransition, sampleCameraTransition, type CameraView } from './cameraTransition';
import { frameTattoo, type TattooFraming } from './tattooCamera';

export type PresentMotion = 'showcase' | 'turntable' | 'still';
export const PRESENT_MOTIONS: readonly PresentMotion[] = ['showcase', 'turntable', 'still'];
/** Seconds to ease from wherever the camera is into the moving shot. */
export const PRESENT_BLEND_SECONDS = 1.8;
/** A visitor's touch pauses the motion; it resumes after this much quiet. */
export const PRESENT_RESUME_SECONDS = 6;
export const TURNTABLE_SECONDS = 36;
export const SHOWCASE_SECONDS = 16;
const SHOWCASE_KEYS = 48;

/** Orbit the camera around the vertical line through its target, as if the figure stood on a turntable. */
export function turntableCamera(base: CameraView, seconds: number): CameraView {
  const target = new THREE.Vector3(...base.target);
  const angle = (seconds / TURNTABLE_SECONDS) * Math.PI * 2;
  const offset = new THREE.Vector3(...base.position).sub(target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  return { position: target.add(offset).toArray() as CameraView['position'], target: [...base.target], fov: base.fov };
}

/** One gentle loop around the tattoo, inside the guided Shoot limits. */
export function showcaseAdjustment(seconds: number) {
  const phase = (seconds / SHOWCASE_SECONDS) * Math.PI * 2;
  return { azimuth: 24 * Math.sin(phase), elevation: 6 + 3 * Math.cos(phase), zoom: .82 + .04 * Math.cos(phase) };
}

/** Body clearance tests every posed triangle, so frame the loop once rather than every frame. */
export function showcasePath(framing: TattooFraming, aspect: number): CameraView[] {
  return Array.from({ length: SHOWCASE_KEYS }, (_, i) => frameTattoo(framing, showcaseAdjustment(i / SHOWCASE_KEYS * SHOWCASE_SECONDS), aspect));
}

/** Constant-speed sampling of a closed path; keys are close enough for linear steps. */
export function samplePath(path: CameraView[], seconds: number): CameraView {
  const position = THREE.MathUtils.euclideanModulo(seconds / SHOWCASE_SECONDS, 1) * path.length;
  const a = path[Math.floor(position) % path.length], b = path[(Math.floor(position) + 1) % path.length], t = position % 1;
  const mix = (from: number[], to: number[]) => from.map((value, i) => value + (to[i] - value) * t) as CameraView['position'];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target), fov: a.fov + (b.fov - a.fov) * t };
}

/** Ease from a still camera into a moving one without cutting through the figure. */
export function blendPresentCamera(from: CameraView, to: CameraView, seconds: number): CameraView {
  return sampleCameraTransition(createCameraTransition(from, to), seconds / PRESENT_BLEND_SECONDS);
}
