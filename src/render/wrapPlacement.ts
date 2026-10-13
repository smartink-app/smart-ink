import * as THREE from 'three';
import type { BodyRegionMasks } from './bodyRegionMask';
import type { SurfaceAnchor, SurfaceChart } from './surfacePlacement';

export interface WrapSettings {
  region: 'armLeft' | 'armRight';
  /** Centre and height as fractions of the undeformed figure height. */
  position: number;
  height: number;
  phase: number;
}
export const DEFAULT_WRAP: WrapSettings = { region: 'armLeft', position: .680, height: .024, phase: 0 };
export const WRAP_ARTWORK = '/tattoos/continuous-chevron-band.svg';
export function validWrap(value: unknown): value is WrapSettings {
  if (!value || typeof value !== 'object') return false;
  const w = value as WrapSettings;
  return (w.region === 'armLeft' || w.region === 'armRight') && Number.isFinite(w.position) && w.position >= .650 && w.position <= .720
    && Number.isFinite(w.height) && w.height >= .012 && w.height <= .04 && Number.isFinite(w.phase) && Math.abs(w.phase) <= 360;
}
interface Ring { center: THREE.Vector3; points: Array<{ angle: number; arc: number }>; perimeter: number }

/** A deliberately bounded upper-arm experiment. Plane/skin intersections must
 * form one closed loop. Never bridge a gap into the torso or invent missing skin.
 * Tattoo coordinates are independent of the body's atlas and remain attached
 * through shape and pose. Only the already split per-face tattoo UVs change. */
export function buildWrapChart(geometry: THREE.BufferGeometry, masks: BodyRegionMasks, settings: WrapSettings, profile: 'band' | 'sleeve' = 'band'): { chart: SurfaceChart; anchor: Omit<SurfaceAnchor, 'bodyMeshId'>; circumference: number } | null {
  const valid = profile === 'band' ? validWrap(settings) : settings.region === 'armLeft' && Number.isFinite(settings.position) && settings.position >= .59 && settings.position <= .65
    && Number.isFinite(settings.height) && settings.height >= .1 && settings.height <= .18 && Number.isFinite(settings.phase) && Math.abs(settings.phase) <= 360;
  if (!valid || geometry.index) return null;
  const p = geometry.getAttribute('position'), field = masks[settings.region], box = new THREE.Box3().setFromBufferAttribute(p as THREE.BufferAttribute);
  const height = box.max.y - box.min.y, side = settings.region === 'armLeft' ? 1 : -1;
  const points = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i));
  function centerAt(h: number) {
    const b = new THREE.Box3();
    for (let i = 0; i < p.count; i++) if (field[i] >= 0 && Math.abs((p.getY(i) - box.min.y) / height - h) < .009) b.expandByPoint(points[i]);
    return b.isEmpty() ? null : b.getCenter(new THREE.Vector3());
  }
  const low = centerAt(profile === 'band' ? .65 : .52), high = centerAt(.705);
  if (!low || !high) return null;
  const axis = high.clone().sub(low).normalize();
  if (axis.y < .5) return null;
  const center = low.clone().addScaledVector(axis, (box.min.y + settings.position * height - low.y) / axis.y);
  const inward = new THREE.Vector3(-side, 0, 0).addScaledVector(axis, side * axis.x).normalize();
  const around = new THREE.Vector3().crossVectors(axis, inward).normalize();
  const bandHeight = settings.height * height;
  const along = points.map(point => point.clone().sub(center).dot(axis));
  const angleAt = (point: THREE.Vector3, origin: THREE.Vector3) => {
    const d = point.clone().sub(origin); return (Math.atan2(d.dot(around), d.dot(inward)) / (2 * Math.PI) + 1) % 1;
  };
  function section(s: number): Ring | null {
    const nodes = new Map<string, { point: THREE.Vector3; neighbours: Set<string> }>();
    const epsilon = height * 1e-6;
    const key = (v: THREE.Vector3) => [v.x, v.y, v.z].map(n => Math.round(n / epsilon)).join(':');
    for (let i = 0; i < p.count; i += 3) {
      if ([0, 1, 2].some(k => field[i + k] < 0)) continue;
      const hits: THREE.Vector3[] = [];
      for (let k = 0; k < 3; k++) {
        const a = i + k, b = i + (k + 1) % 3, da = along[a] - s, db = along[b] - s;
        if ((da <= 0 && db > 0) || (db <= 0 && da > 0)) hits.push(points[a].clone().lerp(points[b], da / (da - db)));
      }
      if (hits.length !== 2 || hits[0].distanceTo(hits[1]) < epsilon) continue;
      const a = key(hits[0]), b = key(hits[1]);
      if (a === b) continue;
      for (let k = 0; k < 2; k++) { const id = k ? b : a; if (!nodes.has(id)) nodes.set(id, { point: hits[k], neighbours: new Set() }); nodes.get(id)!.neighbours.add(k ? a : b); }
    }
    if (nodes.size < 12 || [...nodes.values()].some(n => n.neighbours.size !== 2)) return null;
    const seen = new Set<string>(), pending = [nodes.keys().next().value!];
    while (pending.length) { const id = pending.pop()!; if (seen.has(id)) continue; seen.add(id); pending.push(...nodes.get(id)!.neighbours); }
    if (seen.size !== nodes.size) return null;
    const bounds = new THREE.Box3().setFromPoints([...nodes.values()].map(n => n.point));
    const origin = bounds.getCenter(new THREE.Vector3());
    const ordered = [...nodes.values()].map(n => ({ point: n.point, angle: angleAt(n.point, origin), arc: 0 })).sort((a, b) => a.angle - b.angle);
    let perimeter = 0;
    for (let i = 1; i < ordered.length; i++) { perimeter += ordered[i].point.distanceTo(ordered[i - 1].point); ordered[i].arc = perimeter; }
    perimeter += ordered[0].point.distanceTo(ordered[ordered.length - 1].point);
    if (perimeter < height * .04 || perimeter > height * .4) return null;
    // Put the join exactly on the inward ray, interpolating the crossing edge.
    const last = ordered[ordered.length - 1], fraction = (1 - last.angle) / (1 + ordered[0].angle - last.angle);
    const seamArc = last.arc + fraction * (perimeter - last.arc);
    return { center: origin, perimeter, points: ordered.map(n => ({ angle: n.angle, arc: (n.arc - seamArc + perimeter) / perimeter })) };
  }
  // Support one triangle beyond each band edge to avoid clipping the band to
  // mesh edges. Multiple cross-sections reject open/branched shoulder patches.
  const extent = bandHeight * .5 + height * .008, rings: Ring[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) { const ring = section(-extent + 2 * extent * i / steps); if (!ring) return null; rings.push(ring); }
  function ringU(ring: Ring, angle: number) {
    const list = ring.points;
    for (let i = 0; i < list.length; i++) {
      const a = list[i], raw = list[(i + 1) % list.length], b = i + 1 === list.length ? { angle: raw.angle + 1, arc: raw.arc + 1 } : raw;
      const theta = angle < list[0].angle ? angle + 1 : angle;
      if (theta >= a.angle && theta <= b.angle) return a.arc + (b.arc - a.arc) * (theta - a.angle) / (b.angle - a.angle);
    }
    return angle;
  }
  const uv = new Float32Array(p.count * 2), mask = new Float32Array(p.count), faceMask = new Float32Array(p.count / 3);
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((along[i] + extent) / (2 * extent) * steps, 0, steps), lo = Math.min(steps - 1, Math.floor(t)), f = t - lo;
    const a = rings[lo], b = rings[lo + 1], origin = a.center.clone().lerp(b.center, f), angle = angleAt(points[i], origin);
    const ua = ringU(a, angle), ub = ringU(b, angle);
    const u = (ua + Math.round(angle - ua)) * (1 - f) + (ub + Math.round(angle - ub)) * f;
    uv[i * 2] = ((u % 1) + 1) % 1; uv[i * 2 + 1] = along[i] / bandHeight;
  }
  let anchorFace = -1, anchorScore = Infinity;
  for (let i = 0; i < p.count; i += 3) {
    if ([0, 1, 2].some(k => field[i + k] < 0) || Math.min(...along.slice(i, i + 3)) > extent || Math.max(...along.slice(i, i + 3)) < -extent) continue;
    const us = [uv[i * 2], uv[(i + 1) * 2], uv[(i + 2) * 2]];
    if (Math.max(...us) - Math.min(...us) > .5) for (let k = 0; k < 3; k++) if (uv[(i + k) * 2] < .5) uv[(i + k) * 2] += 1;
    for (let k = 0; k < 3; k++) uv[(i + k) * 2] += settings.phase / 360;
    mask.fill(1, i, i + 3); faceMask[i / 3] = 1;
    const midpoint = points[i].clone().add(points[i + 1]).add(points[i + 2]).multiplyScalar(1 / 3);
    // Anchor on the outward-facing side, away from the body, for photo framing.
    const score = Math.abs((along[i] + along[i + 1] + along[i + 2]) / 3) + height * Math.abs(angleAt(midpoint, center) - .5);
    if (score < anchorScore) { anchorScore = score; anchorFace = i / 3; }
  }
  if (anchorFace < 0) return null;
  return { chart: { uv, mask, faceMask, maxSize: 1 }, anchor: { faceIndex: anchorFace, barycentric: [1 / 3, 1 / 3, 1 / 3], wrap: settings,
    bounds: { region: settings.region, allowAcrossRegions: false } }, circumference: rings[steps / 2].perimeter };
}
