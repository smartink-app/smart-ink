import type { AuthMode } from '../auth/betaAuthService';
import { getSupabase } from '../auth/supabaseClient';
import { normalize, type FollowUp, type TesterNote } from './model';
const KEY = 'smartink:beta-operations:demo:v1';
type Data = { notes: TesterNote[]; tasks: FollowUp[] };
function readLocal(): Data {
  const data = JSON.parse(localStorage.getItem(KEY) || '{"notes":[],"tasks":[]}');
  if (!data || !Array.isArray(data.notes) || !Array.isArray(data.tasks)) throw new Error('Saved beta records could not be read. The original data has been preserved.');
  return data;
}
function requireHosted(mode: AuthMode) { if (mode !== 'supabase') throw new Error('The hosted beta is not configured.'); return getSupabase(); }
export async function readOperations(mode: AuthMode): Promise<Data> {
  if (mode === 'demo') return readLocal();
  const client = requireHosted(mode);
  const notes: TesterNote[] = [], tasks: FollowUp[] = [];
  // Explicit pagination avoids silently dropping larger cohorts at the API row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('beta_tester_notes').select('*').order('email').range(offset, offset+499);
    if (error) throw new Error(`Tester records unavailable: ${error.message}`);
    notes.push(...(data || [])); if ((data || []).length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('beta_followups').select('*').order('id').range(offset, offset+499);
    if (error) throw new Error(`Follow-ups unavailable: ${error.message}`);
    tasks.push(...(data || []).map(t => ({ id:t.id, email:t.email, title:t.title, dueDate:t.due_date, status:t.status, notes:t.notes, createdAt:t.created_at, completedAt:t.completed_at })));
    if ((data || []).length < 500) break;
  }
  return { notes, tasks };
}
export async function saveTester(mode: AuthMode, note: TesterNote) {
  const value = { ...note, email: normalize(note.email) };
  if (mode === 'demo') { const data = readLocal(); data.notes = [...data.notes.filter(n => normalize(n.email) !== value.email),value]; localStorage.setItem(KEY,JSON.stringify(data)); return; }
  const {error} = await requireHosted(mode).from('beta_tester_notes').upsert(value).select('email').single();
  if (error) throw new Error(`Tester details were not saved: ${error.message}`);
}
export async function saveFollowUp(mode: AuthMode, task: FollowUp) {
  const value = { ...task, email: normalize(task.email) };
  if (!value.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)) throw new Error('Add a follow-up title and due date.');
  if (mode === 'demo') { const data = readLocal(); data.tasks = [...data.tasks.filter(t => t.id !== value.id),value]; localStorage.setItem(KEY,JSON.stringify(data)); return; }
  const {error} = await requireHosted(mode).from('beta_followups').upsert({id:value.id,email:value.email,title:value.title,due_date:value.dueDate,status:value.status,notes:value.notes,created_at:value.createdAt,completed_at:value.completedAt}).select('id').single();
  if (error) throw new Error(`Follow-up was not saved: ${error.message}`);
}
