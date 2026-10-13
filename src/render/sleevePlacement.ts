import * as THREE from 'three';
import { buildSurfaceChart, type SurfaceAnchor, type SurfaceChart, type SurfaceTopology } from './surfacePlacement';
import { buildWrapChart } from './wrapPlacement';
import type { BodyRegionMasks } from './bodyRegionMask';
import { validSleeve, SLEEVE_IDS, type SleeveSettings, type SleeveSectionId } from './sleeveTypes';
import { tattooFramingFromGeometry, type TattooFraming } from './tattooCamera';

export interface SleeveLayer { data: Float32Array; anchor: SurfaceAnchor }
export interface SleeveComposition { layers: Record<SleeveSectionId, SleeveLayer>; anchor: SurfaceAnchor }
type BaseCharts = { charts: Record<SleeveSectionId, SurfaceChart>; anchors: Record<SleeveSectionId, SurfaceAnchor>; worldHeight: number };
// The fitted rest surface is immutable. Slider edits reuse the expensive charts.
const baseCharts = new WeakMap<THREE.BufferGeometry, Map<string, BaseCharts>>();
const scratchMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

/** Three independently editable charts. Only ink coordinates change; the body
 * atlas, positions, face order and skin material keep their existing contract. */
export function buildSleeveComposition(geometry: THREE.BufferGeometry, topology: SurfaceTopology, masks: BodyRegionMasks,
  matrix: THREE.Matrix4, bodyMeshId: string, settings: SleeveSettings): SleeveComposition | null {
  if (!validSleeve(settings) || geometry.index) return null;
  const p = geometry.getAttribute('position'), box = new THREE.Box3().setFromBufferAttribute(p as THREE.BufferAttribute);
  const height = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2;
  const worldHeight = height * new THREE.Vector3().setFromMatrixScale(matrix).y;
  const cacheKey = `${bodyMeshId}:${worldHeight}`;
  const cache = baseCharts.get(geometry) ?? new Map<string, BaseCharts>();
  let base = cache.get(cacheKey);
  if (!base) {
  const arm = buildWrapChart(geometry, masks, { region: 'armLeft', position: .617, height: .15, phase: 0 }, 'sleeve');
  if (!arm) return null;
  const mesh = new THREE.Mesh(geometry, scratchMaterial);
  function hitAt(x: number, h: number, outer: boolean): SurfaceAnchor | null {
    const origin = new THREE.Vector3(outer ? box.max.x + height : cx + height * x, box.min.y + height * h, outer ? 0 : box.max.z + height);
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(outer ? -1 : 0, 0, outer ? 0 : -1));
    const hit = ray.intersectObject(mesh)[0];
    if (!hit?.face || hit.faceIndex == null) return null;
    const tri = new THREE.Triangle(...[hit.face.a, hit.face.b, hit.face.c].map(i => new THREE.Vector3().fromBufferAttribute(p, i)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    const barycentric = tri.getBarycoord(hit.point, new THREE.Vector3());
    return barycentric ? { bodyMeshId, faceIndex: hit.faceIndex, barycentric: barycentric.toArray() as [number, number, number] } : null;
  }
  const shoulderAnchor = hitAt(.13, .758, true), chestAnchor = hitAt(.09, .77, false);
  if (!shoulderAnchor || !chestAnchor) return null;
  const shoulder = buildSurfaceChart(topology, geometry, matrix, shoulderAnchor, worldHeight * .14);
  const chest = buildSurfaceChart(topology, geometry, matrix, chestAnchor, worldHeight * .12);
  if (!shoulder || !chest) return null;
  const charts: Record<SleeveSectionId, SurfaceChart> = { arm: arm.chart, shoulder, chest };
  const anchors: Record<SleeveSectionId, SurfaceAnchor> = { arm: { ...arm.anchor, bodyMeshId, wrap: undefined }, shoulder: shoulderAnchor, chest: chestAnchor };
  base = { charts, anchors, worldHeight }; cache.set(cacheKey, base); baseCharts.set(geometry, cache);
  }
  const { charts, anchors } = base;
  const layers = {} as SleeveComposition['layers'];
  for (const id of SLEEVE_IDS) {
    const chart = charts[id], section = settings.sections[id], data = new Float32Array(p.count * 4);
    const size = worldHeight * (id === 'shoulder' ? .22 : .16) * section.scale;
    const c = Math.cos(section.rotation * Math.PI / 180), s = Math.sin(section.rotation * Math.PI / 180);
    for (let i = 0; i < p.count; i++) {
      const h = (p.getY(i) - box.min.y) / height, x = (p.getX(i) - cx) / height;
      let u: number, v: number;
      if (id === 'arm') { u = chart.uv[i * 2] + section.x + section.rotation / 360; v = chart.uv[i * 2 + 1] / section.scale - section.y; }
      else { u = (c * chart.uv[i * 2] + s * chart.uv[i * 2 + 1]) / size + .5 - section.x; v = (-s * chart.uv[i * 2] + c * chart.uv[i * 2 + 1]) / size - section.y; }
      const allowed = id === 'arm' ? masks.armLeft[i] : id === 'shoulder'
        ? Math.min(masks.armLeft[i], h - .665, .855 - h, x - .035)
        : Math.min(masks.torso[i], h - .68, .855 - h, x - .01);
      // A reversible trim cuts the design's outside edge, independently of its
      // transform. At zero, retain the complete scalloped transparent outline.
      const trim = id === 'arm' ? v + .5 - section.trim : 1 - u - section.trim;
      data.set([u, v, section.visible && chart.faceMask[Math.floor(i / 3)] > .5 ? 1 : 0, Math.min(allowed, trim)], i * 4);
    }
    layers[id] = { data, anchor: anchors[id] };
  }
  const selected = anchors[settings.active];
  return { layers, anchor: { ...selected, sleeve: settings, bounds: { region: settings.active === 'chest' ? 'torso' : 'armLeft', allowAcrossRegions: true } } };
}

export function sleeveLayerGeometry(geometry: THREE.BufferGeometry, data: Float32Array, periodic: boolean): THREE.BufferGeometry {
  // Read-only view of posed attributes, owned only for this synchronous framing.
  const view = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) view.setAttribute(name, attribute);
  const uv = new Float32Array(data.length / 2), mask = new Float32Array(data.length / 4), boundary = mask.slice();
  for (let i = 0; i < mask.length; i++) { uv[i * 2] = data[i * 4] - (periodic ? 0 : .5); uv[i * 2 + 1] = data[i * 4 + 1]; mask[i] = data[i * 4 + 2]; boundary[i] = data[i * 4 + 3]; }
  view.setAttribute('aTattooUv', new THREE.BufferAttribute(uv, 2)); view.setAttribute('aTattooMask', new THREE.BufferAttribute(mask, 1)); view.setAttribute('aTattooBoundary', new THREE.BufferAttribute(boundary, 1));
  return view;
}
export function sleeveFraming(geometry: THREE.BufferGeometry, world: THREE.Matrix4, composition: SleeveComposition, selected?: SleeveSectionId): TattooFraming | null {
  const frames = (selected ? [selected] : [...SLEEVE_IDS]).map(id => {
    const layer = composition.layers[id], view = sleeveLayerGeometry(geometry, layer.data, id === 'arm');
    const result = tattooFramingFromGeometry(view, world, layer.anchor, { size: 1, aspect: 1, rotationRad: 0, wrap: id === 'arm' });
    // Do not dispose this view: its body attributes are borrowed from the live mesh.
    return result;
  }).filter((f): f is TattooFraming => !!f);
  if (!frames.length) return null;
  if (selected) return frames[0];
  const pts = Float32Array.from(frames.flatMap(f => Array.from(f.points))), center = new THREE.Vector3();
  const bounds = new THREE.Box3(); for (let i = 0; i < pts.length; i += 3) bounds.expandByPoint(new THREE.Vector3().fromArray(pts, i)); bounds.getCenter(center);
  // Aim at the front/outside shoulder so all three sections read together.
  const normal = new THREE.Vector3(.65, .08, 1).normalize(), target = center.toArray() as [number, number, number];
  return { ...frames[0], center: target, normal: normal.toArray() as [number, number, number], up: [0, 1, 0], points: pts, radius: bounds.getSize(new THREE.Vector3()).length() / 2 };
}

export function attachSleeveToGeometry(geometry: THREE.BufferGeometry, composition: SleeveComposition): SurfaceChart {
  const data = composition.layers.arm.data, count = data.length / 4;
  const uv = new Float32Array(count * 2), mask = new Float32Array(count), boundary = new Float32Array(count), faceMask = new Float32Array(count / 3);
  for (let i = 0; i < count; i++) { uv[i * 2] = data[i * 4]; uv[i * 2 + 1] = data[i * 4 + 1]; mask[i] = data[i * 4 + 2]; boundary[i] = data[i * 4 + 3]; }
  for (let face = 0; face < faceMask.length; face++) faceMask[face] = mask[face * 3];
  geometry.setAttribute('aTattooUv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aTattooMask', new THREE.BufferAttribute(mask, 1));
  geometry.setAttribute('aTattooBoundary', new THREE.BufferAttribute(boundary, 1));
  geometry.setAttribute('aSleeveShoulder', new THREE.BufferAttribute(composition.layers.shoulder.data, 4));
  geometry.setAttribute('aSleeveChest', new THREE.BufferAttribute(composition.layers.chest.data, 4));
  return { uv, mask, faceMask, maxSize: 1 };
}
