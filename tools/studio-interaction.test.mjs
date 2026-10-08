/** Execute the production pointer callbacks: mode separation must protect ink. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { build, transformSync } from 'esbuild';
import * as THREE from 'three';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = await fs.readFile(path.join(root, 'src/ModelWithUVTattoo.tsx'), 'utf8');
const tree = ts.createSourceFile('ModelWithUVTattoo.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, scope) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) expression = node.initializer.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(expression, `Find production ${name}`);
  return new Function('scope', `with(scope){return ${transformSync(`(${expression})`, { loader: 'ts' }).code}}`)(scope);
}
const bundle = await build({ stdin: { contents: "export * from './src/model/tattooHit'; export * from './src/render/skinDetail';", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false });
const production = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
geometry.setAttribute('aTattooUv', new THREE.Float32BufferAttribute([-.5, -.5, .5, -.5, 0, .5], 2));
geometry.setAttribute('aTattooMask', new THREE.Float32BufferAttribute([1, 1, 1], 1));
const anchor = { bodyMeshId: 'body', faceIndex: 0, barycentric: [.25, .25, .5] };
const ref = current => ({ current });

function app(mode = 'tattoo') {
  const mesh = new THREE.Mesh(geometry), captured = [], placed = [], selected = [], framed = [];
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 100); camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const scope = {
    THREE, ...production, interactionMode: mode, editingEnabled: true, visible: true,
    bodyMeshRef: ref(mesh), anchorRef: ref(anchor), hasPlacedRef: ref(true), isDragging: ref(false),
    pointerStart: ref(null), grabOffset: ref({ x: 0, y: 0 }), pendingMove: ref(null), dragFrame: ref(null),
    pickBlockedRef: ref(false), size: 1, imageAspect: 1, rotationRad: 0, camera,
    pick: event => { captured.push(event); return { region: 'torso', anchor }; },
    applyAnchor: value => placed.push(value), onRegionPress: (...args) => selected.push(args),
    regionFraming: region => ({ region }), onFrameRegion: value => framed.push(value),
    onPlacementStatus: () => {}, setOrbitEnabled: () => {},
    gl: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), setPointerCapture() {}, hasPointerCapture: () => false, style: {} } },
  };
  const down = callback('onPointerDown', scope), up = callback('finishPointer', scope);
  const event = (type, extras = {}) => ({ type, clientX: 45, clientY: 50, pointerId: 1, isPrimary: true, button: 0, preventDefault() {}, ...extras });
  return { scope, down: extras => down(event('pointerdown', extras)), up: extras => up(event('pointerup', extras)), placed, selected, framed, captured };
}
for (const modifier of [{}, { ctrlKey: true }, { metaKey: true }]) {
  const a = app('model'); a.down(modifier); a.up();
  assert.equal(a.placed.length, 0, 'Model clicks/modifiers cannot move a tattoo');
  assert.equal(a.selected.length, 1); assert.deepEqual(a.framed, [{ region: 'torso' }]);
}
{
  const a = app('model'); a.down(); a.scope.pointerStart.current.moved = true; a.up();
  assert.equal(a.selected.length, 0, 'Orbit drag cannot select a body part'); assert.equal(a.placed.length, 0);
}
{
  const a = app(); a.down(); assert.equal(a.scope.isDragging.current, true, 'Grab an existing design without modifiers');
  assert.equal(a.placed.length, 0, 'Grabbing keeps tattoo centre stable');
  assert.ok(Math.abs(a.scope.grabOffset.current.x - 5) < 1e-6, 'Grab offset follows projected centre');
  a.scope.pointerStart.current.moved = true; a.up({ clientX: 55 });
  assert.equal(a.placed.length, 1); assert.equal(a.captured.at(-1).clientX, 60, 'Drag preserves the grab offset');
}
{
  const a = app(); a.down(); a.up(); assert.equal(a.placed.length, 0, 'A tap on placed ink cannot recenter it');
}
{
  const a = app(); a.scope.editingEnabled = false; a.down({ ctrlKey: true }); a.up();
  assert.equal(a.placed.length, 0); assert.equal(a.selected.length, 0, 'Shoot mode protects all edits');
}
{
  const a = app(); a.scope.anchorRef.current = { ...anchor, wrap: { region: 'armLeft', position: .68, height: .024, phase: 0 } };
  a.down({ ctrlKey: true }); a.up();
  assert.equal(a.placed.length, 0, 'Orbiting or modifier clicks never replace a periodic band with a local patch');
  assert.equal(a.scope.isDragging.current, false);
}
assert.equal(production.isTattooHit(geometry, anchor, 1, 1, 0), true);
const right = { ...anchor, barycentric: [0, .8, .2] };
assert.equal(production.isTattooHit(geometry, right, 1, .25, 0), false, 'Narrow tattoo leaves adjacent skin available for orbit');
assert.equal(production.isTattooHit(geometry, { ...anchor, barycentric: [.1, .1, .8] }, 1, .25, Math.PI / 2), false, 'Rotation also rotates hit footprint');
geometry.attributes.aTattooMask.setX(0, 0);
assert.equal(production.isTattooHit(geometry, anchor, 1, 1, 0), false, 'Rejected faces cannot grab ink');

production.bindSkinRestCoordinates(geometry, new THREE.Matrix4().makeScale(2.4, 2.4, 2.4));
const rest = geometry.attributes.aSkinRest.array.slice(), normals = geometry.attributes.aSkinNormal.array.slice();
geometry.attributes.position.setXYZ(0, -3, 2, 1); geometry.computeVertexNormals();
assert.deepEqual(geometry.attributes.aSkinRest.array, rest, 'Body deformation does not slide rest-space texture');
assert.deepEqual(geometry.attributes.aSkinNormal.array, normals, 'Triplanar blending stays attached through pose');
assert.ok(Math.abs(rest[0] + 1) < 1e-6, 'Nominal 2.4 browser units equal one metre');

const cardBundle = await build({
  stdin: { contents: "export { default } from './src/model/BodyRegionCard'; export {DEFAULT_BODY_SHAPE} from './src/render/bodyShape';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{ name: 'controlled-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: args.path, namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'react'
      ? 'export const useEffect=()=>{};export const useId=()=>"card";export const useRef=current=>({current});export const useState=value=>[value,()=>{}];'
      : 'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";' }));
  } }],
});
const cardModule = await import(`data:text/javascript;base64,${Buffer.from(cardBundle.outputFiles[0].text).toString('base64')}`);
function elements(tree, out = []) {
  if (Array.isArray(tree)) tree.forEach(child => elements(child, out));
  else if (tree && typeof tree === 'object') { out.push(tree); elements(tree.props?.children, out); }
  return out;
}
let shape = { ...cardModule.DEFAULT_BODY_SHAPE }, measureCalled = false;
const props = { region: 'torso', x: 40, y: 80, shape, onClose() {}, onChange(key, value) { shape[key] = value; }, onMeasure() { measureCalled = true; } };
const controls = elements(cardModule.default(props));
const ranges = controls.filter(el => el.type === 'input');
assert.equal(ranges.length, 6, 'Only the selected region controls appear');
for (const range of ranges) { assert.equal(range.props.type, 'range'); assert.ok(range.props['aria-label']); assert.equal(range.props.step, .01); }
ranges[0].props.onChange({ target: { value: '99' } }); assert.equal(shape.chest, 1, 'Out of bounds UI input is clamped');
ranges[0].props.onChange({ target: { value: 'invalid' } }); assert.equal(shape.chest, 0);
const fitted = elements(cardModule.default({ ...props, fitted: true }));
assert.equal(fitted.filter(el => el.type === 'input').length, 0, 'Measurement fitting cannot be overwritten by shape sliders');
fitted.find(el => el.type === 'button' && el.props.children === 'Edit measurements').props.onClick();
assert.equal(measureCalled, true);
console.log('Studio interactions passed: anatomy selection protects tattoo, orbit vs click, edit lock, offset-preserving direct drag, aspect/rotation/face-safe hit area, stable metric skin coordinates.');
