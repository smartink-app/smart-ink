import type { ReactNode } from 'react';
import { usePreference } from './usePreference';

export default function MoreControls({ id, summary, children, label = 'More controls' }: {
  id: string; summary?: string; children: ReactNode; label?: string;
}) {
  const [open, setOpen] = usePreference(`controls:${id}`, 'closed', ['closed', 'open']);
  return <details className="focus-more" open={open === 'open'} onToggle={event => {
    const next = event.currentTarget.open ? 'open' : 'closed';
    if (next !== open) setOpen(next);
  }}>
    <summary><span>{label}</span>{summary && <small>{summary}</small>}</summary>
    <div className="focus-more-body">{children}</div>
  </details>;
}
