import { DEFAULT_SLEEVE, SLEEVE_IDS, SLEEVE_SOURCES, type SleeveSettings, type SleeveSectionId } from '../render/sleeveTypes';
import './viewportCards.css';
const labels = { arm: 'Arm', shoulder: 'Shoulder', chest: 'Chest' };
export default function SleeveTattooControls({ value, onStart, onChange, onExit, onView, compact = false }: {
  value?: SleeveSettings; onStart: () => void; onChange: (s: SleeveSettings) => void; onExit: () => void; onView?: (section?: SleeveSectionId) => void; compact?: boolean;
}) {
  if (!value) return <div className="wrap-tattoo-controls"><button type="button" className="ep-btn ep-btn--block" onClick={onStart}>Try a shoulder + sleeve</button><small>Three editable circle-pattern sections.</small></div>;
  const active = value.sections[value.active];
  const update = (key: keyof typeof active, next: number | boolean) => onChange({ ...value, sections: { ...value.sections, [value.active]: { ...active, [key]: next } } });
  return <div className="wrap-tattoo-controls" aria-label="Sleeve composition test">
    {!compact && <><p className="wrap-title">Sleeve composition <span>Test</span></p><p>Connect three sections across the arm, shoulder and chest. Drag bare skin to orbit.</p></>}
    <div className="sleeve-section-tabs" role="group" aria-label="Sleeve sections">{SLEEVE_IDS.map(id => <button key={id} type="button" aria-pressed={value.active === id} onClick={() => onChange({ ...value, active: id })}>{labels[id]}</button>)}</div>
    <label><span>Show {labels[value.active].toLowerCase()}</span><input type="checkbox" checked={active.visible} onChange={e => update('visible', e.target.checked)} /></label>
    <label>Size <output>{Math.round(active.scale * 100)}%</output><input type="range" aria-label="Section size" min="65" max="135" value={active.scale * 100} onChange={e => update('scale', Number(e.target.value) / 100)} /></label>
    <label>{value.active === 'arm' ? 'Around the arm' : 'Across'}<input type="range" aria-label="Section horizontal position" min="-25" max="25" value={active.x * 100} onChange={e => update('x', Number(e.target.value) / 100)} /></label>
    <label>Up / down<input type="range" aria-label="Section vertical position" min="-25" max="25" value={active.y * 100} onChange={e => update('y', Number(e.target.value) / 100)} /></label>
    {value.active !== 'arm' && <label>Rotate <output>{active.rotation}°</output><input type="range" aria-label="Section rotation" min="-60" max="60" value={active.rotation} onChange={e => update('rotation', Number(e.target.value))} /></label>}
    <label>{value.active === 'arm' ? 'Trim lower edge' : 'Trim join edge'}<input type="range" aria-label="Section edge trim" min="0" max="30" value={active.trim * 100} onChange={e => update('trim', Number(e.target.value) / 100)} /></label>
    <div className="wrap-actions"><button type="button" onClick={() => onView?.()}>Whole sleeve</button><button type="button" onClick={() => onView?.(value.active)}>Inspect section</button><button type="button" onClick={() => onChange({ ...value, sections: { ...value.sections, [value.active]: { ...DEFAULT_SLEEVE.sections[value.active] } } })}>Reset section</button></div>
    {!compact && <><small>Edges are shaped by the transparent artwork. Trim and position the sections to refine the joins. This test uses fixed sample layers.</small><a href={SLEEVE_SOURCES[value.active]} download>Download {labels[value.active].toLowerCase()} artwork ↓</a></>}
    <button type="button" className="ep-btn ep-btn--block" onClick={onExit}>Return to regular placement</button>
  </div>;
}
