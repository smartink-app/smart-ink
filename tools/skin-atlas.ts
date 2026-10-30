import * as THREE from 'three';
import { GLTFLoader, DRACOLoader } from 'three-stdlib';
import { bindSkinRestCoordinates, SKIN_DETAIL_GLSL, SKIN_REGION_GLSL } from '../src/render/skinDetail';
import { classifyPoint, regionFrame, REGION_INDEX } from '../src/render/bodyRegions';

const status = document.querySelector('#status')!;
const button = document.querySelector<HTMLButtonElement>('#bake')!;
const size = 4096;
const vertexShader = `attribute vec3 aSkinRest; attribute vec3 aSkinNormal; attribute float aRegion;
varying vec3 vSkinRest; varying vec3 vSkinNormal; varying float vSkinArm; varying vec4 vSkinProfile; varying vec3 vWorldPosition;
${SKIN_REGION_GLSL}
void main(){vSkinRest=aSkinRest;vSkinNormal=aSkinNormal;vSkinProfile=skinRegion(aRegion,aSkinRest);vSkinArm=1.0-step(.1,min(abs(aRegion-2.0),abs(aRegion-3.0)));vWorldPosition=aSkinRest;gl_Position=vec4(uv.x*2.0-1.0,1.0-uv.y*2.0,0,1);}`;
const procedural = SKIN_DETAIL_GLSL.split('// A restrained dielectric sheen')[0];
async function bake(sex: string) {
 const draco=new DRACOLoader().setDecoderPath('/draco/');
 const group=(await new GLTFLoader().setDRACOLoader(draco).loadAsync(`/models/body_${sex}_realistic.glb`)).scene;
 let mesh: THREE.Mesh | undefined;
 group.traverse(o=>{if(o instanceof THREE.Mesh && (!mesh||o.geometry.attributes.position.count>mesh.geometry.attributes.position.count))mesh=o;});
 if(!mesh) throw Error('Body missing');
 const body=mesh;
 group.traverse(o=>{if(o instanceof THREE.Mesh && o!==body)o.visible=false;});
 // Match the production viewport: remove other meshes before measuring bounds.
 const others:THREE.Object3D[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o!==body)others.push(o);});others.forEach(o=>o.removeFromParent());
 group.updateMatrixWorld(true);let box=new THREE.Box3().setFromObject(group);group.scale.multiplyScalar(4.2/(box.max.y-box.min.y));group.updateMatrixWorld(true);
 box=new THREE.Box3().setFromObject(group);group.position.sub(box.getCenter(new THREE.Vector3()));group.updateMatrixWorld(true);
 const geo=body.geometry.index?body.geometry.toNonIndexed():body.geometry.clone();bindSkinRestCoordinates(geo,body.matrixWorld);
 geo.computeBoundingBox();const b=geo.boundingBox!;const frame=regionFrame({minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y});
 const positions=geo.attributes.position;geo.setAttribute('aRegion',new THREE.Float32BufferAttribute(Array.from({length:positions.count},(_,i)=>REGION_INDEX[classifyPoint(positions.getX(i),positions.getY(i),frame)]),1));
 const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(size,size);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
 const target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:false,stencilBuffer:false});
 const scene=new THREE.Scene(),camera=new THREE.Camera();
 for(const kind of ['appearance','regions']){
  status.textContent=`Baking ${sex} ${kind} at ${size} × ${size}…`;await new Promise(r=>requestAnimationFrame(r));
  const material=new THREE.ShaderMaterial({vertexShader,fragmentShader:`varying vec3 vWorldPosition;varying vec2 vUv;${procedural}\nvoid main(){${kind==='appearance'?'vec3 a=proceduralSkinAppearance();gl_FragColor=vec4(a.x/.2,a.y,a.z/.2+.5,1);':'gl_FragColor=vec4(proceduralSkinVeins()*smoothstep(.15,.9,vSkinArm),vSkinProfile.z/2.0,0,1);'}}`,uniforms:{skinDetailStrength:{value:1},skinDetailScale:{value:1}},side:THREE.DoubleSide,depthTest:false,depthWrite:false,blending:THREE.NoBlending});
  const visual=new THREE.Mesh(geo,material);visual.frustumCulled=false;scene.add(visual);renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
  const pixels=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
  // Four-texel dilation protects UV island edges and mip levels; preserve data RGB.
  for(let pass=0;pass<4;pass++){
   const previous=pixels.slice();for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){const p=(y*size+x)*4;if(previous[p+3])continue;for(const q of [p-4,p+4,p-size*4,p+size*4])if(previous[q+3]){pixels.set(previous.subarray(q,q+4),p);break;}}
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!;const data=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)data.data.set(pixels.subarray((size-1-y)*size*4,(size-y)*size*4),y*size*4);
  ctx.putImageData(data,0,0);const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/png'));
  const a=document.createElement('a');a.download=`skin-${sex}-${kind}-v3.png`;a.href=URL.createObjectURL(blob);a.textContent=`Download ${a.download}`;a.style.display='block';document.querySelector('#downloads')!.append(a);
  scene.remove(visual);material.dispose();
 }
 target.dispose();renderer.dispose();renderer.forceContextLoss();geo.dispose();draco.dispose();
}
button.onclick=async()=>{button.disabled=true;try{await bake('male');await bake('female');status.textContent='Complete — four shared material maps ready.';}catch(e){status.textContent=String(e);}finally{button.disabled=false;}};
