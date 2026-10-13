/** Only a previously approved, still-valid auth session may reopen local drafts offline. */
export function rememberOfflineApproval(userId: string, expiresAt: number | undefined) {
  if (typeof window === 'undefined' || window.smartInkNativeHost !== true) return;
  try {
    if (expiresAt && expiresAt * 1000 > Date.now()) localStorage.setItem(`ipad-approved:${userId}`, String(Math.min(expiresAt * 1000, Date.now() + 24 * 60 * 60 * 1000)));
  } catch { /* No offline access if storage is unavailable. */ }
}
export function forgetOfflineApproval(userId: string) {
  try { localStorage.removeItem(`ipad-approved:${userId}`); } catch { /* Best effort. */ }
}
export function hasOfflineApproval(userId: string, expiresAt: number | undefined): boolean {
  if (typeof window === 'undefined' || window.smartInkNativeHost !== true || !expiresAt) return false;
  try {
    const deadline = Number(localStorage.getItem(`ipad-approved:${userId}`));
    return Number.isFinite(deadline) && Date.now() < Math.min(deadline, expiresAt * 1000);
  } catch { return false; }
}
