import { get, update } from 'idb-keyval';
import { subscribeSession } from '../auth/betaAuthService';

import type { TattooAsset } from '../starterTattoos';
export { STARTER_TATTOOS, type TattooAsset } from '../starterTattoos';
type Listener = { scope: string | null; bound: boolean; notify: (items: TattooAsset[]) => void };
const listeners = new Set<Listener>();
let activeScope: string | null = null;
let sessionKnown = false;
let sessionReady: Promise<void> | undefined;
function ready() {
  sessionReady ??= new Promise<void>(resolve => {
    subscribeSession(({ session }) => {
      const owner = session?.userId ?? session?.email.toLowerCase();
      const next = owner ? `smartink:tattoo-library:v2:${encodeURIComponent(owner)}` : null;
      sessionKnown = true;
      listeners.forEach(listener => {
        if (!listener.bound) { listener.scope = next; listener.bound = true; }
      });
      if (next !== activeScope) {
        activeScope = next;
        // Clear visible uploads immediately on sign-out/account change. A
        // listener remains bound to the account that originally opened it.
        listeners.forEach(listener => listener.notify([]));
      }
      resolve();
    });
  });
  return sessionReady;
}
async function currentScope(): Promise<string> {
  // Capture a known account before yielding so a queued operation cannot move
  // to a different account during the next microtask.
  if (!sessionKnown) await ready();
  if (!activeScope) throw new Error('Sign in to open your artwork library.');
  return activeScope;
}
function assertScope(scope: string) {
  if (scope !== activeScope) throw new Error('The signed-in account changed. Open your artwork library again.');
}
export function subscribeTattooLibrary(listener: (items: TattooAsset[]) => void) {
  const entry: Listener = { scope: activeScope, bound: sessionKnown, notify: listener };
  listeners.add(entry);
  void ready();
  return () => { listeners.delete(entry); };
}
const publish = (scope: string, items: TattooAsset[]) => listeners.forEach(listener => {
  if (listener.scope === scope) listener.notify(items);
});
// The old v1 key has no owner. Leave its contents intact, without silently
// assigning another person's device uploads to the next signed-in account.
function assets(value: unknown): TattooAsset[] {
  return Array.isArray(value) ? value.filter((item): item is TattooAsset => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.source === 'string' && item.source.startsWith('data:image/png;base64,'))) : [];
}
export async function loadTattooLibrary(): Promise<TattooAsset[]> {
  const scope = await currentScope();
  const stored = await get(scope);
  assertScope(scope);
  return assets(stored);
}
export async function rememberTattoo(source: string, name = 'Imported artwork'): Promise<TattooAsset[]> {
  if (!source.startsWith('data:image/png;base64,')) return loadTattooLibrary();
  const scope = await currentScope();
  let result: TattooAsset[] = [];
  await update(scope, (stored) => {
    assertScope(scope);
    const current = assets(stored);
    if (current.some(item => item.source === source)) { result = current; return current; }
    if (current.length >= 100 || current.reduce((size, item) => size + item.source.length, source.length) > 120 * 1024 * 1024) {
      throw new Error('Your local library is full. Remove an unused design before adding more.');
    }
    result = [{ id: crypto.randomUUID(), name: name.replace(/\.png$/i, '').trim().slice(0, 80) || 'Imported artwork', source, category: 'Your upload' }, ...current];
    return result;
  });
  assertScope(scope);
  publish(scope, result);
  return result;
}
export async function removeTattoo(id: string): Promise<TattooAsset[]> {
  const scope = await currentScope();
  let result: TattooAsset[] = [];
  await update(scope, stored => { assertScope(scope); result = assets(stored).filter(item => item.id !== id); return result; });
  assertScope(scope);
  publish(scope, result);
  return result;
}
