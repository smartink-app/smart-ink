import { emptyFeedback, parseFeedback, type FeedbackData } from './model';

export const feedbackStorageKey = (owner: string, scene: string) => `smartink:feedback-demo:v1:${encodeURIComponent(owner)}:${encodeURIComponent(scene)}`;
export function loadFeedback(key: string): FeedbackData {
  const raw = localStorage.getItem(key);
  return raw === null ? emptyFeedback() : parseFeedback(raw);
}
export function persistFeedback(key: string, data: FeedbackData, revision: number): FeedbackData {
  if (loadFeedback(key).revision !== revision) throw new Error('Feedback changed in another tab. Reload feedback and try again; your draft is still here.');
  const saved = parseFeedback(JSON.stringify({ ...data, revision: revision + 1 }));
  localStorage.setItem(key, JSON.stringify(saved));
  return saved;
}
