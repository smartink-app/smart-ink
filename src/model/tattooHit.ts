import * as THREE from 'three';
import type { SurfaceAnchor } from '../render/surfacePlacement';

/** Hit-test the same surface chart, aspect, rotation and valid-face mask as the shader. */
export function isTattooHit(geometry: THREE.BufferGeometry, anchor: SurfaceAnchor, size: number, aspect: number, rotation: number): boolean {
  if (!(size > 0) || !(aspect > 0)) return false;
  const uv = geometry.getAttribute('aTattooUv'), mask = geometry.getAttribute('aTattooMask');
  if (!uv || !mask) return false;
  let x = 0, y = 0, coverage = 0;
  for (let k = 0; k < 3; k++) {
    const corner = anchor.faceIndex * 3 + k, index = geometry.index?.getX(corner) ?? corner;
    if (index >= uv.count) return false;
    const weight = anchor.barycentric[k];
    x += uv.getX(index) * weight; y += uv.getY(index) * weight; coverage += mask.getX(index) * weight;
  }
  if (coverage < .9999) return false;
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return Math.abs(c * x + s * y) <= size * Math.min(aspect, 1) / 2
    && Math.abs(-s * x + c * y) <= size * Math.min(1 / aspect, 1) / 2;
}

export function tattooAnchorPoint(mesh: THREE.Mesh, anchor: SurfaceAnchor, target: THREE.Vector3): THREE.Vector3 {
  const positions = mesh.geometry.getAttribute('position'), corner = new THREE.Vector3();
  target.set(0, 0, 0);
  for (let k = 0; k < 3; k++) {
    const index = mesh.geometry.index?.getX(anchor.faceIndex * 3 + k) ?? anchor.faceIndex * 3 + k;
    corner.fromBufferAttribute(positions, index);
    target.addScaledVector(corner, anchor.barycentric[k]);
  }
  return mesh.localToWorld(target);
}
