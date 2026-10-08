import { useSyncExternalStore } from 'react';

const memory = new Map<string, string>();
const changed = 'smartink:preferences';
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key) memory.delete(event.key); else memory.clear();
    callback();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(changed, callback);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(changed, callback);
  };
}

/** Presentation preferences never enter scene data or the undo history. */
export function usePreference<T extends string>(name: string, fallback: T, allowed: readonly T[]) {
  const key = `smartink:focus:${name}`;
  const read = (): T => {
    let value = memory.get(key);
    try { value ??= localStorage.getItem(key) ?? undefined; } catch { /* Session-only when storage is unavailable. */ }
    return allowed.includes(value as T) ? value as T : fallback;
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const setValue = (next: T) => {
    memory.set(key, next);
    try { localStorage.setItem(key, next); } catch { /* Keep the control usable. */ }
    window.dispatchEvent(new Event(changed));
  };
  return [value, setValue] as const;
}
