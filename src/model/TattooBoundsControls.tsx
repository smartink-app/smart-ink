import { regionLabel } from '../render/bodyRegions';
import type { PlacementBoundsStatus } from '../render/placementBounds';
import './viewportCards.css';

export default function TattooBoundsControls({ status, onLock, onFit }: {
  status: PlacementBoundsStatus | null; onLock: (locked: boolean) => void; onFit: () => void;
}) {
  if (!status) return null;
  const message = status.limitMessage || (!status.ready ? 'Checking the artwork…' : status.empty ? 'No visible ink in this image.'
    : status.outside > .003 ? `About ${Math.max(1, Math.round(status.outside * 100))}% of the ink is outside the available area.`
    : status.distorted > .01 ? 'The design stretches too much around this curve.' : 'The design fits this area.');
  return <div className="tattoo-bounds-controls" aria-label="Tattoo placement boundary">
    <label><input type="checkbox" checked={status.locked} onChange={event => onLock(event.target.checked)} />Keep within {regionLabel(status.region).toLowerCase()}</label>
    <p role="status" className={status.ready && !status.valid ? 'tattoo-bounds-warning' : ''}>{message}</p>
    {!status.locked && <p>Across regions is allowed. Fold and stretching limits still apply.</p>}
    {status.conservative && <p>Checking the image outline because its transparency could not be read.</p>}
    {status.ready && !status.valid && !status.empty && <>
      <button type="button" disabled={!status.canFit} onClick={onFit}>Fit to area</button>
      {!status.canFit && <p>Move the design to a broader, flatter spot.</p>}
    </>}
    {status.locked && <small>Uncheck for an intentional design across body regions.</small>}
  </div>;
}
