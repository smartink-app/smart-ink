import { useId, useRef, useState } from 'react';

function scrubValue(value: number, pixels: number, fine: boolean, min: number, max: number) {
  return Math.max(min, Math.min(max, value + pixels * (fine ? .025 : .25)));
}
const rounded = (value: number) => Math.round(value * 10) / 10;

/** Relative dragging avoids jumps; keep sub-step movement for slow, precise gestures. */
export default function PrecisionScrubber({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void;
}) {
  const id = useId();
  const drag = useRef<{ pointer: number; x: number; value: number; start: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(value); latest.current = value;
  const set = (next: number) => { latest.current = rounded(Math.max(min, Math.min(max, next))); onChange(latest.current); };
  return <div className="tattoo-precision-control">
    <div className="tattoo-transform-row">
      <span>{label}</span>
      <button type="button" aria-label={`Decrease tattoo ${label.toLowerCase()}`} title="Decrease by 1 · Shift for 0.1" onClick={e => set(latest.current - (e.shiftKey ? .1 : 1))}>−</button>
      <div className={`tattoo-scrubber${dragging ? ' is-dragging' : ''}`} role="slider" tabIndex={0}
        aria-label={`Tattoo ${label.toLowerCase()}`} aria-valuemin={min} aria-valuemax={max} aria-valuenow={rounded(value)} aria-valuetext={`${rounded(value)}${unit}`} aria-describedby={id} aria-orientation="horizontal"
        onPointerDown={e => {
          if (e.button !== 0 || drag.current) return;
          e.preventDefault(); e.stopPropagation(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { pointer:e.pointerId, x:e.clientX, value:latest.current, start:latest.current }; setDragging(true);
        }}
        onPointerMove={e => {
          const current = drag.current; if (!current || current.pointer !== e.pointerId) return;
          e.stopPropagation();
          current.value = scrubValue(current.value, e.clientX - current.x, e.shiftKey, min, max);
          current.x = e.clientX; set(current.value);
        }}
        onPointerUp={e => { if (drag.current?.pointer !== e.pointerId) return; drag.current=null; setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={e => { if (drag.current?.pointer !== e.pointerId) return; set(drag.current.start); drag.current=null; setDragging(false); }}
        onLostPointerCapture={() => { drag.current=null; setDragging(false); }}
        onKeyDown={e => {
          if (e.key === 'Escape' && drag.current) {
            e.preventDefault(); e.stopPropagation(); const current=drag.current; drag.current=null;
            set(current.start); setDragging(false); e.currentTarget.releasePointerCapture(current.pointer); return;
          }
          const direction = ['ArrowRight','ArrowUp'].includes(e.key) ? 1 : ['ArrowLeft','ArrowDown'].includes(e.key) ? -1 : 0;
          if (!direction && !['Home','End','PageUp','PageDown'].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation();
          set(e.key === 'Home' ? min : e.key === 'End' ? max : latest.current + (e.key === 'PageUp' ? 10 : e.key === 'PageDown' ? -10 : direction * (e.shiftKey ? .1 : 1)));
        }}><span>{rounded(value)}{unit}</span><span className="tattoo-scrub-grip" aria-hidden>↔</span></div>
      <button type="button" aria-label={`Increase tattoo ${label.toLowerCase()}`} title="Increase by 1 · Shift for 0.1" onClick={e => set(latest.current + (e.shiftKey ? .1 : 1))}>+</button>
    </div>
    <span id={id} className="tattoo-scrub-sr">Drag left or right. Use arrow keys to nudge by 1, or hold Shift for 0.1. Escape cancels a drag.</span>
  </div>;
}
