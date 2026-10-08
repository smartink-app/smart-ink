import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import draco3d from 'draco3d';
import * as THREE from 'three';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: "export * from './src/render/wrapPlacement';export * from './src/render/surfacePlacement';export * from './src/render/bodyRegionMask';export * from './src/render/bodyShape';export * from './src/render/bodyPose';export * from './src/render/tattooCamera';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const fixture = await fs.readFile(path.join(root,'tools/placement-face-mask.test.mjs'),'utf8');
const loadBodySource = fixture.slice(fixture.indexOf('async function loadBody('),fixture.indexOf("\nfor (const sex of ['male', 'female'])"));
const decoderModule = await draco3d.createDecoderModule({});
const loadBody = new Function('fs','assert','decoderModule','THREE',`return (${loadBodySource})`)(fs,assert,decoderModule,THREE);
for (const sex of ['male', 'female']) {
  const geo = (await loadBody(path.join(root,`public/models/body_${sex}_realistic.glb`))).toNonIndexed();
  const base = geo.attributes.position.array.slice(), atlas = geo.attributes.uv.array.slice();
  const deformable = api.prepareDeformable(geo), bounds = api.shapeBounds([deformable]);
  const masks = api.createRegionMasks(base, bounds);
  for (const region of ['armLeft', 'armRight']) {
    for (const phase of [0, 123, 360]) {
      const settings = {...api.DEFAULT_WRAP, region, phase};
      const result = api.buildWrapChart(geo,masks,settings);
      assert.ok(result,`${sex} ${region}: default band has closed skin support`);
      const {chart,anchor} = result;
      assert.ok(chart.faceMask.some(v=>v===1));
      const angles = new Set(); let seams=0;
      for (let i=0;i<chart.mask.length;i+=3) if(chart.mask[i]) {
        assert.ok([0,1,2].every(k=>masks[region][i+k]>=0),'No torso faces');
        const u=[0,1,2].map(k=>chart.uv[(i+k)*2]-phase/360);
        assert.ok(Math.max(...u)-Math.min(...u)<.15,'Seam faces use continuous coordinates, never smear across the strip');
        const v=[0,1,2].map(k=>chart.uv[(i+k)*2+1]);
        const area=(u[1]-u[0])*(v[2]-v[0])-(u[2]-u[0])*(v[1]-v[0]);
        assert.ok(area>0,'The periodic mapping has no reversed or collapsed triangles');
        if(Math.min(...u)<1&&Math.max(...u)>1)seams++;
        u.forEach(v=>angles.add(Math.floor(((v%1+1)%1)*24)));
      }
      assert.equal(angles.size,24,'Ink support covers the full circumference'); assert.ok(seams>0,'Join has supported triangles');
      const saved={...anchor,bodyMeshId:'body_full'};
      assert.ok(api.validateSurfaceAnchor(JSON.parse(JSON.stringify(saved)),geo));
      assert.equal(api.validateSurfaceAnchor({...saved,wrap:{...settings,height:NaN}},geo),false);
      geo.setAttribute('aTattooUv',new THREE.BufferAttribute(chart.uv,2));
      geo.setAttribute('aTattooMask',new THREE.BufferAttribute(chart.mask,1));
      geo.setAttribute('aTattooBoundary',new THREE.BufferAttribute(masks[region],1));
      const framing=api.tattooFramingFromGeometry(geo,new THREE.Matrix4(),saved,{size:1,aspect:6.4,rotationRad:0,wrap:true});
      assert.ok(framing?.points.length>30,'Photo camera can frame the periodic band');
    }
  }
  assert.deepEqual(geo.attributes.position.array,base,'Mapping never changes the model');
  assert.deepEqual(geo.attributes.uv.array,atlas,'Skin atlas remains unchanged');
  const coords=geo.attributes.aTattooUv.array.slice();
  api.applyBodyShape([deformable],bounds,{...api.DEFAULT_BODY_SHAPE,arms:.3});
  api.applyBodyPose([deformable],bounds,{...api.DEFAULT_BODY_POSE,leftArmLift:25,leftElbow:40});
  assert.ok(geo.attributes.position.array.every(Number.isFinite),'Shaped and posed body remains finite');
  assert.notDeepEqual(geo.attributes.position.array,base,'The fixture actually changes body shape and pose');
  assert.deepEqual(geo.attributes.aTattooUv.array,coords,'Body changes retain the continuous loop');
  let valid=0,rejected=0;
  for (const position of [.650,.665,.680,.700,.720]) for(const height of [.012,.024,.04]) {
    const result=api.buildWrapChart((await loadBody(path.join(root,`public/models/body_${sex}_realistic.glb`))).toNonIndexed(),masks,{...api.DEFAULT_WRAP,position,height});
    result ? valid++ : rejected++;
  }
  console.log(`${sex}: continuous 360° bands on both arms; ${valid} accepted / ${rejected} rejected boundary cases`);
}
console.log('Wrap placement passed: complete circumference, seam interpolation, region protection, saved settings, body attachment and camera framing.');
