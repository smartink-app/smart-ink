import type { StudioSettings } from './render/studioSettings';
import { STUDIO_PAPERS } from './render/studioSettings';
export type ShotFormat = 'view' | 'portrait' | 'square' | 'landscape';
export default function ShotStyleControls({guided = false,format,onFormatChange,blur,onBlurChange,brightness,onBrightnessChange,studio,onStudioChange}: {
  guided?:boolean;format:ShotFormat;onFormatChange:(value:ShotFormat)=>void;blur:number;onBlurChange:(value:number)=>void;
  brightness:number;onBrightnessChange:(value:number)=>void;studio:StudioSettings;onStudioChange:(value:StudioSettings)=>void;
}) {
  return <section className="shot-style-controls" aria-label="Photo style">
    <label>Format<select value={format} onChange={e=>onFormatChange(e.target.value as ShotFormat)}>
      <option value="view">Current view</option><option value="portrait">Portrait · 4:5</option><option value="square">Square · 1:1</option><option value="landscape">Landscape · 3:2</option>
    </select></label>
    <label>Backdrop<select value={studio.color} onChange={e=>onStudioChange({...studio,mode:'sweep',color:e.target.value,gradient:undefined,showGuides:false})}>
      {!STUDIO_PAPERS.some(p=>p.color===studio.color)&&<option value={studio.color}>Shot preset</option>}
      {STUDIO_PAPERS.map(p=><option key={p.color} value={p.color}>{p.name}</option>)}
    </select></label>
    <label>Brightness <span>{Math.round(brightness*100)}%</span><input aria-label="Shot brightness" type="range" min={guided ? .9 : .7} max={guided ? 1.2 : 1.4} step="0.05" value={brightness} onChange={e=>onBrightnessChange(Number(e.target.value))}/></label>
    {!guided && <label>Lens blur <span>{blur===0?'Sharp':Math.round(blur*100)+'%'}</span><input aria-label="Lens blur" type="range" min="0" max="1" step="0.1" value={blur} onChange={e=>onBlurChange(Number(e.target.value))}/></label>}
    <p className="snapshot-controls-hint">{guided ? 'Guided shots keep the artwork sharp. Check the finished photo before publishing.' : 'Focus stays on the tattoo. Lens blur appears in your Blender photo; the live view stays sharp for editing.'}</p>
  </section>;
}
