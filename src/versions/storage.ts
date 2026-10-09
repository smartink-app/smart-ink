import { createStore, get, update } from 'idb-keyval';
import { emptyHistory, parseHistory, type DesignHistory } from './model';
const store = createStore('smartink-design-versions-v1', 'projects');
export const historyKey = (owner: string, project: string) => JSON.stringify([owner, project]);
export async function loadHistory(owner: string, projectId: string, clientId: string): Promise<DesignHistory> {
  const value: unknown = await get(historyKey(owner, projectId), store);
  return value === undefined ? emptyHistory(projectId, clientId) : parseHistory(value, projectId, clientId);
}
/** Compare-and-write in one IndexedDB transaction, including the artwork and decision. */
export async function changeHistory(owner: string, projectId: string, clientId: string, revision: number, change: (data: DesignHistory) => DesignHistory): Promise<DesignHistory> {
  let saved: DesignHistory | undefined;
  await update(historyKey(owner, projectId), (value: unknown) => {
    const current = value === undefined ? emptyHistory(projectId, clientId) : parseHistory(value, projectId, clientId);
    if (current.revision !== revision) throw Error('Design versions changed in another view. Reload the history and review the latest version before trying again.');
    saved = parseHistory({ ...change(current), revision: revision + 1 }, projectId, clientId);
    return saved;
  }, store);
  if (!saved) throw Error('The design could not be saved. Please try again.');
  return saved;
}
