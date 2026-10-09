import { useCallback, useEffect, useRef, useState } from 'react';
import { loadHistory, changeHistory, historyKey } from './storage';
import { emptyHistory, type DesignHistory } from './model';
export function useDesignVersions(owner: string, projectId: string, clientId: string) {
  const key = historyKey(owner, projectId);
  const [data, setData] = useState(() => emptyHistory(projectId, clientId));
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const current = useRef(data), saving = useRef(false), active = useRef(true);
  const reload = useCallback(async () => {
    try { const loaded = await loadHistory(owner, projectId, clientId); if (active.current && loaded.revision >= current.current.revision) { current.current = loaded; setData(loaded); setReady(true); setError(''); } }
    catch (e) { if (active.current) { setReady(false); setError(e instanceof Error ? e.message : 'Could not read design history.'); } }
  }, [owner, projectId, clientId]);
  useEffect(() => {
    active.current = true; void reload();
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('smartink-design-history');
    const sync = (event: MessageEvent) => { if (event.data === key) void reload(); };
    channel?.addEventListener('message', sync);
    const focus = () => { void reload(); }; window.addEventListener('focus', focus);
    return () => { active.current = false; channel?.close(); window.removeEventListener('focus', focus); };
  }, [key, reload]);
  const change = async (prepare: () => Promise<(history: DesignHistory) => DesignHistory>) => {
    if (!ready || saving.current) throw Error('Wait for the current design operation to finish.');
    saving.current = true; setBusy(true); setError('');
    const expected = current.current.revision;
    try {
      const apply = await prepare();
      const saved = await changeHistory(owner, projectId, clientId, expected, apply);
      if (active.current) { current.current = saved; setData(saved); }
      try { if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('smartink-design-history'); channel.postMessage(key); channel.close(); } } catch { /* Persistence already succeeded; focus also refreshes other views. */ }
      return saved;
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Could not save. Your draft is still here.'); throw e; }
    finally { saving.current = false; if (active.current) setBusy(false); }
  };
  return { data, ready, busy, error, reload, change };
}
export type DesignVersionsController = ReturnType<typeof useDesignVersions>;
