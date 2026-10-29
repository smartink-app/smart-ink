import {useEffect,useState} from 'react';
import {authMode} from '../auth/backend';
import {allRows} from '../beta-feedback/delivery';
import {listCreations,type Creation} from './store';
const purpose='For beta testing only: share a preview with the Smart Ink team so we can evaluate results and troubleshoot issues. Sharing is optional and does not grant permission to publish or use your work for marketing.';
export function TesterCreations({email}:{email:string}){
 const [rows,setRows]=useState<Creation[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{let cancelled=false;setLoading(true);setRows([]);setError('');(async()=>{let owner=email;if(authMode()==='supabase'){const profiles=await allRows('profiles','user_id');owner=profiles.find(p=>p.email.toLowerCase()===email.toLowerCase())?.user_id;if(!owner)return [];}return listCreations(owner);})().then(value=>{if(!cancelled)setRows(value);}).catch(e=>{if(!cancelled)setError(String(e));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[email,revision]);
 return <section aria-label="Shared creations"><div className="bo-heading"><h4>Creations shared for beta testing</h4><button className="btn-login" onClick={()=>setRevision(r=>r+1)}>Refresh creations</button></div><p className="beta-muted">{purpose}</p>{loading&&<p role="status">Loading shared previews…</p>}{error&&<p role="alert">{error}</p>}<div className="bo-people">{rows.map(r=><article key={r.id} className="bo-person"><img src={r.preview} alt={r.title} style={{width:'100%',maxHeight:240,objectFit:'contain'}}/><strong>{r.title}</strong><span>{r.kind} preview · Shared {new Date(r.shared_at).toLocaleString()}</span><small>Snapshot shared with consent · Beta testing only</small></article>)}</div>{!loading&&!error&&!rows.length&&<p>This tester has not shared any previews. Their private creations are not visible here.</p>}</section>;
}
