import { authMode } from '../auth/backend';
import { getSupabase } from '../auth/supabaseClient';
import { createHostedFeedback } from './hostedFeedback';
import { readReports, readReviewSessions, saveReport, updateReport, type Report, type ReviewSession } from './store';
export type Delivery = { id: string; revision: string; report?: Report; session?: ReviewSession };
const queueKey = (owner: string) => `smartink:feedback-outbox:v1:${owner}`;
export function pendingFeedback(owner: string): Delivery[] {
  const data = JSON.parse(localStorage.getItem(queueKey(owner)) || '[]');
  if (!Array.isArray(data)) throw new Error('Pending feedback could not be read. Stored data has been preserved.');
  return data;
}
function write(owner: string, entries: Delivery[]) { localStorage.setItem(queueKey(owner),JSON.stringify(entries)); }
const running = new Map<string,Promise<void>>();
export async function flushFeedback(owner: string): Promise<void> {
  if (running.has(owner)) return running.get(owner)!;
  const work = (async()=>{
    const client = getSupabase();
    const api = createHostedFeedback(client,owner);
    for (const entry of pendingFeedback(owner)) {
      const {data,error} = await client.auth.getSession();
      if (error || data.session?.user.id !== owner) throw new Error('Sign in to the original account to deliver its pending feedback.');
      if (entry.session) await api.saveSession(entry.session);
      if (entry.report) await api.submitReport(entry.report);
      // Do not discard a newer edit that arrived during this request.
      write(owner,pendingFeedback(owner).filter(e=>e.id!==entry.id || e.revision!==entry.revision));
    }
  })();
  running.set(owner,work);
  try { await work; } finally { running.delete(owner); }
}
export async function deliverFeedback(owner: string | undefined, report?: Report, session?: ReviewSession) {
  if (authMode() === 'demo') { if (report) saveReport(report); return; }
  if (authMode() !== 'supabase' || !owner) throw new Error('Sign in before submitting feedback.');
  const id = report?.id || `session:${session?.id}`;
  const entry = {id,revision:crypto.randomUUID(),report,session};
  write(owner,[...pendingFeedback(owner).filter(e=>e.id!==id),entry]);
  await flushFeedback(owner);
  // Another flush could have started before this item was queued.
  if (pendingFeedback(owner).some(e=>e.id===id)) await flushFeedback(owner);
  if (pendingFeedback(owner).some(e=>e.id===id)) throw new Error('Feedback is pending. Retry delivery.');
}
export async function allRows(table: string, order: string | string[]) {
  const rows = [];
  for(let offset=0;;offset+=500){
    let query = getSupabase().from(table).select('*');
    for (const column of Array.isArray(order) ? order : [order]) query = query.order(column);
    const {data,error} = await query.range(offset,offset+499);
    if(error) throw new Error(error.message);
    rows.push(...(data || [])); if((data || []).length<500) break;
  }
  return rows;
}
export async function readFeedbackInbox(): Promise<{reports:Report[];sessions:ReviewSession[]}> {
  if(authMode()==='demo') return {reports:readReports(),sessions:readReviewSessions()};
  if(authMode()!=='supabase') throw new Error('Feedback storage is not configured.');
  const [reports,sessions,triage,profiles] = await Promise.all([allRows('beta_feedback_reports','id'),allRows('beta_review_sessions','id'),allRows('beta_feedback_triage','report_id'),allRows('profiles','user_id')]);
  const email = (owner:string) => profiles.find(p=>p.user_id===owner)?.email || owner;
  return {
    reports:reports.map(r=>({id:r.id,tester:email(r.owner_id),createdAt:r.created_at,kind:r.kind,screen:r.screen,target:r.target,message:r.message,expected:r.expected,goal:r.goal,progress:r.progress,version:r.version,status:triage.find(t=>t.report_id===r.id)?.status || 'new',notes:triage.find(t=>t.report_id===r.id)?.notes || '',sessionId:r.session_id || undefined,stepId:r.step_id || undefined,isTest:r.is_test})),
    sessions:sessions.map(s=>({id:s.id,tester:email(s.owner_id),startedAt:s.created_at,updatedAt:s.updated_at || s.created_at,isTest:s.is_test,status:s.status,steps:s.steps.map((step:{id:string;outcome:ReviewSession['steps'][number]['outcome'];hasDraft:boolean})=>({...step,title:step.id.replaceAll('-',' ')}))})),
  };
}
export async function saveTriage(id:string,status:Report['status'],notes:string) {
  if(authMode()==='demo') return updateReport(id,{status,notes});
  return createHostedFeedback(getSupabase()).triage(id,status,notes);
}
