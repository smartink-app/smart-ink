/** Explicit development-only opt-in; never grants access to hosted accounts. */
export function localDebugEnabled(mode: string): boolean {
  if (!import.meta.env.DEV || mode !== 'demo' || typeof window === 'undefined') return false;
  const { hostname, search } = window.location;
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    && new URLSearchParams(search).get('debug') === '1';
}
