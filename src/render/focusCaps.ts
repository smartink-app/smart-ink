import * as THREE from 'three';

/** Close the shader's zero-field contours without modifying skin topology/UVs.
 * Weld seam duplicates by position, then triangulate each closed boundary in
 * its projection plane. The boundary follows the posed cut; interior vertices
 * form a shallow inset with smoothly blended edge normals. */
export function createFocusCaps(geometry: THREE.BufferGeometry, field: ArrayLike<number>): THREE.BufferGeometry {
  const position = geometry.getAttribute('position'), index = geometry.index;
  const skinNormals = geometry.getAttribute('normal');
  const normals: THREE.Vector3[] = [], inward: THREE.Vector3[] = [];
  const vertices: THREE.Vector3[] = [], lookup = new Map<string, number>();
  const edges = new Map<number, Set<number>>();
  const id = (p: THREE.Vector3) => {
    const key = p.toArray().map(v => Math.round(v * 1e5)).join(':');
    let n = lookup.get(key);
    if (n === undefined) { n = vertices.length; vertices.push(p); lookup.set(key, n); }
    return n;
  };
  for (let f = 0, count = index?.count ?? position.count; f < count; f += 3) {
    const cuts: number[] = [];
    for (let e = 0; e < 3; e++) {
      const a = index?.getX(f + e) ?? f + e, b = index?.getX(f + (e + 1) % 3) ?? f + (e + 1) % 3;
      if ((field[a] >= 0) === (field[b] >= 0)) continue;
      const p = new THREE.Vector3().fromBufferAttribute(position, a);
      p.lerp(new THREE.Vector3().fromBufferAttribute(position, b), field[a] / (field[a] - field[b]));
      const vertexId = id(p);
      if (!normals[vertexId]) normals[vertexId] = skinNormals
        ? new THREE.Vector3().fromBufferAttribute(skinNormals, a).lerp(new THREE.Vector3().fromBufferAttribute(skinNormals, b), field[a] / (field[a] - field[b])).normalize()
        : new THREE.Vector3();
      inward[vertexId] = new THREE.Vector3().fromBufferAttribute(position, field[a] >= 0 ? a : b).sub(p);
      cuts.push(vertexId);
    }
    const pair = [...new Set(cuts)];
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b); edges.get(b)!.add(a);
  }
  const used = new Set<number>(), triangles: number[] = [];
  const shadingNormals: number[] = [], uvs: number[] = [];
  let loops = 0;
  for (const start of edges.keys()) {
    if (used.has(start)) continue;
    const loop: number[] = []; let current = start, previous = -1, closed = false;
    for (let step = 0; step <= edges.size; step++) {
      if (used.has(current)) { closed = current === start; break; }
      used.add(current); loop.push(current);
      const next = [...(edges.get(current) ?? [])].find(n => n !== previous);
      if (next === undefined) break;
      previous = current; current = next;
    }
    if (!closed || loop.length < 3) continue;
    const normal = new THREE.Vector3();
    for (let i = 0; i < loop.length; i++) {
      const a = vertices[loop[i]], b = vertices[loop[(i + 1) % loop.length]];
      normal.x += (a.y - b.y) * (a.z + b.z);
      normal.y += (a.z - b.z) * (a.x + b.x);
      normal.z += (a.x - b.x) * (a.y + b.y);
    }
    if (normal.lengthSq() < 1e-14) continue;
    normal.normalize();
    if (normal.dot(loop.reduce((sum, n) => sum.add(inward[n]), new THREE.Vector3())) > 0) normal.negate();
    const axis = Math.abs(normal.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right = axis.cross(normal).normalize(), up = new THREE.Vector3().crossVectors(normal, right);
    const contour = loop.map(n => new THREE.Vector2(vertices[n].dot(right), vertices[n].dot(up)));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const bounds = new THREE.Box2().setFromPoints(contour), span = bounds.getSize(new THREE.Vector2());
    const radius = Math.max(1e-5, Math.min(span.x, span.y) * .5);
    const emit = (p: THREE.Vector3) => {
      let distance = Infinity, edgeNormal = normal.clone();
      for (let i = 0; i < loop.length; i++) {
        const a = vertices[loop[i]], b = vertices[loop[(i + 1) % loop.length]];
        const edge = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(edge) / Math.max(edge.lengthSq(), 1e-15), 0, 1);
        const d = p.distanceTo(a.clone().addScaledVector(edge, t));
        if (d < distance) { distance = d; edgeNormal = normals[loop[i]].clone().lerp(normals[loop[(i + 1) % loop.length]], t).normalize(); }
      }
      const blend = THREE.MathUtils.smoothstep(distance, 0, radius * .65);
      // Preserve the exact skin boundary, with a barely recessed centre.
      triangles.push(...p.clone().addScaledVector(normal, -radius * .015 * blend).toArray());
      shadingNormals.push(...edgeNormal.lerp(normal, .65 + .35 * blend).normalize().toArray());
      uvs.push((p.dot(right) - bounds.min.x) / Math.max(span.x, 1e-5), (p.dot(up) - bounds.min.y) / Math.max(span.y, 1e-5));
    };
    const subdivide = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) => {
      if (!depth) { emit(a); emit(b); emit(c); return; }
      const ab = a.clone().lerp(b, .5), bc = b.clone().lerp(c, .5), ca = c.clone().lerp(a, .5);
      subdivide(a, ab, ca, depth - 1); subdivide(ab, b, bc, depth - 1);
      subdivide(ca, bc, c, depth - 1); subdivide(ab, bc, ca, depth - 1);
    };
    for (const [a, b, c] of faces) {
      const va = vertices[loop[a]], vb = vertices[loop[b]], vc = vertices[loop[c]];
      if (vb.clone().sub(va).cross(vc.clone().sub(va)).dot(normal) >= 0) subdivide(va, vb, vc, 3);
      else subdivide(va, vc, vb, 3);
    }
    if (faces.length) loops++;
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(shadingNormals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.userData.closedContours = loops;
  return result;
}
