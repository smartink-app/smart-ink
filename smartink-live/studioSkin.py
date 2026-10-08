"""Calibrated, opt-in skin microrelief shared with the viewport height asset.

The authored Soft cells bake is a seamless 16 mm tile encoding -20 to +10 µm.
These are artistic physical dimensions, not clinically measured skin anatomy.
Rest attributes retain the pattern through fit/pose without changing tattoo UVs.
"""
import bpy

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
        positions.data[vertex.index].vector = (body.matrix_world @ vertex.co) / scale
        normals.data[vertex.index].vector = (normal_matrix @ vertex.normal).normalized()


def apply_studio_skin(body, texture_path, world_scale):
    if not texture_path:
        raise RuntimeError('Studio skin height texture is missing; the requested material cannot be rendered.')
    if not body.data.attributes.get(POSITION):
        raise RuntimeError('Studio skin rest coordinates are missing.')
    material = body.data.materials[0]
    nodes, links = material.node_tree.nodes, material.node_tree.links
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
    frequency.inputs[3].default_value = 1 / .016
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
    bump.inputs['Distance'].default_value = .000030 * world_scale
    # Preserve sculpt Normal input, existing regional colour and roughness, and
    # the downstream ink composition. Relief is shared across bare and inked skin.
    body['smartink_skin_material'] = 'studio-v1'
    body['smartink_skin_tile_metres'] = .016
