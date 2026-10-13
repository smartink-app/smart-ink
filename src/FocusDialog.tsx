import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';

/** Native modal gives keyboard trapping, Escape, and return-to-trigger focus. */
export default function FocusDialog({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open) dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return createPortal(<dialog ref={ref} className={`focus-dialog${wide ? ' focus-dialog--wide' : ''}`}
    aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id={id}>{title}</h2><button type="button" className="focus-icon-button" onClick={onClose} aria-label={`Close ${title}`}><FiX aria-hidden /></button></header>
    {children}
  </dialog>, document.body);
}
