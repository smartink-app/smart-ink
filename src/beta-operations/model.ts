import type { JourneyEvent, JourneyKind } from '../beta-journey/tracking';
import type { Invite, WaitlistEntry } from '../auth/types';
import type { Report } from '../beta-feedback/store';
export type TesterNote = { email: string; name: string; studio: string; cohort: string; notes: string };
export type FollowUp = { id: string; email: string; title: string; dueDate: string; status: 'open' | 'done'; notes: string; createdAt: string; completedAt: string | null };
export type Activity = { id: string; email: string; at: number; kind: 'request' | 'invite' | 'redemption' | 'feedback' | 'followup' | JourneyKind; label: string };
export type Person = { email: string; access: string; source: string; note?: TesterNote; activities: Activity[]; reports: Report[]; tasks: FollowUp[] };
export const normalize = (email: string) => email.trim().toLowerCase();
export function buildPeople(waitlist: WaitlistEntry[], invites: Invite[], activeEmails: string[], notes: TesterNote[], tasks: FollowUp[], reports: Report[], journey: JourneyEvent[] = []): Person[] {
  const people = new Map<string, Person>();
  const person = (email: string) => {
    const key = normalize(email);
    if (!people.has(key)) people.set(key, { email: key, access: 'Unknown', source: '', activities: [], reports: [], tasks: [] });
    return people.get(key)!;
  };
  for (const w of waitlist) {
    const p = person(w.email); p.access = w.status; p.source = w.source || '';
    p.activities.push({ id: `request:${w.id}`, email: p.email, at: w.createdAt, kind: 'request', label: w.source?.startsWith('invite:') ? 'Access record created from invitation' : 'Access requested' });
  }
  for (const email of activeEmails) { const p = person(email); if (p.access !== 'revoked') p.access = 'active'; }
  for (const i of invites) {
    if (i.email) { const p = person(i.email); if (p.access === 'Unknown') p.access = 'invited'; p.activities.push({ id: `invite:${i.code}`, email: p.email, at: i.createdAt, kind: 'invite', label: 'Invitation created' }); }
    if (i.redeemedAt && i.redeemedByEmail) { const p = person(i.redeemedByEmail); p.activities.push({ id: `redemption:${i.code}`, email: p.email, at: i.redeemedAt, kind: 'redemption', label: 'Invitation redeemed' }); }
  }
  for (const event of journey) { const p = person(event.email); p.activities.push({id:`journey:${event.owner}:${event.kind}:${event.key}`,email:p.email,at:event.at,kind:event.kind,label:journeyLabels[event.kind]}); }
  for (const note of notes) person(note.email).note = note;
  for (const report of reports) { const p = person(report.tester); p.reports.push(report); p.activities.push({ id: `feedback:${report.id}`, email: p.email, at: Date.parse(report.createdAt), kind: 'feedback', label: `Feedback submitted · ${report.screen}` }); }
  for (const task of tasks) { const p = person(task.email); p.tasks.push(task); if (task.completedAt) p.activities.push({ id: `followup:${task.id}`, email: p.email, at: Date.parse(task.completedAt), kind: 'followup', label: `Follow-up marked done · ${task.title}` }); }
  return [...people.values()].map(p => ({ ...p, activities: p.activities.filter(a => Number.isFinite(a.at)).sort((a,b) => b.at-a.at) })).sort((a,b) => a.email.localeCompare(b.email));
}
export function taskTiming(task: FollowUp, today: string) { return task.status === 'done' ? 'Done' : task.dueDate < today ? 'Overdue' : task.dueDate === today ? 'Due today' : 'Upcoming'; }
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }

export const journeyLabels: Record<JourneyKind,string> = { verified_signin:'First verified studio access',project_saved:'First project saved',export_ready:'First image export ready',visit:'Studio visit (UTC day)',returned:'Returned on a later UTC day' };
