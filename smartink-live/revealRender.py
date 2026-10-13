"""A bounded camera-only sequence. Encoding is performed by the parent API.

blender -b --python revealRender.py -- contract.json
The public contract is exactly four seconds at 24 fps. --proof-frames is only
an offline diagnostic option, never accepted from an API request.
"""
import json
import math
from pathlib import Path
import sys


def camera_position(position, target, preset, progress):
    t = max(0, min(1, progress)); t = t * t * (3 - 2 * t)
    x, y, z = [position[i] - target[i] for i in range(3)]
    if preset == 'reveal':
        factor = 1 + .12 * t; x, y, z = x * factor, y * factor, z * factor
    elif preset == 'orbit':
        angle = math.radians(-6 + 12 * t)
        x, z = x * math.cos(angle) + z * math.sin(angle), z * math.cos(angle) - x * math.sin(angle)
    else:
        raise ValueError('Unsupported motion preset')
    return [x + target[0], y + target[1], z + target[2]]


def render_sequence(contract_path, proof_frames=None):
    import bpy
    from mathutils import Vector
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import sceneImporter as importer
    contract_path = Path(contract_path).resolve()
    contract = json.loads(contract_path.read_text())
    reveal = contract['reveal']
    if reveal != {'version': 1, 'preset': reveal.get('preset'), 'durationSeconds': 4, 'fps': 24} or reveal['preset'] not in ('reveal', 'orbit'):
        raise ValueError('Motion requires a version 1 four-second, 24 fps preset')
    if contract['camera'].get('preserveFraming') is not True:
        raise ValueError('Motion requires preserveFraming')
    importer.build_scene(str(contract_path))
    scene = bpy.context.scene; camera = scene.camera
    scene.cycles.seed = 120
    scene.cycles.use_animated_seed = False
    scene.render.use_persistent_data = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.fps = 24
    total = 96 if proof_frames is None else max(2, min(96, int(proof_frames)))
    config = contract['camera']; target = Vector(importer.three_to_blender_position(config['target']))
    positions = [Vector(importer.three_to_blender_position(camera_position(config['position'], config['target'], reveal['preset'], frame / (total - 1)))) for frame in range(total)]
    # Check the actual posed mesh and clothes before paying for any frames.
    # This rejects hidden/occluded tattoo targets rather than moving a camera
    # differently from its browser preview to work around an obstruction.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    body = bpy.data.objects.get('Body')
    tolerance = max(.025, float(body.get('smartink_rest_height', 4.2)) * .012) if body else .05
    for position in positions:
        direction = target - position; distance = direction.length
        if distance < .01: raise ValueError('The camera is too close to the tattoo; zoom out before exporting motion.')
        hit, location, normal, face, obj, matrix = scene.ray_cast(depsgraph, position, direction.normalized(), distance=distance + tolerance)
        if hit and (location - position).length < distance - tolerance:
            raise ValueError('The motion path passes behind part of the model. Choose a clearer angle or Slow reveal.')
    frames = contract_path.parent / 'frames'; frames.mkdir(exist_ok=True)
    for index, position in enumerate(positions):
        camera.location = position
        camera.rotation_euler = (target - position).to_track_quat('-Z', 'Y').to_euler()
        # Track the composed target optically, not a stale first-frame distance.
        if camera.data.dof.use_dof:
            camera.data.dof.focus_object = None
            camera.data.dof.focus_distance = (target - position).length
        scene.render.filepath = str(frames / f'frame-{index + 1:04d}.png')
        bpy.ops.render.render(write_still=True)
        print(f'SMARTINK_VIDEO_FRAME {index + 1}/{total}', flush=True)
    report = {'version': 1, 'preset': reveal['preset'], 'frames': total, 'fps': 24,
              'width': scene.render.resolution_x, 'height': scene.render.resolution_y,
              'firstCamera': list(positions[0]), 'lastCamera': list(positions[-1]),
              'bodyStatic': True, 'lightingStatic': True, 'seed': 120,
              'skinMaterial': body.get('smartink_skin_material', 'legacy') if body else 'unknown'}
    (contract_path.parent / 'sequence.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    proof = int(args[args.index('--proof-frames') + 1]) if '--proof-frames' in args else None
    render_sequence(args[0], proof)
