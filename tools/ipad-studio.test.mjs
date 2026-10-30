import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build, transformSync } from 'esbuild';
import ts from 'typescript';
const bundle = await build({ entryPoints: ['src/ipad/nativeDraftStore.ts', 'src/ipad/offlineAccess.ts'], bundle: true, format: 'esm', platform: 'node', outdir: '/tmp/unused-ipad', write: false });
const modules = await Promise.all(bundle.outputFiles.map(file => import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)));
const { createNativeDraftStore } = modules.find(m => m.createNativeDraftStore);
const access = modules.find(m => m.hasOfflineApproval);
const db = new Map(); let owner = 'artist-a'; let fail = false;
const store = createNativeDraftStore(async key => structuredClone(db.get(key)), async (key, scenes) => { if (fail) throw Error('Disk full'); db.set(key, structuredClone(scenes)); }, () => owner);
const project = { id: 'a', name: 'Original', bodyMeshId: 'body_full', createdAt: new Date(), updatedAt: new Date() };
await store.addScene(project);
await Promise.all([store.updateScene({ ...project, name: 'First' }), store.updateScene({ ...project, name: 'Latest' })]);
assert.equal((await store.getScene('a')).name, 'Latest');
owner = 'artist-b'; assert.deepEqual(await store.loadScenes(), [], 'Accounts cannot see each other’s drafts');
owner = 'artist-a'; fail = true;
await assert.rejects(store.updateScene({ ...project, name: 'Unsaved' }), /Disk full/);
fail = false; assert.equal((await store.getScene('a')).name, 'Latest', 'Failed writes preserve stored project');
await assert.rejects(store.updateScene({ ...project, id: 'missing' }), /not found/);
owner = null; await assert.rejects(store.loadScenes(), /Sign in/);
const cache = new Map(); globalThis.localStorage = { getItem: k => cache.get(k) ?? null, setItem: (k,v) => cache.set(k,v), removeItem: k => cache.delete(k) };
globalThis.window = { smartInkNativeHost: true };
const expires = Date.now() / 1000 + 100;
assert.equal(access.hasOfflineApproval('a', expires), false);
access.rememberOfflineApproval('a', expires);
assert.equal(access.hasOfflineApproval('a', expires), true);
assert.equal(access.hasOfflineApproval('b', expires), false);
assert.equal(access.hasOfflineApproval('a', Date.now() / 1000 - 1), false);
window.smartInkNativeHost = false; assert.equal(access.hasOfflineApproval('a', expires), false, 'Browser authorization unaffected');
window.smartInkNativeHost = true; access.forgetOfflineApproval('a'); assert.equal(access.hasOfflineApproval('a', expires), false);

// Execute the real command dispatcher: native input cannot bypass locks or save failures.
const source = await fs.readFile('src/Workspace.tsx', 'utf8');
const tree = ts.createSourceFile('Workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let command;
function visit(node) { if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useNativeStudio') command = node.arguments[1].getText(tree); ts.forEachChild(node, visit); }
visit(tree); assert.ok(command);
const changes = [];
const scope = { currentScene: project, showDashboard: false, modelLoading: false, snapshot: { open: false }, historyBlocked: false, measureLoading: false,
  setDecalScale: n => changes.push(n), setDecalRotation: n => changes.push(n),
  boundedNumber: (value,min,max) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error('Invalid'); return value; },
  flushPendingSave: async () => { if (fail) throw Error('Save failed'); }, measureOpen: false, setShowDashboard: value => changes.push(value),
};
const dispatch = new Function('scope', `with(scope){return ${transformSync(`(${command})`, { loader: 'ts' }).code}}`)(scope);
await dispatch({ action: 'scale', value: 1.4 }); assert.deepEqual(changes, [1.4]);
await assert.rejects(dispatch({ action: 'scale', value: NaN }), /Invalid/);
await assert.rejects(dispatch({ action: 'scale', value: 99 }), /Invalid/);
scope.historyBlocked = true; await assert.rejects(dispatch({ action: 'rotation', value: 20 }), /Finish/); scope.historyBlocked = false;
fail = true; await assert.rejects(dispatch({ action: 'gallery' }), /Save failed/); assert.deepEqual(changes, [1.4], 'Save failure must prevent leaving the editor');
fail = false; await dispatch({ action: 'gallery' }); assert.equal(changes.at(-1), true);

// Present: motion choices are bounded, never start over an open shoot, and exit always works.
const presented = [];
Object.assign(scope, { reviewOpen: false, presenting: false, PRESENT_MOTIONS: ['showcase','turntable','still'],
  startPresenting: motion => presented.push(motion), stopPresenting: () => presented.push('stop'),
  presentReturnCamera: { current: null }, getScene: async id => id === 'a' ? project : undefined, loadScene: scene => presented.push(scene.id) });
await dispatch({ action: 'present', value: 'turntable', key: 'motion' }); assert.deepEqual(presented, ['turntable']);
await assert.rejects(dispatch({ action: 'present', value: 'spin', key: 'motion' }), /Unknown/);
await assert.rejects(dispatch({ action: 'present', key: 'project', id: 'a' }), /Start presenting/);
scope.presenting = true; await dispatch({ action: 'present', key: 'project', id: 'a' }); assert.equal(presented.at(-1), 'a');
await assert.rejects(dispatch({ action: 'present', key: 'project', id: 'missing' }), /not found/);
scope.snapshot = { open: true }; await assert.rejects(dispatch({ action: 'present', value: 'still', key: 'motion' }), /Finish/); scope.snapshot = { open: false };
scope.modelLoading = true; await dispatch({ action: 'present', key: 'stop' }); assert.equal(presented.at(-1), 'stop', 'Exit works while the next design loads'); scope.modelLoading = false;

const motion = await build({ entryPoints: ['src/render/presentMotion.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const present = await import(`data:text/javascript;base64,${Buffer.from(motion.outputFiles[0].text).toString('base64')}`);
const base = { position: [3, 1.5, 4], target: [0, 1, 0], fov: 40 };
const near = (a, b, message) => a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) < 1e-6, message));
const flat = view => Math.hypot(view.position[0] - view.target[0], view.position[2] - view.target[2]);
for (const seconds of [0, 5, 13, 27]) {
  const view = present.turntableCamera(base, seconds);
  assert.ok(Math.abs(flat(view) - flat(base)) < 1e-6 && view.position[1] === base.position[1], 'Turntable keeps its height and distance from the figure');
  near(view.target, base.target, 'Turntable pivots on the figure');
}
near(present.turntableCamera(base, present.TURNTABLE_SECONDS).position, base.position, 'One revolution returns to the start');
for (let s = 0; s < present.SHOWCASE_SECONDS; s += .25) {
  const { azimuth, elevation, zoom } = present.showcaseAdjustment(s);
  assert.ok(Math.abs(azimuth) <= 24 + 1e-9 && elevation >= 3 - 1e-9 && elevation <= 9 + 1e-9 && zoom >= .78 - 1e-9 && zoom <= .86 + 1e-9, 'Showcase stays inside gentle guided angles');
}
const path = Array.from({ length: 8 }, (_, i) => ({ position: [Math.cos(i / 8 * Math.PI * 2), 0, Math.sin(i / 8 * Math.PI * 2)], target: [0, 0, 0], fov: 38 }));
near(present.samplePath(path, present.SHOWCASE_SECONDS).position, path[0].position, 'Showcase loops seamlessly');
near(present.samplePath(path, present.SHOWCASE_SECONDS * 1.5 / 8).position, [(path[1].position[0] + path[2].position[0]) / 2, 0, (path[1].position[2] + path[2].position[2]) / 2], 'Showcase moves at a steady pace');
near(present.blendPresentCamera(base, path[0], 0).position, base.position, 'Blending starts where the visitor left the camera');
near(present.blendPresentCamera(base, path[0], present.PRESENT_BLEND_SECONDS).position, path[0].position, 'Blending lands on the moving shot');
console.log('Native studio: account isolation, offline approval expiry, durable drafts, command bounds, edit locks, save-before-navigation and Present passed.');
