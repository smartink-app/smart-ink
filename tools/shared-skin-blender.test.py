"""blender -b --python-exit-code 1 --python tools/shared-skin-blender.test.py -- /absolute/output"""
import hashlib
import json
import os
from pathlib import Path
import sys
import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'smartink-live'))
import sceneImporter as importer

out = Path(sys.argv[sys.argv.index('--') + 1]); out.mkdir(parents=True, exist_ok=True)
contract = json.loads((ROOT / 'smartink-live/contract_arm.json').read_text())
contract.update(skinMaterial='studio', skinProfileVersion=3, renderStyle='cinematic',
                poseId='neutral', bodyHair='vellus', bodyAppearance={'top':'none','bottom':'none','hairStyle':'none'})
contract['camera'].update(position=[0, .7, 3], target=[0, .7, 0], preserveFraming=True, depthOfField=False)
if os.environ.get('SKIN_TEST_REGION'): contract['bodyRegion'] = os.environ['SKIN_TEST_REGION']
if os.environ.get('SKIN_TEST_BODY'): contract['bodyMeshId'] = os.environ['SKIN_TEST_BODY']
if os.environ.get('SKIN_TEST_TONE'): contract['skinToneId'] = os.environ['SKIN_TEST_TONE']
contract['output'] = dict(qualityTier='final', width=480, height=600, samples=32)
ink = bpy.data.images.new('Test ink', width=32, height=32, alpha=True)
ink.pixels = [v for y in range(32) for x in range(32) for v in (0.03, 0.03, 0.03, .8 if abs(x-y)<2 else 0)]
ink.filepath_raw = str(out / 'ink.png'); ink.file_format = 'PNG'; ink.save()
path = out / 'contract.json'; path.write_text(json.dumps(contract))
importer.build_scene(str(path))
body = bpy.data.objects['Body']; mat = body.data.materials[0]
assert body['smartink_closeup_segments'] == 3
if contract.get('bodyRegion'): assert bpy.data.objects.get('Closed focus ends') is not None
assert body['smartink_skin_material'] == 'studio-v3'
assert body['smartink_skin_atlas_resolution'] == 4096
for kind in ('appearance', 'regions'):
    tex = importer._node_by_label(mat, 'Shared skin ' + kind)
    assert tex and tex.image.colorspace_settings.name == 'Non-Color'
assert importer._node_by_label(mat, 'Shared fine hairs over ink')
assert not importer._node_by_label(mat, 'Roughness under ink'), 'Shared ink must keep shared pore roughness'
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
assert bsdf.inputs['Normal'].links[0].from_node.label == 'Skin micro-relief'
assert bsdf.inputs['Base Color'].links[0].from_node.label == 'Shared fine hairs over ink'
assert bsdf.inputs['Roughness'].is_linked
assert importer._node_by_label(mat, 'Skin micro-relief').inputs['Distance'].is_linked
assert not any(p.settings.name.startswith('body_') for p in body.particle_systems)
# Missing atlas must fail rather than silently substituting a different material.
manifest_path = ROOT / 'smartink-live/skinAtlasManifest.json'
manifest = json.loads(manifest_path.read_text())
for name, digest in manifest['files'].items():
    assert hashlib.sha256((ROOT / 'public/textures' / name).read_bytes()).hexdigest() == digest
scene = bpy.context.scene
scene.cycles.device = 'CPU'
scene.render.filepath = str(out / 'shared-skin-blender.png')
bpy.ops.render.render(write_still=True)
(out / 'verification.json').write_text(json.dumps({'skinMaterial': body['smartink_skin_material'], 'maps': manifest['files'], 'render': str(scene.render.filepath), 'sharedRoughness': True, 'hairOverInk': True}, indent=2))
print('Shared skin Blender material and native render passed.')
