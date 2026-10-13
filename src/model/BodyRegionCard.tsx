import { useEffect, useId, useRef, useState } from 'react';
import { BODY_SHAPE_PARAMS, BODY_SHAPE_LIMITS, clampShapeValue, formatShapeValue, type BodyShape, type BodyShapeKey } from '../render/bodyShape';
import { regionDef, type BodyRegionId } from '../render/bodyRegions';
import './viewportCards.css';

interface BodyRegionCardProps {
  region: BodyRegionId;
  x: number;
  y: number;
  shape: BodyShape;
  fitted?: boolean;
  onChange: (key: BodyShapeKey, value: number) => void;
  onClose: () => void;
  onMeasure?: () => void;
}

/** Click-to-open body controls. Native ranges work with mouse, touch and keys. */
export function BodyRegionCard({ region, x, y, shape, fitted = false, onChange, onClose, onMeasure }: BodyRegionCardProps) {
  const id = useId(), ref = useRef<HTMLDivElement>(null), definition = regionDef(region);
  const [position, setPosition] = useState({ left: x + 24, top: y - 40 });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const layout = () => {
      const width = ref.current?.offsetWidth ?? 288, height = ref.current?.offsetHeight ?? 400;
      setPosition({
        left: Math.max(12, Math.min(x + 24, window.innerWidth - width - 12)),
        top: Math.max(74, Math.min(y - 40, window.innerHeight - height - 20)),
      });
    };
    layout();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
    };
    window.addEventListener('resize', layout);
    window.addEventListener('keydown', closeOnEscape);
    // The selected region is announced and immediately usable from a keyboard.
    ref.current?.focus({ preventScroll: true });
    return () => { window.removeEventListener('resize', layout); window.removeEventListener('keydown', closeOnEscape); };
  }, [x, y, region]);

  return <div ref={ref} className="body-region-card" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} tabIndex={-1} style={position}>
    <header><div><span className="viewport-card-eyebrow">Shape your model</span><h3 id={`${id}-title`}>{definition.label}</h3></div><button type="button" aria-label="Close body adjustments" className="viewport-card-close" onClick={onClose}>×</button></header>
    {fitted ? <div className="body-region-card-lock"><strong>Matched to measurements</strong><p>Your proportions are protected. Update the measurements to change this body.</p>{onMeasure && <button type="button" onClick={onMeasure}>Edit measurements</button>}</div> : <>
      <p className="viewport-card-hint">Adjust here, or select another part of the body.</p>
      <div className="body-region-card-controls">{definition.params.map(key => {
        const param = BODY_SHAPE_PARAMS.find(item => item.key === key)!;
        const value = clampShapeValue(key, shape[key]), limit = BODY_SHAPE_LIMITS[key];
        return <label className="body-region-card-control" key={key}>
          <span><span>{param.label}</span><output htmlFor={`${id}-${key}`}>{formatShapeValue(value)}</output></span>
          <input id={`${id}-${key}`} type="range" min={limit.min} max={limit.max} step={.01} value={value} aria-label={param.label} aria-valuetext={`${formatShapeValue(value)} relative adjustment`} title={param.hint} onChange={event => onChange(key, clampShapeValue(key, Number(event.target.value)))} />
        </label>;
      })}</div>
      <footer><button type="button" onClick={() => definition.params.forEach(key => onChange(key, 0))}>Reset this region</button><button type="button" className="viewport-card-done" onClick={onClose}>Done</button></footer>
    </>}
  </div>;
}

export default BodyRegionCard;
