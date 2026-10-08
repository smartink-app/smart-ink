import { useEffect, type ReactNode } from 'react';
import { FiMoon, FiSun } from 'react-icons/fi';
import { usePreference } from './usePreference';

export function ThemeRoot({ children }: { children: ReactNode }) {
  const [theme] = usePreference('theme', 'dark', ['dark', 'light']);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return children;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = usePreference('theme', 'dark', ['dark', 'light']);
  return <button type="button" className={`theme-toggle ${className}`}
    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
    {theme === 'dark' ? <FiSun aria-hidden /> : <FiMoon aria-hidden />}
    <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
  </button>;
}
