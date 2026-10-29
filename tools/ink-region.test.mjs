import assert from 'node:assert/strict';
import { build } from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/render/inkUvRegion.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {inkUvRegion}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const pixels=new Uint8Array(64*64*4);
assert.deepEqual(inkUvRegion(pixels,64),[0,0,1,1]);
pixels[(20*64+30)*4+3]=1; // Faint antialiased pixels must not be discarded.
assert.deepEqual(inkUvRegion(pixels,64),[22/64,12/64,17/64,17/64]);
pixels[3]=255; pixels[pixels.length-1]=255;
assert.deepEqual(inkUvRegion(pixels,64),[0,0,1,1], 'split islands across atlas boundaries stay included');
assert.throws(()=>inkUvRegion(pixels,32));
console.log('Ink region: empty, faint strokes, filter guard, split islands and invalid inputs passed');
