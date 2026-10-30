import assert from 'node:assert/strict';
import {removeWhite} from '../src/render/removeWhite.mjs';
const original = new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 128,128,128,255, 0,0,0,128, 0,0,0,0]);
assert.deepEqual([...removeWhite(original)], [0,0,0,0, 0,0,0,255, 0,0,0,127, 0,0,0,128, 0,0,0,0]);
assert.equal(original[0],255,'original retained');
assert.equal(removeWhite(new Uint8ClampedArray([245,245,245,255]),5)[3],0,'off-white paper cleaned');
for(let gray=0;gray<=255;gray++) {
 const alpha=removeWhite(new Uint8ClampedArray([gray,gray,gray,255]))[3];
 assert.ok(Math.abs((255-alpha)-gray)<=1,'appearance over white preserved');
}
assert.throws(()=>removeWhite(original,NaN));
assert.throws(()=>removeWhite(new Uint8ClampedArray(3)));
console.log('White removal passed: shading, edge alpha, existing transparency, paper cleanup and original preservation.');
