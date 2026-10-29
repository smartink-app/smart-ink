"""Native Blender before/after proof for localised tattoo atlases, using identical scenes."""
import ast, importlib.util, json, sys
from pathlib import Path
import bpy
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'smartink-live'))
import sceneImporter as imp
OUT=Path('/tmp/smartink-realism-study/native'); OUT.mkdir(parents=True,exist_ok=True)
source=(ROOT/'tools/render-realism-native.py').read_text()
fn=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='tattoo_fixture')
fixture=ast.get_source_segment(source,fn).replace('size = 2048','size = 4096')
fixture=fixture.replace('uv = np.array([tuple(uvs[i].uv) for i in tri.loops]) * size', 'uv = (np.array([tuple(uvs[i].uv) for i in tri.loops]) - UV_REGION[:2]) / UV_REGION[2:] * size')
fixture=fixture.replace('    bpy.data.images.remove(image)', '''    bpy.data.images.remove(image)
    ys,xs=np.nonzero(pixels[:,:,3]); lo=np.maximum(0,np.array([xs.min(),ys.min()])-8); hi=np.minimum(size,np.array([xs.max(),ys.max()])+9)
    return [*(lo/size), *((hi-lo)/size)]''')
exec(fixture,globals())
region=None
for name in ['baseline','localized']:
 folder=OUT/name; folder.mkdir(exist_ok=True)
 for filename in ['body_full.blend','body_full_female.blend']:
  (folder/filename).symlink_to(ROOT/'smartink-live'/filename) if not (folder/filename).exists() else None
 assets=folder/'assets';assets.mkdir(exist_ok=True)
 for path in [*(ROOT/'server/runpod/textures').glob('*.png'),*(ROOT/'public/textures').glob('skin-*-v3.png'),ROOT/'smartink-live/assets/skins.blend']:
  (assets/path.name).symlink_to(path) if not (assets/path.name).exists() else None
 UV_REGION=np.array(region or [0,0,1,1]); bounds=tattoo_fixture('body_full',folder)
 contract={'schemaVersion':1,'bodyMeshId':'body_full','skinToneId':'tone_03','poseId':'neutral','lookId':'studio_softbox','inkTextureUrl':'ink.png','skinMaterial':'studio','skinProfileVersion':3,'renderStyle':'cinematic','bodyHair':'none','showEyes':False,'camera':{'position':[0,.735,2.6],'target':[0,.735,.34],'fov':25,'aspect':.8,'preserveFraming':True,'depthOfField':False},'studio':{'mode':'plain','color':'#292d33','shadow':0},'output':{'qualityTier':'final','width':960,'height':1200,'samples':128}}
 if region:contract['inkUvRegion']=region
 (folder/'contract.json').write_text(json.dumps(contract))
 imp.build_scene(str(folder/'contract.json'))
 bpy.context.scene.render.filepath=str(OUT/(name+'.png'))
 bpy.ops.render.render(write_still=True)
 if region is None:region=bounds
 print('REGION_PROOF',name,region,flush=True)
(OUT/'region.json').write_text(json.dumps(region))
