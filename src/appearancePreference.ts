export type Appearance = 'dark' | 'light' | 'system';
const KEY = 'smartink:appearance';
export function getAppearance(): Appearance {
  try { const value = localStorage.getItem(KEY); return value === 'light' || value === 'system' ? value : 'dark'; } catch { return 'dark'; }
}
export function setAppearance(value: Appearance) {
  localStorage.setItem(KEY, value);
  window.dispatchEvent(new Event('smartink:appearance'));
}
