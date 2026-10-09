import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyFeedback, type FeedbackData } from './model';
import { feedbackStorageKey, loadFeedback, persistFeedback } from './storage';

export function useFeedback(owner: string, scene: string | undefined) {
  const key = feedbackStorageKey(owner, scene ?? '');
  const [store, setStore] = useState<{ key: string; data: FeedbackData; ready: boolean }>({ key: '', data: emptyFeedback(), ready: false });
  const [error, setError] = useState('');
  const latest = useRef(store); latest.current = store;
  const reload = useCallback(() => {
    try {
      const next = { key, data: loadFeedback(key), ready: true };
      latest.current = next; setStore(next); setError('');
    } catch (e) {
      const next = { key, data: emptyFeedback(), ready: false };
      latest.current = next; setStore(next); setError(e instanceof Error ? e.message : 'Feedback could not be loaded.');
    }
  }, [key]);
  useEffect(() => { reload(); }, [reload]);
  const change = useCallback((update: (data: FeedbackData) => FeedbackData): FeedbackData | null => {
    const current = latest.current;
    if (!scene || current.key !== key || !current.ready) return null;
    try {
      const data = persistFeedback(key, update(current.data), current.data.revision);
      const next = { key, data, ready: true }; latest.current = next; setStore(next); setError(''); return data;
    } catch (e) { setError(e instanceof Error ? e.message : 'Feedback could not be saved. Your draft is still here.'); return null; }
  }, [key, scene]);
  return { data: store.key === key ? store.data : emptyFeedback(), ready: store.key === key && store.ready, error, reload, change };
}
