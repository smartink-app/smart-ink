import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {loadBodyPreview} from './body-shape-visual-loader.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:"export * from './src/render/focusCaps'; export * from './src/render/bodyRegionMask';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {createFocusCaps,createRegionMasks}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
for(const sex of ['male','female']) {
 const {geometry}=await loadBodyPreview(root,sex);geometry.computeBoundingBox();
 const box=geometry.boundingBox, base=geometry.attributes.position.array, saved=base.slice();
 const masks=createRegionMasks(base,{minX:box.min.x,maxX:box.max.x,minY:box.min.y,maxY:box.max.y});
 for(const [name,field] of Object.entries(masks)) {
  const caps=createFocusCaps(geometry,field);
  assert.ok(caps.attributes.position.count>0,`${sex} ${name}: cap exists`);
  assert.ok(caps.userData.closedContours>0);
  assert.equal(caps.attributes.uv.count,caps.attributes.position.count,'skin texture covers the closure');
  assert.ok([...caps.attributes.uv.array].every(v=>Number.isFinite(v)&&v>=-1e-6&&v<=1.000001));
  for(let i=0;i<caps.attributes.normal.count;i++) {
   const n=caps.attributes.normal;
   assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5,'smooth closure normals are normalized');
  }
  assert.ok([...caps.attributes.position.array,...caps.attributes.normal.array].every(Number.isFinite));
  console.log(sex,name,caps.userData.closedContours,'closed ends');caps.dispose();
 }
 assert.deepEqual(base,saved,'skin vertices and tattoo anchors are untouched');
 geometry.dispose();
}
