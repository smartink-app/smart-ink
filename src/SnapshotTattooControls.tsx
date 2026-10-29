import { useState } from 'react';
import AdjustmentControl from './AdjustmentControl';

export default function SnapshotTattooControls({ disabled, reason, onNudge, size, rotation, onSize, onRotation, onFrame }: {
  disabled: boolean; reason: string; onNudge: (dx: number, dy: number) => boolean;
  size: number; rotation: number; onSize: (value: number) => void;
  onRotation: (value: number) => void; onFrame: () => void;
}) {
  const [fine, setFine] = useState(true), [message, setMessage] = useState('');
  const move = (x: number, y: number) => {
    if (disabled) return;
    setMessage(onNudge(x * (fine ? 2 : 8), y * (fine ? 2 : 8))
      ? 'Placement adjusted. Camera stays in place.' : 'Cannot move farther here. Keep the design on visible, uncovered skin and within its placement area.');
  };
  return <section className="snapshot-tattoo-controls" aria-label="Tattoo placement">
    <h3>Fine-tune placement</h3>
    <p className="snapshot-controls-hint">Move the tattoo on the skin. Your camera stays still.</p>
    {disabled ? <p role="note">{reason}</p> : <>
      <label className="shoot-guided-toggle"><input type="checkbox" checked={fine} onChange={event => setFine(event.target.checked)} /> Small steps</label>
      <div className="tattoo-nudge-pad" role="group" aria-label="Nudge tattoo" onKeyDown={event => {
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (direction) { event.preventDefault(); move(direction[0], direction[1]); }
      }}>
        <button type="button" className="nudge-up" aria-label="Nudge tattoo up" onClick={() => move(0,-1)}>↑</button>
        <button type="button" className="nudge-left" aria-label="Nudge tattoo left" onClick={() => move(-1,0)}>←</button>
        <span aria-hidden="true">Move</span>
        <button type="button" className="nudge-right" aria-label="Nudge tattoo right" onClick={() => move(1,0)}>→</button>
        <button type="button" className="nudge-down" aria-label="Nudge tattoo down" onClick={() => move(0,1)}>↓</button>
      </div>
      <p className="snapshot-controls-hint">Use the arrows here or focus a direction and use your keyboard’s arrow keys.</p>
      <AdjustmentControl label="Tattoo size" value={size} min={10} max={300} step={1} unit="%" resetValue={100} onChange={onSize} />
      <AdjustmentControl label="Tattoo rotation" value={rotation} min={-180} max={180} step={1} unit="°" resetValue={0} onChange={onRotation} />
      <button type="button" className="snapshot-button" onClick={onFrame}>Frame tattoo</button>
      <p className="snapshot-controls-hint">Recenter the camera after adjusting placement or size.</p>
      <p className="snapshot-nudge-status" role="status">{message}</p>
    </>}
  </section>;
}
