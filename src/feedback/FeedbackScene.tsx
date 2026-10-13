import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { validateSurfaceAnchor, type SurfaceAnchor } from '../render/surfacePlacement';
import { tattooAnchorPoint } from '../model/tattooHit';
import { regionLabel, type BodyRegionId } from '../render/bodyRegions';
import { bindFeedbackTap } from './pointer';
import type { FeedbackLocation, FeedbackThread } from './model';

export interface FeedbackSceneProps {
  threads: FeedbackThread[];
  selected: string | null;
  draft: FeedbackLocation | null;
  armed: boolean;
  onPick: (anchor: SurfaceAnchor, label: string) => void;
  onSelect: (id: string) => void;
  onMiss: () => void;
}
interface ModelProps {
  mesh: RefObject<THREE.Mesh | null>;
  bodyMeshId: string;
  pick: (e: PointerEvent) => { anchor: SurfaceAnchor; region: BodyRegionId | null } | null;
}
function Pin({ mesh, anchor, label, selected, resolved, onSelect, pick }: {
  mesh: ModelProps['mesh']; anchor: SurfaceAnchor; label: string; selected: boolean; resolved: boolean; onSelect?: () => void; pick: ModelProps['pick'];
}) {
  const element = useRef<HTMLButtonElement>(null);
  const { camera, gl } = useThree();
  const point = useMemo(() => new THREE.Vector3(), []);
  const last = useRef(0);
  useFrame(({ clock }) => {
    const button = element.current, body = mesh.current;
    if (!button || !body) return;
    if (!validateSurfaceAnchor(anchor, body.geometry)) { button.style.visibility = 'hidden'; return; }
    tattooAnchorPoint(body, anchor, point);
    point.project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    const x = (point.x + 1) * rect.width / 2, y = (1 - point.y) * rect.height / 2;
    button.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    if (point.z < -1 || point.z > 1 || x < 16 || y < 16 || x > rect.width - 16 || y > rect.height - 16) { button.style.visibility = 'hidden'; return; }
    // Reuse the skin picker: hidden anatomy, clothing and the far side cannot show pins.
    if (clock.elapsedTime - last.current > .09) {
      last.current = clock.elapsedTime;
      const hit = pick({ clientX: rect.left + x, clientY: rect.top + y } as PointerEvent);
      if (!hit) { button.style.visibility = 'hidden'; return; }
      const visible = tattooAnchorPoint(body, hit.anchor, point).clone();
      tattooAnchorPoint(body, anchor, point);
      button.style.visibility = visible.distanceTo(point) < .003 ? 'visible' : 'hidden';
    }
  });
  return <Html calculatePosition={() => [0, 0]} zIndexRange={[12, 12]} style={{ pointerEvents: 'none' }}>
    <button ref={element} type="button" className={`feedback-pin${selected ? ' is-selected' : ''}${resolved ? ' is-resolved' : ''}`}
      aria-label={onSelect ? `Open feedback ${label}` : 'New feedback pin'} aria-pressed={onSelect ? selected : undefined}
      style={{ visibility: 'hidden', pointerEvents: onSelect ? 'auto' : 'none' }} onPointerDown={e => e.stopPropagation()} onClick={onSelect}>{label}</button>
  </Html>;
}
export default function FeedbackScene({ mesh, bodyMeshId, pick, threads, selected, draft, armed, onPick, onSelect, onMiss }: ModelProps & FeedbackSceneProps) {
  const { gl } = useThree();
  const callbacks = useRef({ onPick, onMiss }); callbacks.current = { onPick, onMiss };
  useEffect(() => {
    if (!armed) return;
    gl.domElement.style.cursor = 'crosshair';
    const unbind = bindFeedbackTap(gl.domElement, window, e => {
      const hit = pick(e);
      if (hit) callbacks.current.onPick(hit.anchor, regionLabel(hit.region)); else callbacks.current.onMiss();
    });
    return () => { unbind(); gl.domElement.style.cursor = ''; };
  }, [armed, gl, pick]);
  return <>
    {threads.map((t, index) => t.location?.anchor.bodyMeshId === bodyMeshId && <Pin key={t.id} mesh={mesh} pick={pick} anchor={t.location.anchor}
      label={String(index + 1)} selected={selected === t.id} resolved={t.resolved} onSelect={() => onSelect(t.id)} />)}
    {draft?.anchor.bodyMeshId === bodyMeshId && <Pin mesh={mesh} pick={pick} anchor={draft.anchor} label="+" selected resolved={false} />}
  </>;
}
