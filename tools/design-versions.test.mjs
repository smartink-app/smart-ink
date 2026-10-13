import assert from 'node:assert/strict';
import { build } from 'esbuild';

// A transactional in-memory adapter exercises the same persistence callbacks as IndexedDB.
const rows = new Map(); let failWrite = false;
const originalStore = globalThis.__versionStore;
globalThis.__versionStore = {
  get: async key => structuredClone(rows.get(key)),
  update: async (key, fn) => { const next = fn(structuredClone(rows.get(key))); if (failWrite) throw Error('Quota exceeded'); rows.set(key, structuredClone(next)); },
};
const { outputFiles } = await build({ stdin: { contents: "export * from './src/versions/model'; export * from './src/versions/storage'; export * from './src/versions/capture';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [{ name: 'transaction-store', setup(b) {
  b.onResolve({ filter: /^idb-keyval$/ }, () => ({ path: 'idb', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const createStore = () => ({}); export const get = (...a) => globalThis.__versionStore.get(...a); export const update = (...a) => globalThis.__versionStore.update(...a);' }));
} }] });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const pixel = 'data:image/png;base64,iVBORw0KGgo=';
const now = new Date('2026-10-09T10:00:00Z');
const scene = { id: 'studio-a', name: 'Original studio design', model: 'FinalBaseMesh', decalImage: pixel, thumbnail: pixel, decalRotation: 0, decalScale: 1, decalOpacity: .9, decalVisible: true, decalColor: '#222222', decalPosition: [0, 1, 0], decalNormal: [0, 0, 1], background: '#30343c', lightingPreset: 'studio', camera: { position: [0, 1, 3], target: [0, 1, 0], fov: 35 }, bodyShape: { height: 1, weight: .5 }, createdBy: 'private-owner', createdAt: now, updatedAt: now };
const publish = (h, id = 'v1', source = scene) => api.publishVersion(h, 'artist', { id, scene: source, title: 'First composition', note: 'Please check the placement.' }, now);
const decide = (h, id = h.versions.at(-1).id, kind = 'approved', note = '') => api.decideVersion(h, id, 'client', 'client-a', { kind, note, clientName: 'Demo client' }, now);
try {
  const empty = api.emptyHistory('project-a', 'client-a');
  const v1 = publish(empty);
  assert.equal(empty.versions.length, 0);
  assert.equal(v1.versions[0].scene.createdBy, '');
  assert.notEqual(v1.versions[0].scene.id, scene.id, 'Feedback must use a separate snapshot identity');
  assert.equal(v1.versions[0].sourceSceneId, scene.id);
  assert.equal(v1.versions[0].scene.name, 'V1 · First composition');
  assert.equal(v1.versions[0].decision, null);
  scene.bodyShape.weight = .7;
  assert.equal(v1.versions[0].scene.bodyShape.weight, .5, 'Future studio edits cannot change a shared version');
  assert.throws(() => api.publishVersion(empty, 'client', { id: 'x', title: 'x', note: 'x', scene }), /Only the artist/);
  assert.throws(() => publish(v1), /already been shared/);
  assert.throws(() => publish(empty, 'bad', { ...scene, decalVisible: false }), /visible tattoo/);
  assert.throws(() => publish(empty, 'bad', { ...scene, decalImage: 'https://example.invalid/expiring.png' }), /captured completely/);
  assert.throws(() => publish(empty, 'bad', { ...scene, camera: { ...scene.camera, fov: NaN } }), /captured completely/);
  assert.throws(() => api.decideVersion(v1, 'v1', 'artist', 'client-a', { kind: 'approved', note: '', clientName: 'Artist' }), /Only this project/);
  assert.throws(() => api.decideVersion(v1, 'v1', 'client', 'other-client', { kind: 'approved', note: '', clientName: 'Other' }), /Only this project/);
  assert.throws(() => decide(v1, 'v1', 'changes_requested', '  '), /Describe/);
  const requested = decide(v1, 'v1', 'changes_requested', '  More room between leaves.  ');
  assert.equal(requested.versions[0].decision.note, 'More room between leaves.');
  assert.throws(() => decide(requested), /already recorded/);
  const approved = decide(v1);
  const v2 = publish(approved, 'v2', { ...scene, decalScale: .85 });
  assert.equal(v2.versions[0].decision.kind, 'approved');
  assert.equal(v2.versions[1].decision, null, 'A new version never inherits approval');
  assert.notEqual(v2.versions[1].scene.id, v2.versions[0].scene.id, 'Separate feedback for each version');
  assert.throws(() => decide(v2, 'v1'), /newer version/);
  assert.deepEqual(api.designChanges(v2.versions[0].scene, v2.versions[1].scene), ['Tattoo size', 'Body & measurements']);
  const complete = decide(v2);
  assert.equal(complete.versions.filter(v => v.decision.kind === 'approved').length, 2);
  assert.equal(api.parseHistory(structuredClone(complete), 'project-a', 'client-a').versions.length, 2);
  assert.throws(() => api.parseHistory(complete, 'other-project', 'client-a'), /could not be read/);
  assert.throws(() => api.parseHistory(complete, 'project-a', 'other-client'), /could not be read/);
  const corrupt = structuredClone(complete); corrupt.versions[1].scene.camera.position[0] = Infinity;
  assert.throws(() => api.parseHistory(corrupt, 'project-a', 'client-a'), /could not be read/);
  let stored = await api.changeHistory('account-a', 'project-a', 'client-a', 0, publish);
  assert.equal(stored.revision, 1);
  assert.equal((await api.loadHistory('account-a', 'project-a', 'client-a')).versions[0].scene.bodyShape.weight, .7);
  assert.equal((await api.loadHistory('account-b', 'project-a', 'client-a')).versions.length, 0);
  await assert.rejects(api.loadHistory('account-a', 'project-a', 'wrong-client'), /could not be read/);
  const racing = await Promise.allSettled([api.changeHistory('account-a', 'project-a', 'client-a', 1, h => decide(h)), api.changeHistory('account-a', 'project-a', 'client-a', 1, h => publish(h, 'v2'))]);
  assert.equal(racing.filter(r => r.status === 'fulfilled').length, 1, 'Concurrent decision/publish has one winner');
  assert.match(racing.find(r => r.status === 'rejected').reason.message, /another view/);
  stored = await api.loadHistory('account-a', 'project-a', 'client-a');
  failWrite = true;
  await assert.rejects(api.changeHistory('account-a', 'project-a', 'client-a', stored.revision, h => publish(h, 'v2')), /Quota/);
  failWrite = false;
  assert.deepEqual(await api.loadHistory('account-a', 'project-a', 'client-a'), stored, 'Failed saves must leave the approved version intact');
  const storageKey = api.historyKey('account-a', 'project-a'); const beforeCorruption = rows.get(storageKey);
  rows.set(storageKey, { broken: true });
  await assert.rejects(api.changeHistory('account-a', 'project-a', 'client-a', 0, publish), /could not be read/);
  assert.deepEqual(rows.get(storageKey), { broken: true }, 'Do not overwrite unreadable history'); rows.set(storageKey, beforeCorruption);

  const prevWindow = globalThis.window, prevFetch = globalThis.fetch, prevReader = globalThis.FileReader;
  try {
    globalThis.window = { location: { href: 'http://localhost/' } };
    globalThis.FileReader = class { readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`; this.onload(); }); } };
    let release;
    globalThis.fetch = async () => { await new Promise(resolve => { release = resolve; }); return new Response(new Blob(['image bytes'], { type: 'image/png' })); };
    const source = { ...scene, bodyShape: { weight: .3 }, decalImage: '/signed-art.png', thumbnail: null };
    const copyPromise = api.captureDesign(source); source.bodyShape.weight = .95; release();
    const captured = await copyPromise;
    assert.equal(captured.bodyShape.weight, .3, 'Capture before awaiting network work');
    assert.ok(api.inlineImage(captured.decalImage)); assert.equal(captured.createdBy, '');
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(api.captureDesign(source), /could not be copied/);
    globalThis.fetch = async () => new Response(new Blob(['html'], { type: 'text/html' }));
    await assert.rejects(api.captureDesign(source), /Use PNG/);
  } finally { globalThis.window = prevWindow; globalThis.fetch = prevFetch; globalThis.FileReader = prevReader; }
} finally { globalThis.__versionStore = originalStore; }
console.log('Design versions passed: immutable snapshots, embedded artwork, role/client checks, version-specific decisions, new-review reset, comparison, isolated feedback IDs, account/project binding, reload, atomic stale-write protection, corruption and quota failures.');
