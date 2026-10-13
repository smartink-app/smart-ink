import { useEffect, useState } from 'react';
import { addFeedback, replyToFeedback, resolveFeedback, type FeedbackLocation, type ReviewRole } from './model';
import { useFeedback } from './useFeedback';

export function useReview(owner: string, scene: string | undefined) {
  const store = useFeedback(owner, scene);
  const [role, setRole] = useState<ReviewRole>('client');
  const [selected, setSelected] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [composer, setComposer] = useState<{ location: FeedbackLocation | null } | null>(null);
  const [text, setText] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const dirty = !!text.trim() || Object.values(replies).some(t => !!t.trim());
  useEffect(() => {
    setSelected(null); setArmed(false); setComposer(null); setText(''); setReplies({}); setNotice('');
  }, [scene, owner]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return {
    ...store, role, setRole, selected, setSelected, armed, composer, text, setText, replies, setReplies, notice, setNotice, dirty,
    arm: () => { setArmed(v => !v); setNotice(''); },
    pick: (location: FeedbackLocation) => { setComposer({ location }); setArmed(false); setNotice(''); },
    general: () => { setComposer({ location: null }); setArmed(false); setNotice(''); },
    cancel: () => { setComposer(null); setText(''); setArmed(false); setNotice(''); },
    post: () => {
      if (!composer) return;
      const saved = store.change(data => addFeedback(data, text, role, composer.location));
      if (saved) { setSelected(saved.threads.at(-1)!.id); setComposer(null); setText(''); setNotice('Comment saved on this device.'); }
    },
    reply: (id: string) => {
      const key = `${role}:${id}`;
      if (store.change(data => replyToFeedback(data, id, replies[key] ?? '', role))) {
        setReplies(v => ({ ...v, [key]: '' })); setNotice('Reply saved on this device.');
      }
    },
    resolve: (id: string, resolved: boolean) => {
      if (store.change(data => resolveFeedback(data, id, resolved, role))) setNotice(resolved ? 'Marked as resolved.' : 'Feedback reopened.');
    },
  };
}
export type ReviewController = ReturnType<typeof useReview>;
