import { STARTER_TATTOOS } from './config/starterTattoos';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { FiArrowLeft, FiMaximize, FiEdit3 } from 'react-icons/fi';
import ModelWithUVTattoo, { type ModelWithUVTattooHandle, type RegionFraming } from './ModelWithUVTattoo';
import OrbitControlsWithCmdLock from './OrbitControlsWithCmdLock';
import CinematicLights from './CinematicLights';
import ErrorBoundary from './ErrorBoundary';
import CrashScreen from './CrashScreen';
import AdjustmentControl from './AdjustmentControl';
import { LIGHTING_PRESETS, resolveRig, type LightingPresetKey } from './config/lightingPresets';
import { REGISTRY } from './render/registry';
import { BODY_REGIONS, type BodyRegionId } from './render/bodyRegions';
import { fitRegionCamera } from './render/focusCamera';
import type { CameraView } from './render/cameraTransition';
import type { SurfaceAnchor } from './render/surfacePlacement';

// Deliberately no account, storage, upload, or render-service dependency.
const samples = STARTER_TATTOOS.map(({ name, source }) => ({ name, image: source }));
const initialCamera: CameraView = { position: [0, 0, 8], target: [0, 0, 0], fov: 45 };

export default function PublicDemo({ onHome, onRequestAccess }: { onHome: () => void; onRequestAccess: () => void }) {
  const [tab, setTab] = useState<'tattoo' | 'body' | 'lighting'>('tattoo');
  const [artwork, setArtwork] = useState(samples[0].image);
  const [scale, setScale] = useState(1), [rotation, setRotation] = useState(0);
  const [visible, setVisible] = useState(true), [placement, setPlacement] = useState<SurfaceAnchor | null>(null);
  const [skin, setSkin] = useState('tone_03'), [body, setBody] = useState('body_full');
  const [region, setRegion] = useState<BodyRegionId | null>('armLeft');
  const [lighting, setLighting] = useState<LightingPresetKey>('studio');
  const [camera, setCamera] = useState<CameraView>(initialCamera), [request, setRequest] = useState(0);
  const [sized, setSized] = useState(false), [ready, setReady] = useState(false);
  const [hint, setHint] = useState('Click the skin to place the sample. Drag to orbit. Scroll to zoom.');
  const host = useRef<HTMLDivElement>(null), model = useRef<ModelWithUVTattooHandle>(null);
  const lights = resolveRig(lighting);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); setSized(rect.width > 0 && rect.height > 0); };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const frame = useCallback((framing: RegionFraming | null) => {
    if (!framing) return;
    const rect = host.current?.getBoundingClientRect();
    setCamera(fitRegionCamera(framing, [0, 0, 1], 45, rect && rect.height > 0 ? rect.width / rect.height : 1));
    setRequest(value => value + 1); setReady(true);
  }, []);
  return <div className="editor-app-root focus-demo">
    <aside className="studio-rail demo-rail">
      <button type="button" className="studio-rail-brand" onClick={onHome} aria-label="Smart Ink home"><img src="/brand-droplet.svg" alt="" /></button>
      <span className="demo-rail-label"><FiEdit3 aria-hidden />Live demo</span>

    </aside>
    <header className="editor-toolbar editor-toolbar--main">
      <button type="button" className="ep-btn ep-btn--ghost" onClick={onHome}><FiArrowLeft aria-hidden />Home</button>
      <div className="editor-scene-heading"><strong>Your first impression</strong><span className="focus-muted">Live 3D sample · changes aren’t saved</span></div>
      <button type="button" className="focus-primary" onClick={onRequestAccess}>Request beta access</button>
    </header>
    <div className="editor-body-row">
      <aside className="focus-control-panel demo-controls">
        <header className="ep-header ep-inspector-header"><span className="ep-title">Try it on.</span><p className="ep-hint">A few controls. Room to explore.</p>
          <div className="ep-inspector-tabs" aria-label="Demo sections">{(['tattoo', 'body', 'lighting'] as const).map(item => <button type="button" key={item} className="ep-inspector-tab" aria-pressed={tab === item} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        </header>
        <div className="ep-sidebar-body">
          <section className="ep-section" hidden={tab !== 'tattoo'}>
            <p className="ep-section-label">Choose a sample</p>
            <div className="demo-samples">{samples.map(sample => <button type="button" key={sample.image} aria-pressed={artwork === sample.image} onClick={() => { setArtwork(sample.image); setVisible(true); }}><img src={sample.image} alt="" /><span>{sample.name}</span></button>)}</div>
            <button type="button" className="ep-btn" disabled={!ready} onClick={() => model.current?.placeInView()}>Place on visible skin</button>
            <AdjustmentControl label="Size" value={scale * 100} min={10} max={300} step={1} unit="%" resetValue={100} onChange={value => setScale(value / 100)} />
            <AdjustmentControl label="Rotation" value={rotation} min={-180} max={180} step={1} unit="°" resetValue={0} onChange={setRotation} />
            <button type="button" className="ep-btn" aria-pressed={!visible} disabled={!placement} onClick={() => setVisible(value => !value)}>{visible ? 'Show before' : 'Show tattoo'}</button>
          </section>
          <section className="ep-section" hidden={tab !== 'body'}>
            <label className="ep-field">Body model<select className="ep-select" value={body} onChange={event => { setBody(event.target.value); setPlacement(null); setReady(false); }}>{REGISTRY.bodyMeshes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <p className="ep-section-label">Skin tone</p>
            <div className="cb-swatch-row">{REGISTRY.skinTones.map(tone => <button type="button" className="cb-swatch-wrap" key={tone.id} aria-pressed={skin === tone.id} onClick={() => setSkin(tone.id)}><span className={`cb-swatch${skin === tone.id ? ' selected' : ''}`} style={{ background: tone.swatch }} /><span className="cb-swatch-label">{tone.label}</span></button>)}</div>
            <p className="ep-hint">Beta members can also adjust proportions, pose, clothing, and follow the body measurement guide.</p>
          </section>
          <section className="ep-section" hidden={tab !== 'lighting'}>
            <label className="ep-field">Lighting preset<select className="ep-select" value={lighting} onChange={event => setLighting(event.target.value as LightingPresetKey)}>{Object.entries(LIGHTING_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></label>
            <p className="ep-hint">Explore the mood here. The beta adds individual light controls and finished image rendering.</p>
          </section>
          <div className="demo-invite"><p className="ep-section-label">Make it your own</p><p>Bring your artwork, save projects, and create finished renders with beta access.</p><button type="button" className="ep-btn" onClick={onRequestAccess}>Request an invite ↗</button></div>
        </div>
      </aside>
      <main className="editor-canvas-host">
        <div className="viewport-tools"><div className="viewport-tools-row"><label className="viewport-field"><span>Focus</span><select className="ep-select" value={region ?? 'full'} onChange={event => setRegion(event.target.value === 'full' ? null : event.target.value as BodyRegionId)}><option value="full">Full figure</option>{BODY_REGIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button type="button" className="ep-btn" disabled={!ready} onClick={() => frame(model.current?.getRegionFraming() ?? null)}><FiMaximize aria-hidden />Fit</button><span className="demo-live-badge">Interactive preview</span></div></div>
        <div className="editor-canvas-stage"><div className="editor-canvas-bg demo-canvas-bg" /><div className="editor-canvas-inner" ref={host}>
          <ErrorBoundary resetKeys={[body]} fallback={({ error, reset }) => <CrashScreen inline title="The 3D sample couldn’t load" body="Try loading it again, or return to the homepage." error={error} actions={[{ label: 'Try again', onClick: reset, primary: true }, { label: 'Home', onClick: onHome }]} /> }>
            {sized && <Canvas camera={initialCamera} dpr={[1, 1.5]} gl={{ antialias: true }}>
              <CinematicLights preset={lighting} lights={lights} scale={LIGHTING_PRESETS[lighting].threeIntensityScale} performanceMode={false} />
              <Suspense fallback={null}><ModelWithUVTattoo ref={model} key={body} uploadedImage={artwork} bodyMeshId={body} skinToneId={skin} decalRotation={rotation} decalScale={scale} decalColor="#ffffff" decalOpacity={1} visible={visible} setDecalVisible={setVisible} initialPlacement={placement} onPlacementChange={setPlacement} onPlacementStatus={setHint} lights={lights} intensityScale={LIGHTING_PRESETS[lighting].threeIntensityScale} isolateRegion={region} onFrameRegion={frame} /></Suspense>
              <OrbitControlsWithCmdLock cameraState={camera} cameraRequestId={request} setCameraState={setCamera} />
            </Canvas>}
          </ErrorBoundary>
          <div className="placement-help" role="status"><strong>{ready ? 'Explore the sample' : 'Loading the 3D body…'}</strong><span>{ready ? hint : 'Preparing the mesh and skin details.'}</span></div>
        </div></div>
      </main>
    </div>
  </div>;
}
