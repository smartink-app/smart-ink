const KEY = 'smartink.pending-invite';
export function pendingInvite(): string | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage.getItem(KEY); }
  catch { return null; }
}
export function setPendingInvite(code?: string): void {
  if (typeof window === 'undefined') return;
  if (code) window.sessionStorage.setItem(KEY, code.trim().toUpperCase());
  else window.sessionStorage.removeItem(KEY);
}
