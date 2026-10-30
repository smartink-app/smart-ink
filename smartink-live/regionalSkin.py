"""Blender-only reference study. Opt-in; not part of the production material.

Smooth A-pose masks use immutable rest metres. They are conservative artistic
regions, not scan registration or anatomical segmentation. No reference image
pixels are sampled. Existing pigment, tattoo UVs and sculpt normals stay intact.
"""
import math


def smooth(a, b, x):
    t = max(0., min(1., (x-a)/(b-a)))
    return t*t*(3.-2.*t)


def region_weights(position, normal):
    x, y, z = position
    h = y / 1.75 + .5
    arm = smooth(.16, .23, abs(x)) * smooth(.40, .51, h) * (1-smooth(.78, .86, h))
    leg = (1-arm) * (1-smooth(.43, .53, h)) * smooth(.06, .12, h)
    neck = (1-arm-leg) * smooth(.80, .85, h) * (1-smooth(.90, .94, h))
    torso = 1-arm-leg-neck
    # Elbow posterior and knee anterior: smoothly avoid stamping a joint all around a limb.
    elbow = arm * math.exp(-((h-.645)/.026)**2) * smooth(.05, .7, -normal[2])
    knee = leg * math.exp(-((h-.285)/.026)**2) * smooth(.05, .7, normal[2])
    return arm, leg, neck, torso, max(elbow, knee)


def apply_regional_skin(body):
    import bpy
    from studioSkin import POSITION, NORMAL, PROFILE
    mat=body.data.materials[0]; nodes, links=mat.node_tree.nodes, mat.node_tree.links
    if any(n.label=='Regional skin height' for n in nodes):
        raise RuntimeError('Regional skin study already applied')
    rest=body.data.attributes[POSITION]; normals=body.data.attributes[NORMAL]
    names=['arm','leg','neck','torso','joint']
    attrs=[body.data.attributes.new('study_skin_'+name,'FLOAT','POINT') for name in names]
    for i in range(len(body.data.vertices)):
        for attr, value in zip(attrs,region_weights(rest.data[i].vector,normals.data[i].vector)):
            attr.data[i].value=value
    def node(kind,label):
        n=nodes.new(kind);n.label=label;return n
    def assign(socket,value):
        if isinstance(value,(float,int,tuple)):socket.default_value=value
        else:links.new(value,socket)
    def calc(op,a,b):
        n=node('ShaderNodeMath','Regional '+op);n.operation=op
        assign(n.inputs[0],a);assign(n.inputs[1],b);return n.outputs[0]
    def vector(op,a,b):
        n=node('ShaderNodeVectorMath','Regional '+op);n.operation=op
        assign(n.inputs[0],a);assign(n.inputs[1],b);return n.outputs[0]
    masks={}
    for name in names:
        n=node('ShaderNodeAttribute','Regional '+name);n.attribute_name='study_skin_'+name;masks[name]=n.outputs['Fac']
    coord=node('ShaderNodeAttribute','Regional rest metres');coord.attribute_name=POSITION
    p=coord.outputs['Vector']
    warp=node('ShaderNodeTexNoise','Regional irregularity');warp.inputs['Scale'].default_value=85;warp.inputs['Detail'].default_value=2
    assign(warp.inputs['Vector'],p)
    warped=vector('ADD',p,vector('MULTIPLY',warp.outputs['Color'],(.0013,.0013,.0013)))
    def cells(stretch,frequency,width):
        v=node('ShaderNodeTexVoronoi','Regional cell lines');v.feature='DISTANCE_TO_EDGE';v.inputs['Scale'].default_value=frequency
        assign(v.inputs['Vector'],vector('MULTIPLY',warped,stretch))
        # Smooth troughs, rather than sharp polygon cracks.
        n=node('ShaderNodeMapRange','Regional soft groove');n.interpolation_type='SMOOTHERSTEP'
        assign(n.inputs['Value'],v.outputs['Distance']);n.inputs['From Min'].default_value=0;n.inputs['From Max'].default_value=width
        n.inputs['To Min'].default_value=-.5;n.inputs['To Max'].default_value=.15
        return n.outputs['Result']
    arm=cells((1.1,.7,1.1),1250,.24)
    leg=cells((1.,.8,1.),1500,.20)
    neck=cells((.7,1.5,.7),1200,.20)
    torso=cells((1.,1.,1.),1700,.10)
    regional=0.
    for name,field in [('arm',arm),('leg',leg),('neck',neck),('torso',torso)]:
        regional=calc('ADD',regional,calc('MULTIPLY',masks[name],field))
    # Irregular stretched cells avoid the regular zebra bands of a wave texture.
    fold_field=cells((.45,2.4,.45),650,.24)
    joint=calc('MULTIPLY',masks['joint'],calc('MULTIPLY',fold_field,2.0))
    bump=next(n for n in nodes if n.label=='Skin micro-relief')
    # Suppress the globally repeated broad tile; retain its fine micro-cell layer.
    for n in nodes:
        if n.label=='Studio surface lines':
            for link in list(n.outputs['Color'].links):
                dest=link.to_socket;links.remove(link);dest.default_value=.5
    original=bump.inputs['Height'].links[0].from_socket
    combined=calc('ADD',original,calc('MULTIPLY',calc('ADD',regional,joint),.38))
    combined.node.label='Regional skin height';links.new(combined,bump.inputs['Height'])
    body['smartink_regional_skin_study']=1
    return masks
