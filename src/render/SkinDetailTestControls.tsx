import { useState } from 'react';
import { skinDetailSettings } from './skinDetailTest';
export function SkinDetailTestControls() {
  const [enabled, setEnabled] = useState(skinDetailSettings.enabled);
  const [strength, setStrength] = useState(skinDetailSettings.strength);
  const [scale, setScale] = useState(skinDetailSettings.scale);
  return <aside aria-label="Skin detail" style={{ position: 'absolute', zIndex: 12, bottom: 20, left: 20, width: 240, padding: 14, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: 12, boxShadow: '0 8px 30px #0003' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}><strong>Skin detail</strong><button className="ep-btn" aria-pressed={enabled} onClick={() => { skinDetailSettings.enabled = !enabled; setEnabled(!enabled); }}>{enabled ? 'On' : 'Off'}</button></div>
    <label style={{ display:'grid', gap:6 }}>Relief · {Math.round(strength * 100)}%<input aria-label="Skin relief" type="range" min="0" max="2" step="0.05" value={strength} disabled={!enabled} onChange={e => { const v = Number(e.target.value); skinDetailSettings.strength = v; setStrength(v); }} /></label>
    <label style={{ display:'grid', gap:6, marginTop:10 }}>Detail size · {scale.toFixed(1)}×<input aria-label="Skin detail size" type="range" min="0.5" max="3" step="0.1" value={scale} disabled={!enabled} onChange={e => { const v = Number(e.target.value); skinDetailSettings.scale = v; setScale(v); }} /></label>
    <p style={{ color:'var(--text-secondary)', marginTop:10, lineHeight:1.5 }}>Zoom close to inspect. 1× uses the original pattern scale; it is an artistic estimate.</p>
  </aside>;
}
