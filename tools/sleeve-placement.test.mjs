import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import draco3d from 'draco3d';
import * as THREE from 'three';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: "export * from './src/render/sleevePlacement';export * from './src/render/sleeveTypes';export * from './src/render/wrapPlacement';export * from './src/render/surfacePlacement';export * from './src/render/bodyRegionMask';export * from './src/render/bodyShape';export * from './src/render/bodyPose';export * from './src/render/tattooCamera';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const fixture = await fs.readFile(path.join(root,'tools/placement-face-mask.test.mjs'),'utf8');
const loadBodySource = fixture.slice(fixture.indexOf('async function loadBody('),fixture.indexOf("\nfor (const sex of ['male', 'female'])"));
const decoderModule = await draco3d.createDecoderModule({});
const loadBody = new Function('fs','assert','decoderModule','THREE',`return (${loadBodySource})`)(fs,assert,decoderModule,THREE);
for (const sex of ['male','female']) {
 const geo = (await loadBody(path.join(root,`public/models/body_${sex}_realistic.glb`))).toNonIndexed();
 const positions=geo.attributes.position.array.slice(),atlas=geo.attributes.uv.array.slice();
 const d=api.prepareDeformable(geo),bounds=api.shapeBounds([d]),masks=api.createRegionMasks(positions,bounds),topology=api.createSurfaceTopology(geo);
 const settings=structuredClone(api.DEFAULT_SLEEVE);
 const result=api.buildSleeveComposition(geo,topology,masks,new THREE.Matrix4(),'body_full',settings);
 assert.ok(result,`${sex}: three connected sleeve sections are supported`);
 assert.equal(api.validSleeve({...settings, sections:{...settings.sections,chest:{...settings.sections.chest,scale:NaN}}}),false);
 assert.ok(api.validateSurfaceAnchor(JSON.parse(JSON.stringify(result.anchor)),geo));
 for(const id of api.SLEEVE_IDS){
   const layer=result.layers[id];assert.ok(layer.data.every(Number.isFinite));
   assert.ok(layer.data.some((v,i)=>i%4===2&&v===1),`${sex} ${id} has skin support`);
   const framing=api.sleeveFraming(geo,new THREE.Matrix4(),result,id);assert.ok(framing?.points.length>30,`${sex} ${id} can be framed`);
 }
 const arm=result.layers.arm.data, angles=new Set();
 for(let i=0;i<arm.length;i+=12)if(arm[i+2]){
   const u=[arm[i],arm[i+4],arm[i+8]],v=[arm[i+1],arm[i+5],arm[i+9]];
   assert.ok(Math.max(...u)-Math.min(...u)<.2,'sleeve join never interpolates across the full texture');
   assert.ok((u[1]-u[0])*(v[2]-v[0])-(u[2]-u[0])*(v[1]-v[0])>0,'sleeve has no collapsed or reversed mapped faces');
   u.forEach(x=>angles.add(Math.floor(((x%1+1)%1)*24)));
 }
 assert.equal(angles.size,24,'long arm section covers the full circumference');
 api.attachSleeveToGeometry(geo,result);
 assert.deepEqual(geo.attributes.position.array,positions);assert.deepEqual(geo.attributes.uv.array,atlas);
 settings.sections.chest.x=.1;settings.sections.chest.trim=.2;
 const edited=api.buildSleeveComposition(geo,topology,masks,new THREE.Matrix4(),'body_full',settings);
 assert.deepEqual(edited.layers.arm.data,result.layers.arm.data);assert.deepEqual(edited.layers.shoulder.data,result.layers.shoulder.data);assert.notDeepEqual(edited.layers.chest.data,result.layers.chest.data);
 settings.sections.chest.visible=false;
 const hidden=api.buildSleeveComposition(geo,topology,masks,new THREE.Matrix4(),'body_full',settings);
 assert.ok(hidden.layers.chest.data.every((v,i)=>i%4!==2||v===0));
 const ink=geo.attributes.aSleeveShoulder.array.slice();
 api.applyBodyShape([d],bounds,{...api.DEFAULT_BODY_SHAPE,arms:.3});
 api.applyBodyPose([d],bounds,{...api.DEFAULT_BODY_POSE,leftArmLift:25,leftElbow:40});
 assert.notDeepEqual(geo.attributes.position.array,positions);assert.deepEqual(geo.attributes.aSleeveShoulder.array,ink);
 console.log(`${sex}: composition, independent edits, framing, visibility, save validation, body attachment passed`);
}
