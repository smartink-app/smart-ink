export type Report = {
  id: string; tester: string; createdAt: string; kind: 'comment' | 'review' | 'journey';
  screen: string; target: string; message: string; expected: string; goal: string; progress: string;
  version: string; status: 'new' | 'investigating' | 'resolved'; notes: string;
  sessionId?: string; stepId?: string; isTest?: boolean;
};
export type ReviewAnswer = { text: string; saved: string; disposition?: 'commented' | 'skipped' | 'not-tried' };
export type ReviewDraft = {
  id: string; tester: string; startedAt: string; updatedAt: string; index: number;
  answers: ReviewAnswer[]; steps: { id: string; title: string }[]; isTest: boolean;
};
export type ReviewSession = {
  id: string; tester: string; startedAt: string; updatedAt: string; isTest: boolean;
  status: 'in-progress' | 'paused' | 'completed';
  steps: { id: string; title: string; outcome: 'commented' | 'skipped' | 'not-tried' | 'not-reviewed'; hasDraft: boolean }[];
};
export type CommentDraft = { submissionId?: string; message: string; expected: string; goal: string; progress: string; target: string; screen: string };
type Database = { reports: Report[]; sessions: ReviewSession[]; drafts: Record<string, ReviewDraft>; comments: Record<string, CommentDraft> };
const key = 'smartink:beta-feedback:local:v1';
function readDatabase(): Database {
  const parsed = JSON.parse(localStorage.getItem(key) || '[]');
  // Preserve existing prototype reports without requiring a destructive migration.
  const data = Array.isArray(parsed) ? { reports: parsed, sessions: [], drafts: {}, comments: {} } : parsed;
  if (!data || !Array.isArray(data.reports) || !Array.isArray(data.sessions) || !data.drafts || !data.comments || data.reports.some((r: Report) => !r || typeof r.id !== 'string' || typeof r.message !== 'string' || !['new','investigating','resolved'].includes(r.status))) throw new Error('Feedback could not be read. Stored data has been preserved.');
  return data;
}
function writeDatabase(data: Database) { localStorage.setItem(key, JSON.stringify(data)); }
export function readReports(): Report[] { return readDatabase().reports; }
export function readReviewSessions(): ReviewSession[] { return readDatabase().sessions; }
export function readReviewDraft(tester: string): ReviewDraft | undefined { return readDatabase().drafts[tester]; }
export function readCommentDraft(tester: string): CommentDraft | undefined { return readDatabase().comments[tester]; }
export function saveCommentDraft(tester: string, draft: CommentDraft) {
  const data = readDatabase(); data.comments[tester] = draft; writeDatabase(data);
}
export function clearCommentDraft(tester: string) {
  const data = readDatabase(); delete data.comments[tester]; writeDatabase(data);
}
export function saveReport(report: Report) {
  const data = readDatabase(); data.reports.unshift(report); delete data.comments[report.tester]; writeDatabase(data);
}
export function updateReport(id: string, changes: Pick<Report, 'status' | 'notes'>) {
  const data = readDatabase();
  if (!data.reports.some(r => r.id === id)) throw new Error('This report is no longer available. Refresh the inbox.');
  data.reports = data.reports.map(r => r.id === id ? { ...r, ...changes } : r); writeDatabase(data);
}
function putJourneyReport(data: Database, report: Report) {
  const existing = data.reports.find(r => r.id === report.id);
  data.reports = existing ? data.reports.map(r => r.id === report.id ? { ...r, message: report.message, isTest: report.isTest ?? r.isTest } : r) : [report, ...data.reports];
}
export function saveJourneyReport(report: Report) { const data = readDatabase(); putJourneyReport(data, report); writeDatabase(data); }
/** Drafts and their session metadata are saved atomically; admin never renders draft text. */
export function persistReview(draft: ReviewDraft, status: ReviewSession['status'] = 'in-progress', report?: Report) {
  const data = readDatabase();
  const hasDraft = draft.answers.some(a => a.text.trim() !== a.saved);
  if (status === 'completed' && hasDraft) throw new Error('Submit or clear unfinished comments before completing the review.');
  if (report) putJourneyReport(data, report);
  const session: ReviewSession = { id: draft.id, tester: draft.tester, startedAt: draft.startedAt, updatedAt: draft.updatedAt, isTest: draft.isTest, status,
    steps: draft.steps.map((step, i) => ({ ...step, outcome: draft.answers[i]?.saved ? 'commented' : draft.answers[i]?.disposition || 'not-reviewed', hasDraft: Boolean(draft.answers[i] && draft.answers[i].text.trim() !== draft.answers[i].saved) })) };
  data.sessions = [session, ...data.sessions.filter(s => s.id !== session.id)];
  // Keep report/session test labels consistent when the reviewer changes the label.
  data.reports = data.reports.map(r => r.sessionId === draft.id ? { ...r, isTest: draft.isTest } : r);
  if (status === 'completed') delete data.drafts[draft.tester]; else data.drafts[draft.tester] = draft;
  writeDatabase(data);
}
export function isTestReport(report: Report): boolean {
  return report.isTest ?? /^\[(demo|test)[^\]]*\]/i.test(report.message || report.goal);
}
