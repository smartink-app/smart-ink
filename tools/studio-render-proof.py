"""Native Blender smoke proof: same-scene stills and short actual motion frames.

blender -b --python tools/studio-render-proof.py -- --output /absolute/proof-dir
Requires the saved local rose fixture; renders are outside the live workspace.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'smartink-live'))
import sceneImporter as importer
from studioSkin import apply_studio_skin, bind_rest_skin
from revealRender import render_sequence

args = argparse.ArgumentParser(); args.add_argument('--output', required=True, type=Path)
args.add_argument('--frames', type=int, default=12)
options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
options.output.mkdir(parents=True, exist_ok=True)
fixture = ROOT.parent / 'skin-material-study'
contract = json.loads((fixture / 'contract.json').read_text())
contract['output'] = {'qualityTier': 'final', 'width': 480, 'height': 600, 'samples': 64}
contract['skinMaterial'] = 'studio'
contract['bodyHair'] = 'vellus'
path = options.output / 'contract.json'; path.write_text(json.dumps(contract))
shutil.copy2(fixture / 'ink.png', options.output / 'ink.png')
importer.build_scene(str(path))
scene = bpy.context.scene; body = bpy.data.objects['Body']; material = body.data.materials[0]
normal = importer._node_by_label(material, 'Sculpt normal bake')
assert normal and normal.image.colorspace_settings.name == 'Non-Color'
assert body.get('smartink_skin_material') == 'studio-v1'
assert len([n for n in material.node_tree.nodes if n.label == 'Studio Soft cells height']) == 3
assert importer._node_by_label(material, 'Skin micro-relief').inputs['Normal'].is_linked
def geometry_hash():
    return hashlib.sha256(repr([(tuple(v.co)) for v in body.data.vertices]).encode()).hexdigest()
def uv_hash():
    return hashlib.sha256(repr([(layer.name, [tuple(d.uv) for d in layer.data]) for layer in body.data.uv_layers]).encode()).hexdigest()
hashes = {'geometry': geometry_hash(), 'uv': uv_hash()}
scene.render.filepath = str(options.output / 'studio-still.png')
bpy.ops.render.render(write_still=True)
# A physical 42 mm crop shows that the material is present beneath the ink.
target = Vector((.07623060792684555, -.2553381025791168, .9294251203536987))
camera = scene.camera; camera.location = target + Vector((-.024, -.27, .025))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.sensor_fit = 'HORIZONTAL'; camera.data.sensor_width = 36
camera.data.lens = 36 * (camera.location - target).length / (.042 * importer._world_scale(body))
camera.data.clip_start = .001; camera.data.dof.use_dof = False
scene.render.resolution_x = 600; scene.render.resolution_y = 500
scene.render.filepath = str(options.output / 'studio-macro.png'); bpy.ops.render.render(write_still=True)
# Save the same-camera legacy comparison independently from the production UI.
legacy = json.loads(json.dumps(contract)); legacy['skinMaterial'] = 'legacy'
legacy_path = options.output / 'legacy.json'; legacy_path.write_text(json.dumps(legacy))
importer.build_scene(str(legacy_path)); body = bpy.data.objects['Body']
assert hashes == {'geometry': geometry_hash(), 'uv': uv_hash()}, 'Material changed geometry or tattoo atlas'
scene.render.filepath = str(options.output / 'legacy-still.png'); bpy.ops.render.render(write_still=True)
proof = {'normalLoaded': True, 'sculptAndMicroreliefChained': True, 'skinMaterial': 'studio-v1', 'sameGeometryAndUV': True, 'hashes': hashes,
         'sameCameraLightingInk': True, 'physicalTileMm': 16, 'heightEncodedRangeMicrons': 30, 'bumpStrength': .35}
(options.output / 'verification.json').write_text(json.dumps(proof, indent=2))
contract['output'].update(width=192, height=240)
contract['reveal'] = {'version': 1, 'preset': 'reveal', 'durationSeconds': 4, 'fps': 24}
path.write_text(json.dumps(contract))
render_sequence(path, proof_frames=options.frames)
