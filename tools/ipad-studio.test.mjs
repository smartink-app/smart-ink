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
console.log('Native studio: account isolation, offline approval expiry, durable drafts, command bounds, edit locks and save-before-navigation passed.');
