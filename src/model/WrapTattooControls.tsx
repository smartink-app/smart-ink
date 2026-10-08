import { DEFAULT_WRAP, WRAP_ARTWORK, type WrapSettings } from '../render/wrapPlacement';
import './viewportCards.css';

export default function WrapTattooControls({ value, onSample, onChange, onExit, onView, compact = false }: {
  compact?: boolean; value?: WrapSettings; onSample: () => void; onChange: (value: WrapSettings) => void; onExit: () => void; onView?: (join: boolean) => void;
}) {
  return <div className="wrap-tattoo-controls" aria-label="Wrap around test">
    {!value ? <><button type="button" className="ep-btn ep-btn--block" onClick={onSample}>Try a 360° armband</button><small>Upper-arm test with a seamless example design.</small></> : <>
      {!compact && <p className="wrap-title">Wrap around <span>Test</span></p>}
      <p>{compact ? 'Drag skin to orbit.' : 'The design closes around the whole arm. Drag bare skin to inspect it.'}</p>
      {!compact && <label>Arm<select aria-label="Band arm" value={value.region} onChange={e => onChange({ ...value, region: e.target.value as WrapSettings['region'] })}><option value="armLeft">Left arm</option><option value="armRight">Right arm</option></select></label>}
      <label>Position <output>{Math.round((value.position - .650) / .07 * 100)}%</output><input aria-label="Band position" type="range" min="0" max="100" step="1" value={(value.position - .650) / .07 * 100} onChange={e => onChange({ ...value, position: .650 + Number(e.target.value) * .0007 })} /></label>
      <label>Band height <output>{Math.round(value.height / DEFAULT_WRAP.height * 100)}%</output><input aria-label="Band height" type="range" min="50" max="166" step="1" value={value.height / DEFAULT_WRAP.height * 100} onChange={e => onChange({ ...value, height: Number(e.target.value) / 100 * DEFAULT_WRAP.height })} /></label>
      <label>Around the arm <output>{Math.round(value.phase)}°</output><input aria-label="Band rotation around arm" type="range" min="0" max="360" step="1" value={value.phase} onChange={e => onChange({ ...value, phase: Number(e.target.value) })} /></label>
      {onView && <div className="wrap-actions"><button type="button" onClick={() => onView(false)}>View design</button><button type="button" onClick={() => onView(true)}>Inspect join</button></div>}
      {!compact && <><small>Use artwork with matching left and right edges. Other images may show a join. Height follows body proportions.</small>
      <div className="wrap-actions"><a href={WRAP_ARTWORK} download="smart-ink-seamless-armband.svg">Sample SVG ↓</a><a href="/tattoos/continuous-chevron-band.png" download>Sample PNG ↓</a></div>
      <a href="/tattoos/armband-artwork-guide.txt" download>Artwork delivery guide ↓</a></>}
      <button type="button" className="ep-btn ep-btn--block" onClick={onExit}>Return to regular placement</button>
    </>}
  </div>;
}
