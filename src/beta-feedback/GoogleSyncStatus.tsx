import { useEffect, useState } from 'react';
import { runGoogleSync } from './googleSync';
export default function GoogleSyncStatus({ quiet = false }: { quiet?: boolean }) {
  const [status, setStatus] = useState('Checking Google export connection…');
  useEffect(() => {
    let active = true;
    const run = () => { void runGoogleSync().then(message => { if (active) setStatus(message); }); };
    run();
    const timer = window.setInterval(run, 15000);
    window.addEventListener('online', run);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('online', run); };
  }, []);
  return quiet ? null : <p className="bf-muted" role="status">{status}</p>;
}
