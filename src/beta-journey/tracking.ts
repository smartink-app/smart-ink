import { authMode } from '../auth/backend';
import { getSupabase } from '../auth/supabaseClient';
import { allRows } from '../beta-feedback/delivery';
export type JourneyKind = 'verified_signin' | 'project_saved' | 'export_ready' | 'visit' | 'returned';
export type JourneyEvent = { owner: string; email: string; kind: JourneyKind; at: number; key: string };
const DEMO = 'smartink:journey:demo:v1';
export function demoEvents(): JourneyEvent[] { return JSON.parse(localStorage.getItem(DEMO) || '[]'); }
/** Nonblocking telemetry must never make a successful save/export appear failed. */
export async function recordJourney(owner: string, email: string, kind: JourneyKind): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0,10), key = kind==='visit'?day:'';
    if(authMode()==='demo') {
      const events=demoEvents();
      if(!events.some(e=>e.owner===owner&&e.kind===kind&&e.key===key)) events.push({owner,email,kind,key,at:Date.now()});
      if(kind==='visit' && events.some(e=>e.owner===owner&&e.kind==='visit'&&e.key<day) && !events.some(e=>e.owner===owner&&e.kind==='returned')) events.push({owner,email,kind:'returned',key:'',at:Date.now()});
      localStorage.setItem(DEMO,JSON.stringify(events)); return;
    }
    if(authMode()!=='supabase' || kind==='project_saved') return; // Hosted saves use a database trigger.
    if (kind === 'export_ready') { try { localStorage.setItem(`smartink:pending-export:${owner}`, '1'); } catch { /* Attempt delivery even without durable retry storage. */ } }
    const {error}=await getSupabase().rpc('record_beta_journey',{p_owner:owner,p_kind:kind});
    if(error) throw error;
    if (kind === 'export_ready') localStorage.removeItem(`smartink:pending-export:${owner}`);
  } catch { console.warn('Beta journey event could not be recorded.'); }
}
export async function readJourney(): Promise<JourneyEvent[]> {
  if(authMode()==='demo')return demoEvents();
  const [rows,profiles]=await Promise.all([allRows('beta_journey_events',['owner_id','kind','event_key']),allRows('profiles','user_id')]);
  return rows.map(r=>({owner:r.owner_id,email:profiles.find(p=>p.user_id===r.owner_id)?.email||r.owner_id,kind:r.kind,at:Date.parse(r.created_at),key:r.event_key}));
}

export function retryJourneyExport(owner:string,email:string) { try { if(localStorage.getItem(`smartink:pending-export:${owner}`)) void recordJourney(owner,email,'export_ready'); } catch { /* A storage failure must not block studio entry. */ } }
