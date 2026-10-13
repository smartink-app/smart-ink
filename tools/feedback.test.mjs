import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build, transform } from 'esbuild';
import ts from 'typescript';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/feedback/model'; export * from './src/feedback/storage'; export * from './src/feedback/pointer'; export * from './src/model/tattooHit'; export { Mesh, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const location = { anchor: { bodyMeshId: 'body_full', faceIndex: 0, barycentric: [.2, .3, .5] }, label: 'Left arm', camera: { position: [0, 1, 3], target: [0, 1, 0], fov: 38 } };
const empty = api.emptyFeedback();
const added = api.addFeedback(empty, '  A little higher, please. ', 'client', location);
const id = added.threads[0].id;
assert.equal(empty.threads.length, 0);
assert.equal(added.threads[0].messages[0].text, 'A little higher, please.');
assert.notEqual(added.threads[0].location, location);
const replied = api.replyToFeedback(added, id, 'I can adjust that.', 'artist');
assert.equal(replied.threads[0].messages[1].role, 'artist');
assert.throws(() => api.resolveFeedback(replied, id, true, 'client'), /Only the artist/);
const resolved = api.resolveFeedback(replied, id, true, 'artist');
assert.equal(resolved.threads[0].resolved, true);
assert.throws(() => api.replyToFeedback(resolved, id, 'More', 'client'), /reopen/);
assert.equal(api.resolveFeedback(resolved, id, false, 'artist').threads[0].resolved, false);
assert.equal(api.addFeedback(empty, 'General note', 'client', null).threads[0].location, null);
assert.throws(() => api.addFeedback(empty, '  ', 'client', null), /Write a comment/);
assert.throws(() => api.addFeedback(empty, 'x'.repeat(2001), 'client', null), /Write a comment/);
assert.throws(() => api.addFeedback(empty, 'Bad', 'client', { ...location, anchor: { ...location.anchor, barycentric: [1, 1, 1] } }), /Choose a point/);
assert.throws(() => api.addFeedback(empty, 'Bad', 'client', { ...location, camera: { ...location.camera, fov: NaN } }), /Choose a point/);
assert.throws(() => api.parseFeedback('{"version":1,"revision":0,"threads":[{}]}'), /could not be read/);

// Data is isolated per owner and scene; a stale tab, quota failure or damaged store cannot replace notes.
const raw = new Map(); let fail = false;
globalThis.localStorage = { getItem: key => raw.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error('Quota exceeded'); raw.set(key, value); } };
const key = api.feedbackStorageKey('artist-a', 'scene-a');
assert.notEqual(key, api.feedbackStorageKey('artist-b', 'scene-a'));
assert.notEqual(key, api.feedbackStorageKey('artist-a', 'scene-b'));
const saved = api.persistFeedback(key, replied, 0);
assert.deepEqual(api.loadFeedback(key), saved);
assert.throws(() => api.persistFeedback(key, empty, 0), /another tab/);
fail = true;
assert.throws(() => api.persistFeedback(key, resolved, 1), /Quota/);
assert.deepEqual(api.loadFeedback(key), saved);
fail = false;
raw.set(key, 'damaged');
assert.throws(() => api.persistFeedback(key, empty, 1));
assert.equal(raw.get(key), 'damaged');
raw.delete(key);
assert.throws(() => api.persistFeedback(key, replied, 1), /another tab/);
delete globalThis.localStorage;

// Exercise the actual native tap binding: orbit, multi-touch, modifiers and cancellation never pin.
const canvas = new EventTarget(), host = new EventTarget();
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 500 });
let taps = 0;
const unbind = api.bindFeedbackTap(canvas, host, () => taps++);
function event(target, type, extra = {}) { target.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100, ...extra })); }
event(canvas, 'pointerdown'); event(host, 'pointerup'); assert.equal(taps, 1);
event(canvas, 'pointerdown'); event(host, 'pointermove', { clientX: 140 }); event(host, 'pointermove'); event(host, 'pointerup'); assert.equal(taps, 1, 'Returning an orbit drag to its starting point is not a tap');
event(canvas, 'pointerdown'); event(host, 'pointerup', { clientX: 140 }); assert.equal(taps, 1);
event(canvas, 'pointerdown'); event(canvas, 'pointerdown', { pointerId: 2, isPrimary: false }); event(host, 'pointerup', { pointerId: 2 }); event(host, 'pointerup'); assert.equal(taps, 1);
for (const kind of ['pointercancel', 'blur']) { event(canvas, 'pointerdown'); event(host, kind); event(host, 'pointerup'); }
for (const extra of [{ button: 2 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) { event(canvas, 'pointerdown', extra); event(host, 'pointerup', extra); }
assert.equal(taps, 1);
event(canvas, 'pointerdown'); event(host, 'pointerup', { pointerId: 2 }); event(host, 'pointerup'); assert.equal(taps, 2, 'Unrelated pointers do not end a tap');
event(canvas, 'pointerdown', { clientX: 499 }); event(host, 'pointerup', { clientX: 502 }); assert.equal(taps, 2);
unbind(); event(canvas, 'pointerdown'); event(host, 'pointerup'); assert.equal(taps, 2);

// The same barycentric pin follows geometry edits and world transforms, not a stale world position.
const geometry = new api.BufferGeometry();
geometry.setAttribute('position', new api.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0], 3));
const mesh = new api.Mesh(geometry); mesh.position.set(2,3,4); mesh.updateMatrixWorld();
assert.deepEqual(api.tattooAnchorPoint(mesh, location.anchor, new api.Vector3()).toArray(), [2.3,3.5,4]);
geometry.attributes.position.setZ(2, 2);
assert.deepEqual(api.tattooAnchorPoint(mesh, location.anchor, new api.Vector3()).toArray(), [2.3,3.5,5]);
geometry.setIndex([0,1,2]);
assert.deepEqual(api.tattooAnchorPoint(mesh, location.anchor, new api.Vector3()).toArray(), [2.3,3.5,5]);

// Evaluate real Workspace guards: no model/history edits, autosaves or thumbnails while reviewing.
const source = await fs.readFile('src/Workspace.tsx', 'utf8');
const ast = ts.createSourceFile('Workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const variables = new Map(), attributes = new Map(), effects = [];
function visit(n) {
  if (ts.isVariableDeclaration(n)) variables.set(n.name.getText(ast), n);
  if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer)) attributes.set(n.name.getText(ast), n.initializer.expression);
  if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') effects.push(n.arguments[0]);
  ts.forEachChild(n, visit);
}
visit(ast);
async function evaluate(code, scope) {
  const compiled = (await transform(`(${code})`, { loader: 'ts', target: 'es2022' })).code;
  return Function(...Object.keys(scope), `return ${compiled}`)(...Object.values(scope));
}
assert.equal(await evaluate(attributes.get('editingEnabled').getText(ast), { reviewOpen: true, photoMode: false, snapshot: { open: false }, measureOpen: false, inspectorTab: 'tattoo' }), false);
assert.equal(await evaluate(variables.get('historyBlocked').initializer.getText(ast), { reviewOpen: true }), true);
const saveEffects = effects.filter(e => /stageScene\(updated\)/.test(e.getText(ast)));
assert.equal(saveEffects.length, 2);
for (const effect of saveEffects) {
  const fn = await evaluate(effect.getText(ast), { currentScene: { id: 'scene-a' }, showDashboard: false, reviewOpen: true });
  assert.equal(fn(), undefined, 'Review must return before any save or thumbnail effect');
}
let camera = null, request = 0, open = true, dashboard = false, section = '', allowLeave = true;
const review = { dirty: false, cancel: () => {}, setReplies: () => {} };
const closeContext = { projectId: 'client-project', role: 'client', versionId: 'v1' };
const returnView = structuredClone(location.camera);
const close = await evaluate(variables.get('closeReview').initializer.getText(ast), {
  review, clientReview: closeContext, window: { confirm: () => allowLeave },
  setDashboardSection: v => { section = v; }, setShowDashboard: v => { dashboard = v; },
  orbitControlsRef: { current: { freezeSnapshot: () => { camera = 'review camera'; } } }, reviewCamera: { current: returnView },
  setCameraState: v => { camera = v; }, setCameraRequestId: update => { request = update(request); }, setReviewOpen: v => { open = v; },
});
review.dirty = true; allowLeave = false; close(); assert.equal(open, true); assert.equal(dashboard, false); assert.equal(request, 0);
allowLeave = true; close(); assert.equal(section, 'client'); assert.equal(dashboard, true); assert.deepEqual(camera, returnView); assert.notEqual(camera, returnView); assert.equal(open, false); assert.equal(request, 1);
// A client launch is locked in the same state transition that loads the scene.
const loadSource = variables.get('loadScene').initializer.getText(ast), loadedState = {};
const loadScope = {
  afterSaving: fn => fn(), migrateScene: v => v, reviewCamera: { current: null },
  review: { cancel: () => {}, setReplies: () => {}, setRole: role => { loadedState.role = role; } },
  findById: () => undefined, REGISTRY: { looks: [] }, LIGHTING_PRESETS: { studio: true }, BACKGROUNDS: { dark: true },
  CAMERA_PRESETS: { threeQuarter: location.camera }, FINAL_SAMPLES: { default: 32 }, resolveRig: () => ({}),
};
for (const [, name] of loadSource.matchAll(/\b(set[A-Z]\w*)\(/g)) loadScope[name] = v => { loadedState[name] = v; };
for (const name of ['normalizePose','normalizeAppearance','normalizeStudio','normalizeShape']) loadScope[name] = v => v;
const launch = await evaluate(loadSource, loadScope);
launch({ id: 'scene-a', camera: location.camera, lightingPreset: 'studio', background: 'dark' }, closeContext);
assert.equal(loadedState.setReviewOpen, true); assert.equal(loadedState.setShowDashboard, false);
assert.equal(loadedState.setClientReview.versionId, 'v1'); assert.equal(loadedState.role, 'client'); assert.equal(loadedState.setClientProjectId, 'client-project');
assert.deepEqual(loadedState.setClientReview, closeContext);
console.log('Feedback passed: anchored notes, replies, artist resolution, validation, scoped persistence, corruption/quota/stale-tab protection, gesture safety, mesh deformation, edit/save guards and camera restoration.');
