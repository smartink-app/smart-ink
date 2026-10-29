"""blender -b --python-exit-code 1 --python tools/regional-skin-study.py -- CONTRACT OUTPUT
Uses an existing local exported contract and its adjacent assets. No paid compute.
"""
import json,sys
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'smartink-live'))
import sceneImporter as imp
from studioSkin import POSITION,NORMAL
from regionalSkin import apply_regional_skin
args=sys.argv[sys.argv.index('--')+1:];source=Path(args[0]).resolve();out=Path(args[1]).resolve();out.mkdir(parents=True,exist_ok=True)
cases=[('arm',None,None,1),('arm-close',None,None,.55),('elbow',(.3,.25,0),(0,0,-1),.7),('knee',(.08,-.38,0),(0,0,1),.7),('chest',(.08,.40,0),(0,0,1),.85),('neck',(0,.64,0),(0,0,1),.55),('leg',(.10,-.55,0),(0,0,1),1),('arm-dark',None,None,1)]
if len(args)>2: cases=[case for case in cases if case[0] in args[2].split(",")]
results=[]
for name,target,facing,zoom in cases:
 for regional in [False,True]:
  contract=json.loads(source.read_text());contract['output'].update(width=768,height=960,samples=128)
  contract['camera']['depthOfField']=False
  if name=='arm-dark':contract['skinToneId']='tone_05'
  if target:contract.pop('bodyRegion',None)
  path=source.parent/'regional-study-contract.json';path.write_text(json.dumps(contract));imp.build_scene(str(path))
  body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('smartink_skin_material')=='studio-v3')
  if target:
   rest=body.data.attributes[POSITION].data;normals=body.data.attributes[NORMAL].data;t=Vector(target);f=Vector(facing)
   valid=[i for i in range(len(body.data.vertices)) if normals[i].vector.dot(f)>.65]
   i=min(valid,key=lambda i:(rest[i].vector-t).length_squared)
   center=body.matrix_world@body.data.vertices[i].co
   normal=(body.matrix_world.to_3x3().inverted().transposed()@body.data.vertices[i].normal).normalized()
   camera=bpy.context.scene.camera;camera.location=center+normal*zoom;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
   # Neutral three-softbox rig aimed at this exact surface, same for each pair.
   for o in list(bpy.context.scene.objects):
    if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
   right=normal.cross(Vector((0,0,1))).normalized();up=right.cross(normal).normalized()
   for label,dx,dy,power,size in [('Key',-.65,.45,130,.45),('Fill',.6,.1,45,.75),('Edge',.5,.55,70,.35)]:
    data=bpy.data.lights.new(label,'AREA');data.energy=power*.16;data.shape='DISK';data.size=size
    light=bpy.data.objects.new(label,data);bpy.context.collection.objects.link(light);light.location=center+normal*.8+right*dx+up*dy;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
  elif zoom!=1:
   camera=bpy.context.scene.camera;t=Vector(imp.three_to_blender_position(contract['camera']['target']));camera.location=t+(camera.location-t)*zoom
  uv_before=[tuple(loop.uv) for loop in body.data.uv_layers.active.data]
  mat=body.data.materials[0];bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  colour_before=bsdf.inputs['Base Color'].links[0].from_node
  normal_before=bsdf.inputs['Normal'].links[0].from_node
  if regional:apply_regional_skin(body)
  assert uv_before==[tuple(loop.uv) for loop in body.data.uv_layers.active.data]
  assert bsdf.inputs['Base Color'].links[0].from_node==colour_before
  assert bsdf.inputs['Normal'].links[0].from_node==normal_before
  assert bpy.context.scene.camera.data.dof.use_dof is False
  file=name+('-regional' if regional else '-baseline')+'.png';bpy.context.scene.render.filepath=str(out/file)
  bpy.ops.render.render(write_still=True)
  results.append({'case':name,'regional':regional,'file':file,'samples':128,'size':[768,960]})
  (out/'results.json').write_text(json.dumps(results,indent=2));print('REGIONAL_RENDER',file,flush=True)
