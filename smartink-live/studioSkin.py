"""Calibrated, opt-in skin microrelief shared with the viewport height asset.

The authored Soft cells bake is a seamless 16 mm tile encoding -20 to +10 µm.
These are artistic physical dimensions, not clinically measured skin anatomy.
Rest attributes retain the pattern through fit/pose without changing tattoo UVs.
"""
import bpy
import json
from mathutils import Vector
from pathlib import Path

# One source of physical dimensions for browser preview and Blender.
PROFILE = json.loads(Path(__file__).with_name('skinProfile.json').read_text())

POSITION = 'smartink_skin_rest'
NORMAL = 'smartink_skin_normal'


def bind_rest_skin(body):
    body.update_tag()
    bpy.context.view_layer.update()
    scale = max(float(body.dimensions.z) / 1.75, .05)
    normal_matrix = body.matrix_world.to_3x3().inverted().transposed()
    positions = body.data.attributes.get(POSITION) or body.data.attributes.new(POSITION, 'FLOAT_VECTOR', 'POINT')
    normals = body.data.attributes.get(NORMAL) or body.data.attributes.new(NORMAL, 'FLOAT_VECTOR', 'POINT')
    for vertex in body.data.vertices:
        p = (body.matrix_world @ vertex.co) / scale
        n = (normal_matrix @ vertex.normal).normalized()
        # Browser +Y-up/+Z-forward; Blender +Z-up/-Y-forward.
        positions.data[vertex.index].vector = Vector((p.x, p.z, -p.y))
        normals.data[vertex.index].vector = Vector((n.x, n.z, -n.y))


def apply_studio_skin(body, texture_path, world_scale):
    if not texture_path:
        raise RuntimeError('Studio skin height texture is missing; the requested material cannot be rendered.')
    if not body.data.attributes.get(POSITION):
        raise RuntimeError('Studio skin rest coordinates are missing.')
    material = body.data.materials[0]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    if not any(n.label == 'Sculpt normal bake' and n.type == 'TEX_IMAGE' and n.image for n in nodes):
        raise RuntimeError('The body sculpt normal is missing; Studio skin requires its packaged body texture.')
    bump = next((n for n in nodes if n.label == 'Skin micro-relief'), None)
    if bump is None:
        raise RuntimeError('Studio skin needs the existing skin bump chain.')
    def node(kind, label):
        result = nodes.new(kind); result.label = label; return result
    def math(operation, a, b):
        result = node('ShaderNodeMath', 'Studio skin ' + operation); result.operation = operation
        for index, value in enumerate((a, b)):
            if isinstance(value, (int, float)): result.inputs[index].default_value = value
            else: links.new(value, result.inputs[index])
        return result.outputs[0]
    coordinates = node('ShaderNodeAttribute', 'Studio skin rest metres'); coordinates.attribute_name = POSITION
    normals = node('ShaderNodeAttribute', 'Studio skin rest normals'); normals.attribute_name = NORMAL
    frequency = node('ShaderNodeVectorMath', 'Studio skin 16 mm tile'); frequency.operation = 'SCALE'
    frequency.inputs[3].default_value = 1 / PROFILE['tileMetres']
    links.new(coordinates.outputs['Vector'], frequency.inputs[0])
    separate = node('ShaderNodeSeparateXYZ', 'Studio skin coordinates'); links.new(frequency.outputs[0], separate.inputs[0])
    axes = node('ShaderNodeSeparateXYZ', 'Studio skin normal axes'); links.new(normals.outputs['Vector'], axes.inputs[0])
    weights = [math('POWER', math('ABSOLUTE', axes.outputs[i], 0), 6) for i in range(3)]
    total = math('MAXIMUM', math('ADD', math('ADD', weights[0], weights[1]), weights[2]), .00001)
    image = bpy.data.images.load(texture_path, check_existing=True); image.colorspace_settings.name = 'Non-Color'
    height = 0
    for axis, (u, v) in enumerate(((1, 2), (0, 2), (0, 1))):
        combine = node('ShaderNodeCombineXYZ', 'Studio skin projection')
        links.new(separate.outputs[u], combine.inputs[0]); links.new(separate.outputs[v], combine.inputs[1])
        texture = node('ShaderNodeTexImage', 'Studio Soft cells height'); texture.image = image
        texture.extension = 'REPEAT'; texture.interpolation = 'Linear'
        links.new(combine.outputs[0], texture.inputs['Vector'])
        height = math('ADD', height, math('MULTIPLY', texture.outputs['Color'], math('DIVIDE', weights[axis], total)))
    links.new(height, bump.inputs['Height'])
    bump.inputs['Strength'].default_value = .35
    bump.inputs['Distance'].default_value = PROFILE['heightMetres'] * world_scale
    # Preserve sculpt Normal input, existing regional colour and roughness, and
    # the downstream ink composition. Relief is shared across bare and inked skin.
    body['smartink_skin_material'] = 'studio-v1'
    body['smartink_skin_tile_metres'] = PROFILE['tileMetres']
    body['smartink_skin_profile_version'] = PROFILE['version']
    # Save the recipe for the subsequent pigment/curve bake. The current Blender
    # node tree still implements relief only; this is not a parity claim.
    body['smartink_skin_recipe'] = json.dumps(PROFILE, sort_keys=True)


def apply_shared_skin(body, body_mesh_id, skin_tone_id, contract_dir, world_scale):
    """Use the same versioned UV data and physical pore scale as the viewport."""
    import hashlib
    import sceneImporter as importer
    manifest = json.loads(Path(__file__).with_name('skinAtlasManifest.json').read_text())
    sex = 'female' if body_mesh_id == 'body_full_female' else 'male'
    paths = {}
    for kind in ('appearance', 'regions'):
        name = f'skin-{sex}-{kind}-v3.png'
        path = importer._resolve_texture(contract_dir, name)
        if not path or hashlib.sha256(Path(path).read_bytes()).hexdigest() != manifest['files'][name]:
            raise RuntimeError(f'Shared skin v3 requires the matching packaged material: {name}')
        paths[kind] = path
    apply_studio_skin(body, importer._resolve_texture(contract_dir, 'soft-cells-height.png'), world_scale)
    mat = body.data.materials[0]
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    def node(kind, label):
        n = nodes.new(kind); n.label = label; return n
    def assign(socket, value):
        for link in list(socket.links): links.remove(link)
        if isinstance(value, (int, float, tuple)): socket.default_value = value
        else: links.new(value, socket)
    def calc(op, a, b):
        n = node('ShaderNodeMath', 'Shared skin ' + op); n.operation = op
        assign(n.inputs[0], a); assign(n.inputs[1], b); return n.outputs[0]
    def combine(values, label):
        n = node('ShaderNodeCombineXYZ', label)
        for i, value in enumerate(values): assign(n.inputs[i], value)
        return n.outputs[0]
    def vector_multiply(a, b):
        n = node('ShaderNodeVectorMath', 'Shared skin colour'); n.operation = 'MULTIPLY'
        assign(n.inputs[0], a); assign(n.inputs[1], b); return n.outputs[0]
    maps = {}
    uv = node('ShaderNodeUVMap', 'Shared skin source atlas'); uv.uv_map = body.data.uv_layers.active.name
    for kind, path in paths.items():
        tex = node('ShaderNodeTexImage', 'Shared skin ' + kind)
        tex.image = bpy.data.images.load(path, check_existing=True); tex.image.colorspace_settings.name = 'Non-Color'
        tex.interpolation = 'Linear'; tex.extension = 'EXTEND'; links.new(uv.outputs['UV'], tex.inputs['Vector'])
        split = node('ShaderNodeSeparateXYZ', 'Shared skin ' + kind + ' channels'); links.new(tex.outputs['Color'], split.inputs[0]); maps[kind] = split.outputs
    spots = calc('MULTIPLY', maps['appearance'][0], .2)
    pigment = calc('MULTIPLY', calc('SUBTRACT', maps['appearance'][2], .5), .2)
    base = tuple(importer.srgb_to_linear(c) for c in importer.SKIN_TONES[skin_tone_id])
    colour = vector_multiply(base, combine([calc('ADD', 1, calc('MULTIPLY', pigment, c)) for c in (.45, 1., 1.15)], 'Shared skin pigment'))
    colour = vector_multiply(colour, combine([calc('SUBTRACT', 1, spots)] * 3, 'Shared skin spots'))
    colour = vector_multiply(colour, combine([calc('ADD', 1, calc('MULTIPLY', maps['regions'][0], c)) for c in (-.075, -.012, .018)], 'Shared skin veins'))
    assign(bsdf.inputs['Base Color'], colour)
    bump = next(n for n in nodes if n.label == 'Skin micro-relief')
    height = bump.inputs['Height'].links[0].from_socket
    rough = calc('ADD', calc('ADD', .56, calc('MULTIPLY', calc('SUBTRACT', height, .5), .14)), calc('MULTIPLY', pigment, .7))
    rough = calc('MINIMUM', .68, calc('MAXIMUM', .44, rough)); assign(bsdf.inputs['Roughness'], rough)
    assign(bump.inputs['Strength'], 1.)
    assign(bump.inputs['Distance'], calc('MULTIPLY', maps['regions'][1], 2 * PROFILE['heightMetres'] * world_scale * .9))
    assign(bsdf.inputs['Normal'], bump.outputs['Normal'])
    normal = next(n for n in nodes if n.label == 'Sculpt normal')
    normal.inputs['Strength'].default_value = .75
    # No separate legacy colour zoning, oil or extra body groom over the shared recipe.
    for key, value in [('Subsurface Weight', .035), ('Coat Weight', 0.), ('Sheen Weight', 0.), ('Metallic', 0.), ('IOR', 1.4), ('Specular IOR Level', .35)]:
        if key in bsdf.inputs: assign(bsdf.inputs[key], value)
    body['smartink_skin_material'] = 'studio-v3'
    body['smartink_skin_atlas_version'] = 3
    body['smartink_skin_base_colour'] = base
    body['smartink_skin_atlas_resolution'] = manifest['resolution']


def apply_shared_hair_over_ink(body):
    """The browser's surface-coverage hairs are above ink, not a separate groom."""
    mat = body.data.materials[0]; nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    channels = next(n for n in nodes if n.label == 'Shared skin appearance channels')
    amount = nodes.new('ShaderNodeMath'); amount.operation = 'MINIMUM'; amount.label = 'Shared fine hair coverage'
    amount.inputs[1].default_value = .65; links.new(channels.outputs[1], amount.inputs[0])
    mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MIX'; mix.label = 'Shared fine hairs over ink'
    base = bsdf.inputs['Base Color']; links.new(base.links[0].from_socket, mix.inputs[1])
    mix.inputs[2].default_value = (*(float(c) * .38 for c in body['smartink_skin_base_colour']), 1.)
    links.new(amount.outputs[0], mix.inputs[0]); links.new(mix.outputs[0], base)
