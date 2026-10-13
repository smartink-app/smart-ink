import { useEffect, type ReactNode } from 'react';

export function ThemeRoot({ children }: { children: ReactNode }) {
  useEffect(() => { document.documentElement.dataset.theme = 'dark'; }, []);
  return children;
}
