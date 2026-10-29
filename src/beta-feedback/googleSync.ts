import { readReports, isTestReport, type Report } from './store';
export const syncKey = 'smartink:google-feedback:receipts:v1';
export function exportRow(r: Report): string[] {
  return [r.id, r.tester, r.createdAt, r.screen,
    [isTestReport(r) ? '[TEST DATA]' : '', r.message, r.target && `Element: ${r.target}`, r.expected && `Expected: ${r.expected}`, r.goal && `Goal: ${r.goal}`, r.progress && `Progress: ${r.progress}`].filter(Boolean).join('\n'),
    r.version, r.status, r.notes];
}
/** A receipt is written only after an acknowledged write. Retries keep the original ID. */
export async function syncReports(reports: Report[], storage: Pick<Storage, 'getItem' | 'setItem'>, send: (row: string[]) => Promise<void>, destination: string) {
  const receipts: Record<string, string> = JSON.parse(storage.getItem(syncKey) || '{}');
  for (const report of reports) {
    const row = exportRow(report);
    const receiptId = `${destination}:${report.id}`;
    const fingerprint = JSON.stringify(row.slice(0, 6));
    if (receipts[receiptId] === fingerprint) continue;
    await send(row);
    receipts[receiptId] = fingerprint;
    storage.setItem(syncKey, JSON.stringify(receipts));
  }
}
let pending: Promise<string> | undefined;
export function runGoogleSync(): Promise<string> {
  if (!pending) pending = syncOnce().finally(() => { pending = undefined; });
  return pending;
}
async function syncOnce(): Promise<string> {
  try {
    const response = await fetch('/api/feedback-google', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Connection unavailable');
    const config = await response.json();
    if (!config.configured) return 'Google export needs connection setup. Feedback is safely saved locally.';
    await syncReports(readReports(), localStorage, async row => {
      const result = await fetch('/api/feedback-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row }), signal: AbortSignal.timeout(45000) });
      const answer = await result.json();
      if (!result.ok || answer.ok !== true || answer.id !== row[0]) throw new Error('Export not acknowledged');
    }, config.destination);
    return 'Google export is up to date. Sheet status and notes are preserved on updates.';
  } catch {
    return 'Google export pending. Saved locally; retrying automatically while this page is open.';
  }
}
