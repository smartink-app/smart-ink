import * as THREE from 'three';

/** Render-only tangent-plane refinement. Source faces/anchors are never changed.
 * Shared edges use the same endpoint data, including across UV seams. */
export function closeupGeometry(source: THREE.BufferGeometry, segments = 3): THREE.BufferGeometry {
  if (!Number.isInteger(segments) || segments < 1 || segments > 4) throw new Error('Invalid detail level');
  const position = source.getAttribute('position'), normal = source.getAttribute('normal');
  const count = source.index?.count ?? position.count;
  const weights: number[][] = [];
  const weight = (i: number, j: number) => [1 - (i + j) / segments, i / segments, j / segments];
  for (let i = 0; i < segments; i++) for (let j = 0; j < segments - i; j++) {
    weights.push(weight(i,j), weight(i+1,j), weight(i,j+1));
    if (i + j < segments - 1) weights.push(weight(i+1,j), weight(i+1,j+1), weight(i,j+1));
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    const values = new Float32Array(count / 3 * weights.length * attr.itemSize);
    let offset = 0;
    for (let face = 0; face < count; face += 3) {
      const ids = [0,1,2].map(k => source.index?.getX(face+k) ?? face+k);
      for (const w of weights) for (let k = 0; k < attr.itemSize; k++) {
        values[offset++] = ids.reduce((sum, id, corner) => sum + attr.getComponent(id,k) * w[corner], 0);
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
  }
  if (normal) {
    const p = new THREE.Vector3(), projected = new THREE.Vector3(), delta = new THREE.Vector3();
    const vertices = [new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
    const normals = vertices.map(() => new THREE.Vector3());
    const target = out.getAttribute('position') as THREE.BufferAttribute;
    let index = 0;
    for (let face = 0; face < count; face += 3) {
      for (let k = 0; k < 3; k++) {
        const id = source.index?.getX(face+k) ?? face+k;
        vertices[k].fromBufferAttribute(position,id); normals[k].fromBufferAttribute(normal,id).normalize();
      }
      for (const w of weights) {
        p.fromBufferAttribute(target,index); projected.set(0,0,0);
        for (let k = 0; k < 3; k++) {
          const distance = delta.copy(p).sub(vertices[k]).dot(normals[k]);
          projected.addScaledVector(normals[k], -distance * w[k]);
        }
        p.addScaledVector(projected,.7); target.setXYZ(index++,p.x,p.y,p.z);
      }
    }
    out.normalizeNormals();
  }
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
