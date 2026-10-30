import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import * as THREE from 'three';
const root=process.cwd();
const {outputFiles}=await build({stdin:{contents:"export * from './src/render/closeupGeometry';",resolveDir:root},bundle:true,platform:'node',format:'esm',write:false});
const {closeupGeometry}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const points=[[0,0,0],[1,0,0],[0,1,0]],normals=[[0,0,1],[.3,0,.95],[0,.3,.95]];
const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals.flat(),3));
const expected=Array.from(closeupGeometry(geo).attributes.position.array);
const weights=[];const w=(i,j)=>[1-(i+j)/3,i/3,j/3];for(let i=0;i<3;i++)for(let j=0;j<3-i;j++){weights.push(w(i,j),w(i+1,j),w(i,j+1));if(i+j<2)weights.push(w(i+1,j),w(i+1,j+1),w(i,j+1));}
const script=`import ast,json,sys,numpy as np\nsource=open('smartink-live/studioGeometry.py').read()\nnode=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='refine_arrays')\nexec(ast.get_source_segment(source,node))\nx=json.load(sys.stdin)\nprint(json.dumps(refine_arrays(np.array([x['points']]),np.array([x['normals']]),np.array(x['weights'])).reshape(-1).tolist()))`;
const run=spawnSync(process.env.PYTHON || 'python3',['-c',script],{input:JSON.stringify({points,normals,weights}),encoding:'utf8'});assert.equal(run.status,0,run.stderr);const actual=JSON.parse(run.stdout);
assert.equal(actual.length,expected.length);actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-7,`refinement ${i}`));
const manifest=JSON.parse(fs.readFileSync('smartink-live/skinAtlasManifest.json','utf8'));
assert.equal(Object.keys(manifest.files).length,4);
for(const [name,hash] of Object.entries(manifest.files)){const png=fs.readFileSync(`public/textures/${name}`);assert.equal(crypto.createHash('sha256').update(png).digest('hex'),hash);assert.equal(png.readUInt32BE(16),4096);assert.equal(png.readUInt32BE(20),4096);}
const ignore=fs.readFileSync('server/runpod/Dockerfile.dockerignore','utf8');for(const item of ['!smartink-live/skinProfile.json','!smartink-live/skinAtlasManifest.json','!smartink-live/studioGeometry.py','!public/textures/skin-*-v3.png'])assert.ok(ignore.includes(item));
console.log('Shared skin parity passed: exact packaged atlas hashes and dimensions; browser/Blender tangent-plane geometry agrees within 1e-7.');
