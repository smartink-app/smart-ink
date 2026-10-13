import { useRef, useState, type RefObject, type ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { tattooAnchorPoint } from './tattooHit';
import type { SurfaceAnchor } from '../render/surfacePlacement';
import './viewportCards.css';
import PrecisionScrubber from './PrecisionScrubber';

interface Props {
  mesh: RefObject<THREE.Mesh | null>;
  anchor: RefObject<SurfaceAnchor | null>;
  scale: number;
  rotation: number;
  onScale: (value: number) => void;
  onRotation: (value: number) => void;
  boundsControls?: ReactNode;
  wrapControls?: ReactNode;
  customTitle?: string;
  onHide?: () => void;
}

/** HTML keeps the small on-model controls sharp and keyboard-accessible. */
export default function TattooViewportControls({ mesh, anchor, scale, rotation, onScale, onRotation, boundsControls, wrapControls, customTitle, onHide }: Props) {
  const { gl, camera } = useThree(), card = useRef<HTMLDivElement>(null);
  const position = useRef(new THREE.Vector3()), normal = useRef(new THREE.Vector3()), toCamera = useRef(new THREE.Vector3());
  const turn = rotation % 360;
  const displayRotation = turn > 180 ? turn - 360 : turn < -180 ? turn + 360 : turn;
  const [collapsed, setCollapsed] = useState(false);
  useFrame(() => {
    if (!card.current || !mesh.current || !anchor.current) return;
    const body = mesh.current, placement = anchor.current, element = card.current;
    body.updateWorldMatrix(true, false);
    tattooAnchorPoint(body, placement, position.current);
    toCamera.current.copy(camera.position).sub(position.current).normalize();
    const normals = body.geometry.getAttribute('normal');
    normal.current.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const index = body.geometry.index?.getX(placement.faceIndex * 3 + k) ?? placement.faceIndex * 3 + k;
      normal.current.x += normals.getX(index) * placement.barycentric[k];
      normal.current.y += normals.getY(index) * placement.barycentric[k];
      normal.current.z += normals.getZ(index) * placement.barycentric[k];
    }
    normal.current.transformDirection(body.matrixWorld);
    position.current.project(camera);
    const { width, height } = gl.domElement.getBoundingClientRect();
    // The inspector can shorten the canvas. Keep long controls scrollable
    // inside that visible area, rather than clipping below it.
    element.style.maxHeight = `${Math.max(48, height - 74)}px`;
    const inView = Math.abs(position.current.x) <= 1.1 && Math.abs(position.current.y) <= 1.1 && position.current.z < 1 && (!!placement.wrap || !!placement.sleeve || normal.current.dot(toCamera.current) > .08);
    element.style.visibility = inView ? 'visible' : 'hidden';
    const x = (position.current.x + 1) * width / 2 + 58, y = (1 - position.current.y) * height / 2 - 34;
    element.style.left = `${Math.max(12, Math.min(x, width - element.offsetWidth - 12))}px`;
    element.style.top = `${Math.max(12, Math.min(y, height - element.offsetHeight - 62))}px`;
  });
  return <Html calculatePosition={() => [0, 0, 0]} zIndexRange={[8, 8]} style={{ pointerEvents: 'none' }}><div ref={card} className="tattoo-transform-card" role="group" aria-label="Tattoo adjustments" style={{ position: 'absolute', visibility: 'hidden' }} onPointerDown={event => event.stopPropagation()}>
    <header><span>{customTitle ?? (wrapControls ? '360° armband' : 'Your tattoo')}</span><button className="tattoo-transform-toggle" type="button" aria-expanded={onHide ? undefined : !collapsed} aria-label={onHide ? 'Hide tattoo controls and tips' : collapsed ? 'Show tattoo adjustments' : 'Minimize tattoo adjustments'} title={onHide ? 'Hide controls and tips · restore from the toolbar' : undefined} onClick={() => onHide ? onHide() : setCollapsed(value => !value)}>{collapsed ? '+' : '−'}</button></header>
    {!collapsed && (wrapControls || <><p className="tattoo-pointer-help">Drag the design to move it.<br />Drag bare skin to orbit the model.</p><p className="tattoo-touch-help">Drag to orbit. Pinch to zoom.<br />Tap skin to place; drag ink with Pencil.</p>
      <PrecisionScrubber label="Size" value={scale * 100} min={10} max={300} unit="%" onChange={value => onScale(value / 100)} />
      <PrecisionScrubber label="Rotation" value={displayRotation} min={-180} max={180} unit="°" onChange={onRotation} />
      <p className="tattoo-scrub-help">Drag a value ↔ · Hold Shift for precision</p>
      {boundsControls}
    </>)}
  </div></Html>;
}
