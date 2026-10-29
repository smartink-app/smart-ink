import {authMode} from '../auth/backend';
import {getSupabase} from '../auth/supabaseClient';
import {allRows} from '../beta-feedback/delivery';
export type Creation = {id:string;owner_id:string;kind:'project'|'render';source_id:string;title:string;preview:string;shared_at:string;consent_version:string};
const key='smartink:shared-creations:demo:v1';
function local():Creation[]{return JSON.parse(localStorage.getItem(key)||'[]');}
export async function listCreations(owner?:string):Promise<Creation[]>{
 const rows=authMode()==='demo'?local():await allRows('beta_shared_creations','id') as Creation[];
 return owner?rows.filter(r=>r.owner_id===owner):rows;
}
export async function shareCreation(owner:string,kind:Creation['kind'],source:string,title:string,preview:string){
 if(authMode()==='demo'){
  const rows=local(),old=rows.find(r=>r.owner_id===owner&&r.kind===kind&&r.source_id===source);
  const value={id:old?.id||crypto.randomUUID(),owner_id:owner,kind,source_id:source,title,preview,shared_at:new Date().toISOString(),consent_version:'beta-review-v1'};
  localStorage.setItem(key,JSON.stringify([...rows.filter(r=>r.id!==value.id),value]));return;
 }
 const {error}=await getSupabase().rpc('share_beta_creation',{p_owner:owner,p_kind:kind,p_source:source,p_preview:preview});if(error)throw new Error(error.message);
}
export async function withdrawCreation(id:string,owner:string){
 if(authMode()==='demo'){localStorage.setItem(key,JSON.stringify(local().filter(r=>r.id!==id||r.owner_id!==owner)));return;}
 const {error}=await getSupabase().from('beta_shared_creations').delete().eq('id',id).eq('owner_id',owner).select('id').single();if(error)throw new Error(error.message);
}
export async function previewImage(source:string|Blob):Promise<string>{
 const blob=typeof source==='string'?await fetch(source).then(r=>{if(!r.ok)throw Error('Preview could not be loaded');return r.blob();}):source;
 const bitmap=await createImageBitmap(blob);
 try {const canvas=document.createElement('canvas');const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Preview unavailable');ctx.fillStyle='#ecece8';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',.8);if(image.length>800000)throw Error('Preview is too large');return image;}finally{bitmap.close();}
}
