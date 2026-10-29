import { useEffect, type ReactNode } from 'react';
import { getAppearance } from './appearancePreference';
export function ThemeRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const mode = getAppearance(); document.documentElement.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode; };
    apply();
    media.addEventListener('change', apply);
    window.addEventListener('smartink:appearance', apply);
    window.addEventListener('storage', apply);
    return () => { media.removeEventListener('change', apply); window.removeEventListener('smartink:appearance', apply); window.removeEventListener('storage', apply); };
  }, []);
  return children;
}
