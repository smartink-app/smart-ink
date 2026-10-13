import { useEffect, useId, useRef } from 'react';
import { FaExpand, FaSlidersH } from 'react-icons/fa';
import { BODY_REGIONS, regionLabel, type BodyRegionId } from './render/bodyRegions';

interface ViewportControlsProps {
  disabled?: boolean;
  inline?: boolean;
  cameraPreset: string;
  cameras: Record<string, { name: string }>;
  onCameraChange: (preset: string) => void;
  region: BodyRegionId | null;
  onRegionChange: (region: BodyRegionId | null) => void;
  onHighlightRegions: (regions: BodyRegionId[]) => void;
  onFit: () => void;
  showPlacementTips: boolean;
  onPlacementTipsChange: (visible: boolean) => void;
  performanceMode: boolean;
  onPerformanceChange: (enabled: boolean) => void;
}

/** View choices stay beside the canvas; they do not change the figure itself. */
export default function ViewportControls({ disabled = false, inline = false, cameraPreset, cameras, onCameraChange,
  region, onRegionChange, onHighlightRegions, onFit, performanceMode, onPerformanceChange, showPlacementTips, onPlacementTipsChange }: ViewportControlsProps) {
  const id = useId(), settings = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (settings.current && !settings.current.contains(event.target as Node)) settings.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  return <div className={`viewport-tools${inline ? ' viewport-tools--inline' : ''}`} inert={disabled} aria-label="Viewport controls">
    <div className="viewport-tools-row">
      <label className="viewport-field" htmlFor={`${id}-focus`}><span>Focus</span>
        <select id={`${id}-focus`} className="ep-select" value={region ?? 'full'}
          onChange={event => { onRegionChange(event.currentTarget.value === 'full' ? null : event.currentTarget.value as BodyRegionId); onHighlightRegions([]); }}
          onMouseEnter={() => onHighlightRegions(region ? [region] : [])} onMouseLeave={() => onHighlightRegions([])}>
          <option value="full">Full figure</option>
          {BODY_REGIONS.map(part => <option key={part.id} value={part.id}>{part.label}</option>)}
        </select>
      </label>
      <button type="button" className="ep-btn viewport-button" onClick={onFit} title={`Fit ${regionLabel(region).toLowerCase()} in the viewport`}><FaExpand aria-hidden="true" />Fit</button>
      <button type="button" className="ep-btn viewport-button" data-tattoo-controls-toggle aria-pressed={showPlacementTips}
        title={showPlacementTips ? 'Hide floating tattoo controls and placement tips' : 'Show floating tattoo controls and placement tips'}
        onClick={() => onPlacementTipsChange(!showPlacementTips)}><FaSlidersH aria-hidden="true" />Tattoo controls</button>
      <details ref={settings} className="viewport-settings" onKeyDown={event => {
        if (event.key !== 'Escape' || !settings.current?.open) return;
        event.preventDefault(); event.stopPropagation(); settings.current.open = false;
        settings.current.querySelector('summary')?.focus();
      }}>
        <summary className="ep-btn viewport-button" aria-label="Viewport settings" title="Viewport settings"><FaSlidersH aria-hidden="true" /><span>View</span></summary>
        <div className="viewport-settings-panel">
      <label className="viewport-field" htmlFor={`${id}-view`}><span>View</span>
        <select id={`${id}-view`} className="ep-select viewport-view-select" value={cameraPreset} onChange={event => onCameraChange(event.currentTarget.value)}>
          {!Object.hasOwn(cameras, cameraPreset) && <option value={cameraPreset}>Custom view</option>}
          {Object.entries(cameras).map(([key, view]) => <option key={key} value={key}>{view.name}</option>)}
        </select>
      </label>
      <div className="viewport-view-shortcuts" role="group" aria-label="Common views">
        {['front', 'back', 'left', 'right'].filter(key => Object.hasOwn(cameras, key)).map(key => <button key={key} type="button" className="ep-btn viewport-button" aria-pressed={cameraPreset === key} onClick={() => onCameraChange(key)}>{key[0].toUpperCase() + key.slice(1)}</button>)}
      </div>

          <label><input type="checkbox" checked={performanceMode} onChange={event => onPerformanceChange(event.currentTarget.checked)} /><span>Faster preview</span></label>
          <p>Reduces preview detail and shadows. Blender renders keep their selected quality.</p>

        </div>
      </details>
    </div>
    {region && !inline && <div className="viewport-focus-status" role="status">
      <strong>{regionLabel(region)}</strong><span>Other body areas and clothes are hidden.</span>
      <button type="button" className="ep-btn viewport-button" onClick={() => { onRegionChange(null); onHighlightRegions([]); }}>Return to full figure</button>
    </div>}
  </div>;
}
