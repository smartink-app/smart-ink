import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/ipad/nativeBridge.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { nativeArtworkFile, reportNativeStudio } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = nativeArtworkFile({ name: 'artist.png', base64: bytes.toString('base64') });
assert.equal(file.type, 'image/png');
assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
for (const value of [null, 'javascript:alert(1)', {}, { name: 'a.svg', base64: 'AAAA' }, { name: 'a.png', base64: '<script>' }, { name: 'a.png', base64: 'A'.repeat(28 * 1024 * 1024) }]) {
  assert.throws(() => nativeArtworkFile(value));
}
const posted = [];
globalThis.window = { webkit: { messageHandlers: { studioState: { postMessage: value => posted.push(value) } } } };
reportNativeStudio(true);
assert.equal(posted.length, 0, 'Ordinary browser does not activate bridge');
window.smartInkNativeHost = true;
reportNativeStudio(true); reportNativeStudio(false);
assert.deepEqual(posted, [{ version: 1, editing: true }, { version: 1, editing: false }]);
console.log('iPad bridge payload validation and host isolation passed.');

// Execute the production hook with controlled async decoding/persistence.
let effect, cleanup;
globalThis.ipadTest = {
  effect: fn => { effect = fn; },
  decode: async () => 'data:image/png;base64,cG5n',
  save: async () => [],
};
const hookBuild = await build({
  entryPoints: ['src/ipad/useNativeArtwork.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'native-hook-runtime', setup(builder) {
    builder.onResolve({ filter: /^react$|tattooUpload$|storage\/tattooLibrary$/ }, args => ({ path: args.path, namespace: 'ipad-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'ipad-test' }, args => ({ contents: args.path === 'react'
      ? 'export const useEffect = fn => globalThis.ipadTest.effect(fn);'
      : args.path.endsWith('tattooUpload')
        ? 'export const MAX_TATTOO_BYTES=20*1024*1024; export const readTattooPng=(...args)=>globalThis.ipadTest.decode(...args);'
        : 'export const rememberTattoo=(...args)=>globalThis.ipadTest.save(...args);' }));
  } }],
});
const { useNativeArtwork } = await import(`data:text/javascript;base64,${Buffer.from(hookBuild.outputFiles[0].text).toString('base64')}`);
const payload = { name: 'art.png', base64: bytes.toString('base64') };
const chosen = [];
useNativeArtwork(true, 'project-1', source => chosen.push(source)); cleanup = effect();
await window.smartInkNativeArtwork.importArtwork(payload);
assert.equal(chosen.length, 1, 'Valid artwork applies to active editor');
cleanup();
assert.equal(window.smartInkNativeArtwork, undefined);
useNativeArtwork(false, 'project-1', () => assert.fail('Disabled editor cannot accept native import')); effect();
assert.equal(window.smartInkNativeArtwork, undefined, 'Dashboard/read-only modes expose no importer');
let release;
ipadTest.decode = () => new Promise(resolve => { release = resolve; });
useNativeArtwork(true, 'project-1', () => assert.fail('Unmounted project cannot receive artwork')); cleanup = effect();
const cancelled = window.smartInkNativeArtwork.importArtwork(payload);
await assert.rejects(window.smartInkNativeArtwork.importArtwork(payload), /already running/);
cleanup(); release('data:image/png;base64,cG5n');
await assert.rejects(cancelled, { name: 'AbortError' });
assert.equal(posted.at(-1).editing, false, 'Native controls disable on cleanup');
console.log('iPad import lifecycle passed: gating, persistence, concurrent rejection, cancellation.');
