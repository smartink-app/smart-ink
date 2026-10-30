"""Render a local tattoo fixture through the actual branch scene importer."""
import sys,json,os
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'smartink-live'))
import sceneImporter
out=root/'reports/heritage';out.mkdir(parents=True,exist_ok=True)
fixture=Path(os.environ.get('SMARTINK_HERITAGE_FIXTURE','/tmp/smartink-realism-study/arm-localized'))
c=json.loads((fixture/'contract.json').read_text())
c['studio']={'mode':'heritage','color':'#91857b','shadow':.4,'showGuides':False}
c['camera'].update(position=[1.15,.65,2.6],target=[.81,.44,.068],fov=30,aspect=1.25,depthOfField=False)
c['output'].update(width=1000,height=800,samples=64)
import shutil
shutil.copy2(fixture/'ink.png',out/'ink.png')
c['inkTextureUrl']='ink.png';p=out/'contract.json';p.write_text(json.dumps(c))
sceneImporter.build_scene(str(p))
s=bpy.context.scene;s.render.filepath=str(out/'heritage-tattoo.png')
assert any(o.name.startswith('Heritage · ') for o in s.objects)
assert len([o for o in s.objects if o.type=='CAMERA'])==1, 'Room must not replace shot camera'
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/'heritage-tattoo.blend'))
bpy.ops.render.render(write_still=True)
print('HERITAGE_RENDER_VERIFIED',flush=True)
