import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ entryPoints: [root + 'src/render/reveal.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { revealCamera } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const base = { position: [.4, 1.1, 3.2], target: [.1, .9, .3], fov: 25 };
const cases = ['reveal', 'orbit'].flatMap(preset => Array.from({ length: 96 }, (_, i) => ({ preset, t: i / 95 })));
const python = spawnSync('python3', ['-c', `import importlib.util,json
s=importlib.util.spec_from_file_location('motion','smartink-live/revealRender.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
b=json.loads(${JSON.stringify(JSON.stringify(base))}); c=json.loads(${JSON.stringify(JSON.stringify(cases))})
print(json.dumps([m.camera_position(b['position'],b['target'],v['preset'],v['t']) for v in c]))`], { cwd: root, encoding: 'utf8' });
assert.equal(python.status, 0, python.stderr);
const expected = JSON.parse(python.stdout);
cases.forEach((item, i) => {
  const actual = revealCamera(base, item.preset, item.t);
  actual.position.forEach((value, axis) => assert.ok(Math.abs(value - expected[i][axis]) < 1e-12));
  assert.deepEqual(actual.target, base.target); assert.equal(actual.fov, base.fov);
});
assert.deepEqual(revealCamera(base, 'reveal', 0), base);
const radius = position => Math.hypot(...position.map((v, i) => v - base.target[i]));
assert.ok(Math.abs(radius(revealCamera(base, 'reveal', 1).position) / radius(base.position) - 1.12) < 1e-12);
for (const item of cases.filter(c => c.preset === 'orbit')) assert.ok(Math.abs(radius(revealCamera(base, item.preset, item.t).position) - radius(base.position)) < 1e-12);
console.log('Reveal camera: 192 browser/Blender samples agree; focus and radius constraints pass.');
