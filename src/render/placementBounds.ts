import * as THREE from 'three';
import { REGION_BY_INDEX, type BodyRegionId } from './bodyRegions';
import type { BodyRegionMasks } from './bodyRegionMask';
import type { SurfaceAnchor, SurfaceChart } from './surfacePlacement';

export interface InkFootprint { points: Float32Array; conservative?: boolean }
export interface BoundsAssessment { outside: number; distorted: number; valid: boolean; empty: boolean }
export interface PlacementBoundsStatus extends BoundsAssessment {
  region: BodyRegionId; locked: boolean; ready: boolean; canFit: boolean; conservative: boolean;
  limitMessage?: string;
}

/** Max-pool alpha, rather than a rectangular image outline. Keep detached ink
 * islands and thin strokes; transparent image padding never counts as ink. */
export function footprintFromPixels(rgba: ArrayLike<number>, width: number, height: number, cells = 96): InkFootprint {
  const w = Math.min(cells, width), h = Math.min(cells, height), alpha = new Uint8Array(w * h);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = Math.min(h - 1, Math.floor(y * h / height)) * w + Math.min(w - 1, Math.floor(x * w / width));
    alpha[index] = Math.max(alpha[index], rgba[(y * width + x) * 4 + 3]);
  }
  const points: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = alpha[y * w + x];
    if (a > 4) points.push((x + .5) / w - .5, .5 - (y + .5) / h, a / 255);
  }
  return { points: Float32Array.from(points) };
}

export function footprintFromImage(image: HTMLImageElement): InkFootprint {
  // Canvas readback can fail for remote images without CORS. Fall back visibly
  // to a conservative rectangular check rather than disabling the boundary.
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return footprintFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  } catch {
    return { ...footprintFromPixels(new Uint8Array(96 * 96 * 4).fill(255), 96, 96), conservative: true };
  }
}

/** Use the same signed fields as Focus, including each model's measured arm gap. */
export function areaAtAnchor(masks: BodyRegionMasks, anchor: SurfaceAnchor, geometry: THREE.BufferGeometry): BodyRegionId {
  let best = -Infinity, region: BodyRegionId = 'torso';
  for (const candidate of REGION_BY_INDEX) {
    let value = 0;
    for (let k = 0; k < 3; k++) value += masks[candidate][geometry.index?.getX(anchor.faceIndex * 3 + k) ?? anchor.faceIndex * 3 + k] * anchor.barycentric[k];
    if (value > best) { best = value; region = candidate; }
  }
  return region;
}

interface Triangle { x: number; y: number; ux: number; uy: number; vx: number; vy: number; det: number; field: number[]; distorted: boolean }
export interface PlacementDomain { at: (x: number, y: number) => { allowed: boolean; distorted: boolean } | null }

/** Spatial index in continuous tattoo coordinates. Testing ink against this
 * domain does not depend on the current camera or on visibility of the arm. */
export function createPlacementDomain(geometry: THREE.BufferGeometry, world: THREE.Matrix4, chart: SurfaceChart, field?: Float32Array): PlacementDomain {
  const triangles: Triangle[] = [], cells = new Map<string, number[]>(), large: number[] = [], cell = .04;
  const p = geometry.getAttribute('position'), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const id = (corner: number) => geometry.index?.getX(corner) ?? corner;
  for (let face = 0; face < chart.faceMask.length; face++) {
    if (chart.faceMask[face] < .5) continue;
    const ids = [id(face * 3), id(face * 3 + 1), id(face * 3 + 2)];
    const [i, j, k] = ids, x = chart.uv[i * 2], y = chart.uv[i * 2 + 1];
    const ux = chart.uv[j * 2] - x, uy = chart.uv[j * 2 + 1] - y, vx = chart.uv[k * 2] - x, vy = chart.uv[k * 2 + 1] - y;
    const det = ux * vy - uy * vx;
    if (det <= 1e-14) continue;
    a.fromBufferAttribute(p, i).applyMatrix4(world); b.fromBufferAttribute(p, j).applyMatrix4(world).sub(a); c.fromBufferAttribute(p, k).applyMatrix4(world).sub(a);
    const length = b.length(), px = c.dot(b) / length, py = Math.sqrt(Math.max(0, c.lengthSq() - px * px));
    if (length < 1e-9 || py < 1e-9) continue;
    const m00 = ux / length, m10 = uy / length, m01 = (vx - m00 * px) / py, m11 = (vy - m10 * px) / py;
    const determinant = m00 * m11 - m10 * m01, trace = m00 ** 2 + m10 ** 2 + m01 ** 2 + m11 ** 2;
    const disc = Math.sqrt(Math.max(0, trace ** 2 - 4 * determinant ** 2));
    const hi = Math.sqrt((trace + disc) / 2), lo = Math.sqrt(Math.max(0, (trace - disc) / 2));
    const triangle = { x, y, ux, uy, vx, vy, det, field: ids.map(n => field?.[n] ?? 1), distorted: lo < .60 || hi > 1.65 || hi / Math.max(lo, 1e-9) > 1.55 };
    const index = triangles.push(triangle) - 1;
    const minX = Math.floor(Math.min(x, x + ux, x + vx) / cell), maxX = Math.floor(Math.max(x, x + ux, x + vx) / cell);
    const minY = Math.floor(Math.min(y, y + uy, y + vy) / cell), maxY = Math.floor(Math.max(y, y + uy, y + vy) / cell);
    if ((maxX - minX + 1) * (maxY - minY + 1) > 1024) { large.push(index); continue; }
    for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) {
      const key = `${gx}:${gy}`, list = cells.get(key) ?? []; list.push(index); cells.set(key, list);
    }
  }
  return { at(x, y) {
    for (const index of [...(cells.get(`${Math.floor(x / cell)}:${Math.floor(y / cell)}`) ?? []), ...large]) {
      const t = triangles[index], dx = x - t.x, dy = y - t.y;
      const v = (dx * t.vy - dy * t.vx) / t.det, w = (t.ux * dy - t.uy * dx) / t.det, u = 1 - v - w;
      if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) return { allowed: t.field[0] * u + t.field[1] * v + t.field[2] * w >= 0, distorted: t.distorted };
    }
    return null;
  } };
}

export function assessPlacement(domain: PlacementDomain, ink: InkFootprint, size: number, aspect: number, rotation: number): BoundsAssessment {
  let total = 0, missing = 0, stretched = 0;
  const width = size * Math.min(aspect, 1), height = size * Math.min(1 / aspect, 1), cos = Math.cos(rotation), sin = Math.sin(rotation);
  for (let i = 0; i < ink.points.length; i += 3) {
    const x = ink.points[i] * width, y = ink.points[i + 1] * height, weight = ink.points[i + 2];
    const hit = domain.at(cos * x - sin * y, sin * x + cos * y);
    total += weight;
    if (!hit?.allowed) missing += weight;
    else if (hit.distorted) stretched += weight;
  }
  const outside = total ? missing / total : 0, distorted = total ? stretched / total : 0;
  // Tolerance absorbs sample/raster edge disagreement; exact shader clipping
  // still guarantees that ink never appears on a forbidden body region.
  return { outside, distorted, valid: total > 0 && outside <= .003 && distorted <= .01, empty: total === 0 };
}

export function fitPlacement(test: (scale: number) => BoundsAssessment, current: number): number | null {
  if (test(current).valid) return current;
  let bad = current;
  for (let scale = current; scale > .1;) {
    scale = Math.max(.1, scale * .9);
    if (test(scale).valid) {
      let good = scale;
      for (let i = 0; i < 9; i++) { const mid = (good + bad) / 2; if (test(mid).valid) good = mid; else bad = mid; }
      const rounded = Math.floor(good * 1000) / 1000;
      return test(rounded).valid ? rounded : good;
    }
    bad = scale;
  }
  return null;
}

/** Walk the requested transform so a rotation cannot jump across an invalid arc. */
export function limitPlacement(test: (value: number) => BoundsAssessment, from: number, to: number, step: number): number {
  const before = test(from), after = test(to);
  if (!before.valid) return after.valid || after.outside + after.distorted < before.outside + before.distorted ? to : from;
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  let good = from;
  for (let i = 1; i <= steps; i++) {
    let bad = from + (to - from) * i / steps;
    if (test(bad).valid) { good = bad; continue; }
    for (let j = 0; j < 8; j++) { const mid = (good + bad) / 2; if (test(mid).valid) good = mid; else bad = mid; }
    return good;
  }
  return to;
}
