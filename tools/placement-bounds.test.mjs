import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformSync } from 'esbuild';
import ts from 'typescript';
import draco3d from 'draco3d';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: "export * from './src/render/wrapPlacement';export * from './src/render/placementBounds';export * from './src/render/surfacePlacement';export * from './src/render/bodyRegionMask';export * from './src/render/bodyShape';export * from './src/model/tattooHit';export * from './src/render/tattooCamera';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const identity = new THREE.Matrix4();
const pixels = (w, h, ink) => { const data = new Uint8Array(w*h*4); for(let y=0;y<h;y++) for(let x=0;x<w;x++) data[(y*w+x)*4+3] = ink(x,y)?255:0; return data; };
const solid = api.footprintFromPixels(pixels(64,64,()=>true),64,64);
const padded = api.footprintFromPixels(pixels(64,64,(x,y)=>x>=24&&x<40&&y>=24&&y<40),64,64);
const empty = api.footprintFromPixels(new Uint8Array(64*64*4),64,64);
const patch = new THREE.PlaneGeometry(2,2).toNonIndexed();
const chart = { uv: patch.attributes.position.array.filter((_,i)=>i%3!==2), mask: new Float32Array(6).fill(1), faceMask: new Float32Array(2).fill(1), maxSize: 1 };
const field = Float32Array.from({length:6},(_,i)=>.3-patch.attributes.position.getX(i));
const domain = api.createPlacementDomain(patch,identity,chart,field);
const check = (scale, ink=solid, angle=0, aspect=1) => api.assessPlacement(domain,ink,scale,aspect,angle);
assert.equal(check(1).valid,false,'Opaque ink crosses a signed region boundary');
assert.equal(check(1,padded).valid,true,'Transparent margins are ignored');
assert.equal(check(1,empty).empty,true);
assert.equal(check(1,empty).valid,false,'Empty artwork cannot produce a fitted design');
assert.equal(check(1,solid,0,.2).valid,true,'Narrow artwork fits');
assert.equal(check(1,solid,Math.PI/2,.2).valid,false,'Rotation uses the actual aspect-correct footprint');
const fit = api.fitPlacement(v=>check(v),1);
assert.ok(fit>.58&&fit<.63); assert.equal(check(fit).valid,true);
const limited = api.limitPlacement(v=>check(v),.3,1,.05);
assert.ok(limited>.58&&limited<.63); assert.equal(check(limited).valid,true,'Scale stops at the last valid size');
assert.equal(api.limitPlacement(v=>check(v),1,1.2,.05),1,'Invalid old placements cannot get worse');
assert.equal(api.limitPlacement(v=>check(v),1,.5,.05),.5,'Invalid old placements can recover');
const turn = api.limitPlacement(v=>check(1,solid,v,.2),0,Math.PI/2,.08);
assert.ok(turn>0&&turn<Math.PI/2); assert.equal(check(1,solid,turn,.2).valid,true);
assert.equal(api.assessPlacement(api.createPlacementDomain(patch,identity,chart),solid,1,1,0).valid,true,'Across-regions restores available skin');
const stretchedChart = {...chart,uv:Float32Array.from(chart.uv,v=>v*3)};
assert.ok(api.assessPlacement(api.createPlacementDomain(patch,identity,stretchedChart),solid,1,1,0).distorted>.9,'Severe metric stretching is separate from missing ink');
const islands = api.footprintFromPixels(pixels(64,64,(x,y)=>(x<12||x>52)&&y>20&&y<40),64,64);
assert.ok(islands.points.length>0,'Disconnected artwork remains valid artwork');

// Decode the same shipped real-body fixtures as the existing placement tests.
const fixture = await fs.readFile(path.join(root,'tools/placement-face-mask.test.mjs'),'utf8');
const loadBodySource = fixture.slice(fixture.indexOf('async function loadBody('),fixture.indexOf("\nfor (const sex of ['male', 'female'])"));
const decoderModule = await draco3d.createDecoderModule({});
const loadBody = new Function('fs','assert','decoderModule','THREE',`return (${loadBodySource})`)(fs,assert,decoderModule,THREE);
const modelSource = await fs.readFile(path.join(root,'src/ModelWithUVTattoo.tsx'),'utf8');
const ast = ts.createSourceFile('Model.tsx',modelSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function callback(name,scope) {
  let expression;
  function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name) expression=n.initializer.arguments[0].getText(ast);ts.forEachChild(n,walk);}
  walk(ast); assert.ok(expression); return new Function('scope',`with(scope){return ${transformSync(`(${expression})`,{loader:'ts'}).code}}`)(scope);
}
for(const sex of ['male','female']){
  const indexed = await loadBody(path.join(root,`public/models/body_${sex}_realistic.glb`));
  const geo=indexed.toNonIndexed(), base=geo.attributes.position.array.slice();
  const bounds=api.shapeBounds([api.prepareDeformable(geo)]), masks=api.createRegionMasks(base,bounds);
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const hit=new THREE.Raycaster(new THREE.Vector3(5,1.071,0),new THREE.Vector3(-1,0,0)).intersectObject(mesh)[0];assert.ok(hit);
  const triangle=new THREE.Triangle(...[hit.face.a,hit.face.b,hit.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(geo.attributes.position,i)));
  const anchor={bodyMeshId:'body_full',faceIndex:hit.faceIndex,barycentric:triangle.getBarycoord(hit.point,new THREE.Vector3()).toArray()};
  const topology=api.createSurfaceTopology(geo), surface=api.buildSurfaceChart(topology,geo,identity,anchor);
  const area=api.areaAtAnchor(masks,anchor,geo); assert.equal(area,'armLeft');
  const bounded=api.createPlacementDomain(geo,identity,surface,masks[area]);
  const test=v=>api.assessPlacement(bounded,solid,v*.42,1,330*Math.PI/180);
  const fitted=api.fitPlacement(test,1.55); assert.ok(fitted!==null,`${sex}: oversized upper-arm tattoo can be fitted`);
  assert.equal(test(fitted).valid,true); assert.ok(fitted<1.55,`${sex}: arm fit is smaller`);
  const positions=geo.attributes.position.array.slice(), atlas=geo.attributes.uv.array.slice();
  const ref=current=>({current}); let saved, status;
  const scope={THREE,...api, bodyDef:{id:'body_full'}, bodyMeshRef:ref(mesh),referenceGeoRef:ref(geo.clone()),topologyRef:ref(topology),
    chartRef:ref(surface),domainRef:ref(bounded),anchorRef:ref({...anchor,bounds:{region:area,allowAcrossRegions:false}}),regionMasksRef:ref(masks),
    isDragging:ref(false),isolateRef:ref(null),hasPlacedRef:ref(false),placementInput:ref({inkFootprint:solid,size:1.55*.42,imageAspect:1,rotationRad:330*Math.PI/180}),
    onPlacementStatus:value=>status=value,onPlacementChange:value=>saved=value,setDecalVisible(){},setHasPlaced(){},setChartVersion(){},setBoundsLimitMessage(){}};
  const apply=callback('applyAnchor',scope);
  assert.equal(apply(anchor),true); assert.equal(saved.bounds.region,area,'Area is saved on the anchor');
  assert.equal(saved.bounds.allowAcrossRegions,false);
  assert.deepEqual(geo.attributes.aTattooBoundary.array,masks[area],'Production adapter restricts only ink');
  assert.deepEqual(geo.attributes.position.array,positions);assert.deepEqual(geo.attributes.uv.array,atlas);
  assert.equal(api.validateSurfaceAnchor(JSON.parse(JSON.stringify(saved)),geo),true,'Region survives serialized scene/undo snapshots');
  assert.equal(api.validateSurfaceAnchor({...saved,bounds:{region:'imaginary',allowAcrossRegions:false}},geo),false);
  for(const bounds of [false,0,null,'armLeft']) assert.equal(api.validateSurfaceAnchor({...saved,bounds},geo),false,'Malformed bounds cannot bypass a region lock');
  const oldAnchor=scope.anchorRef.current;
  scope.hasPlacedRef.current=true;scope.isDragging.current=true;scope.placementInput.current.size=fitted*.42;
  const torsoHit=new THREE.Raycaster(new THREE.Vector3(0,1.06,3),new THREE.Vector3(0,0,-1)).intersectObject(mesh)[0];
  const torsoTri=new THREE.Triangle(...[torsoHit.face.a,torsoHit.face.b,torsoHit.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(geo.attributes.position,i)));
  const torsoAnchor={...anchor,faceIndex:torsoHit.faceIndex,barycentric:torsoTri.getBarycoord(torsoHit.point,new THREE.Vector3()).toArray()};
  assert.equal(apply(torsoAnchor),false,'Dragging cannot jump from a locked arm onto the chest');
  assert.equal(scope.anchorRef.current,oldAnchor,'Rejected drag preserves last valid anchor');assert.ok(status);
  assert.equal(apply({...oldAnchor,bounds:{region:area,allowAcrossRegions:true}},true,true),true);
  assert.ok(geo.attributes.aTattooBoundary.array.every(v=>v===1),'Explicit override removes region clipping');
  assert.equal(saved.bounds.allowAcrossRegions,true);
  console.log(`${sex}: arm fit ${(fitted*100).toFixed(1)}%; saved boundary, blocked cross-arm drag and override passed`);
}
const bake=await fs.readFile(path.join(root,'src/render/bakeInkLayer.ts'),'utf8');
for(const code of [modelSource,bake]) assert.match(code,/vTattooMask \* step\(0\.0, vTattooBoundary\)/,'Preview and export use the same interpolated cutoff');
console.log('Placement bounds passed: alpha, aspect/rotation, partial triangles, fitting, safe transforms, real male/female arms, persistence, geometry preservation and export boundary parity.');
