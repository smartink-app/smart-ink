"""Bake Blender's static room diffuse lighting/materials for the live preview.
Run with Blender -b smartink-live/environments/heritage-atelier.blend -P this script.
Original .blend is unchanged. Specular reflections remain live in the browser.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
out=root/'public/environments/heritage-atelier'
cache=root/'reports/heritage-bake'
cache.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene
s.render.engine='CYCLES';s.cycles.samples=256;s.cycles.use_denoising=True
s.cycles.max_bounces=6
meshes=[o for o in s.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
# Preserve each object's Generated coordinates when joining the bake mesh.
for o in meshes:
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.convert(target='MESH')
 attr=o.data.attributes.new('sourceGenerated','FLOAT_VECTOR','POINT')
 lo=Vector((min(v.co.x for v in o.data.vertices),min(v.co.y for v in o.data.vertices),min(v.co.z for v in o.data.vertices)))
 hi=Vector((max(v.co.x for v in o.data.vertices),max(v.co.y for v in o.data.vertices),max(v.co.z for v in o.data.vertices)))
 for v in o.data.vertices:attr.data[v.index].vector=tuple((v.co[k]-lo[k])/max(hi[k]-lo[k],1e-6) for k in range(3))
 o.select_set(False)
for m in bpy.data.materials:
 if not m.use_nodes:continue
 tree=m.node_tree
 for n in list(tree.nodes):
  if n.type=='TEX_COORD':
   links=list(n.outputs['Generated'].links)
   if links:
    a=tree.nodes.new('ShaderNodeAttribute');a.attribute_name='sourceGenerated'
    for l in links:tree.links.new(a.outputs['Vector'],l.to_socket)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join();room=bpy.context.object;room.name='Heritage baked room'
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.003)
bpy.ops.object.mode_set(mode='OBJECT')
image=bpy.data.images.new('Heritage diffuse lighting',width=4096,height=4096,alpha=False)
for m in room.data.materials:
 m.use_nodes=True;n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;m.node_tree.nodes.active=n
s.render.bake.use_pass_direct=True;s.render.bake.use_pass_indirect=True;s.render.bake.use_pass_color=True
s.render.bake.margin=8
print('BAKING_HERITAGE',len(room.data.polygons),flush=True)
if '--reuse-bake' in sys.argv and (cache/'diffuse-lighting.png').exists():
 cached=bpy.data.images.load(str(cache/'diffuse-lighting.png'))
 image.pixels.foreach_set(list(cached.pixels));bpy.data.images.remove(cached)
else:
 bpy.ops.object.bake(type='DIFFUSE')
image.filepath_raw=str(cache/'diffuse-lighting.png');image.file_format='PNG';image.save()
# Denoise the static irradiance once offline; no per-frame browser cost.
denoise_scene=bpy.data.scenes.new('Offline lightmap denoise')
denoise_scene.render.engine='CYCLES';denoise_scene.cycles.samples=1
denoise_scene.render.resolution_x=4096;denoise_scene.render.resolution_y=4096
denoise_scene.render.resolution_percentage=100
denoise_scene.camera=bpy.data.objects.new('Bake camera',bpy.data.cameras.new('Bake camera'))
denoise_scene.collection.objects.link(denoise_scene.camera)
tree=bpy.data.node_groups.new('Offline lightmap denoise','CompositorNodeTree')
denoise_scene.compositing_node_group=tree
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
source=tree.nodes.new('CompositorNodeImage');source.image=image
denoise=tree.nodes.new('CompositorNodeDenoise');output=tree.nodes.new('NodeGroupOutput')
tree.links.new(source.outputs['Image'],denoise.inputs['Image']);tree.links.new(denoise.outputs['Image'],output.inputs['Image'])
denoise_scene.view_settings.view_transform='Standard'
denoise_scene.render.image_settings.file_format='PNG'
denoise_scene.render.filepath=str(cache/'diffuse-clean.png')
bpy.ops.render.render(scene=denoise_scene.name,write_still=True)
image=bpy.data.images.load(str(cache/'diffuse-clean.png'))
# Expose baked diffuse as glTF base color; retain original metallic materials/emission.
for m in room.data.materials:
 p=m.node_tree.nodes.get('Principled BSDF')
 if not p:continue
 if p.inputs['Metallic'].default_value>.5 or (p.inputs['Emission Strength'].default_value>0 and max(p.inputs['Emission Color'].default_value[:3])>0):continue
 tree=m.node_tree
 for link in list(p.inputs['Base Color'].links):tree.links.remove(link)
 n=tree.nodes.new('ShaderNodeTexImage');n.image=image
 tree.links.new(n.outputs['Color'],p.inputs['Base Color']);m.name+=' · BakedDiffuse'
bpy.ops.export_scene.gltf(filepath=str(out/'scene-baked.glb'),use_selection=True,export_apply=True,export_format='GLB',export_image_format='JPEG',export_jpeg_quality=92)
print('HERITAGE_BAKE_COMPLETE',flush=True)
