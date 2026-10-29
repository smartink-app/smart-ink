import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as THREE from 'three';
const {outputFiles}=await build({stdin:{contents:"export * from './src/render/closeupGeometry';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {closeupGeometry}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const plane=new THREE.PlaneGeometry(1,1);
plane.setAttribute('aTattooMask',new THREE.Float32BufferAttribute(new Float32Array(4).fill(1),1));
const original=plane.attributes.position.array.slice();
const refined=closeupGeometry(plane);
assert.equal(refined.attributes.position.count,plane.index.count*9);
assert.deepEqual(plane.attributes.position.array,original,'source anchors stay untouched');
for(let i=0;i<refined.attributes.position.count;i++){
 assert.equal(refined.attributes.position.getZ(i),0,'flat regions stay flat');
 assert.equal(refined.attributes.aTattooMask.getX(i),1);
 assert.ok(Math.abs(refined.attributes.uv.getX(i)-(refined.attributes.position.getX(i)+.5))<1e-6,'UVs follow the surface');
}
const sphere=new THREE.SphereGeometry(1,12,8);
const flat=closeupGeometry(sphere,1),smooth=closeupGeometry(sphere,3);
const sphereOriginal=sphere.toNonIndexed().attributes.position.array;
assert.ok(flat.attributes.position.array.every((v,i)=>Math.abs(v-sphereOriginal[i])<1e-7),'original vertices are stationary');
let error=0,baseline=0;
const pos=sphere.attributes.position,norm=sphere.attributes.normal;
const point=new THREE.Vector3();
for(let i=0;i<smooth.attributes.position.count;i++) {point.fromBufferAttribute(smooth.attributes.position,i);error+=Math.abs(1-point.length());assert.ok(Number.isFinite(point.length()));}
const noNormals=sphere.clone();noNormals.deleteAttribute('normal');
const linear=closeupGeometry(noNormals,3);
for(let i=0;i<linear.attributes.position.count;i++){point.fromBufferAttribute(linear.attributes.position,i);baseline+=Math.abs(1-point.length());}
assert.ok(error<baseline*.5,'curved silhouette is closer to sphere than linear subdivision');
// Matching duplicated positions on atlas seams must stay coincident.
const edges=new Map();
for(let i=0;i<smooth.attributes.position.count;i++) {
 const uv=smooth.attributes.uv; if(Math.abs(uv.getX(i))>1e-6&&Math.abs(uv.getX(i)-1)>1e-6)continue;
 point.fromBufferAttribute(smooth.attributes.position,i);const key=uv.getY(i).toFixed(6);
 if(edges.has(key))assert.ok(point.distanceTo(edges.get(key))<1e-5);else edges.set(key,point.clone());
}
assert.throws(()=>closeupGeometry(plane,99));
console.log('Close-up geometry passed: fixed source, preserved UV/masks, stationary original vertices, smoother curved silhouettes and seam continuity.');
const {loadBodyPreview}=await import('./body-shape-visual-loader.mjs');
for(const sex of ['male','female']) {
 const {geometry}=await loadBodyPreview(process.cwd(),sex);
 const source=geometry.toNonIndexed(), saved=source.attributes.position.array.slice();
 const start=performance.now(), detailed=closeupGeometry(source);
 assert.deepEqual(source.attributes.position.array,saved);
 assert.equal(detailed.attributes.position.count,source.attributes.position.count*9);
 assert.ok(detailed.attributes.position.array.every(Number.isFinite));
 console.log(`${sex}: ${detailed.attributes.position.count/3} display triangles, ${Math.round(performance.now()-start)} ms refinement.`);
 detailed.dispose();source.dispose();geometry.dispose();
}
