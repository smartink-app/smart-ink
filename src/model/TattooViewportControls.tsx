import { useRef, useState, type RefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { tattooAnchorPoint } from './tattooHit';
import type { SurfaceAnchor } from '../render/surfacePlacement';
import './viewportCards.css';

interface Props {
  mesh: RefObject<THREE.Mesh | null>;
  anchor: RefObject<SurfaceAnchor | null>;
  scale: number;
  rotation: number;
  onScale: (value: number) => void;
  onRotation: (value: number) => void;
}

/** HTML keeps the small on-model controls sharp and keyboard-accessible. */
export default function TattooViewportControls({ mesh, anchor, scale, rotation, onScale, onRotation }: Props) {
  const { gl, camera } = useThree(), card = useRef<HTMLDivElement>(null);
  const position = useRef(new THREE.Vector3()), normal = useRef(new THREE.Vector3()), toCamera = useRef(new THREE.Vector3());
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
    const inView = Math.abs(position.current.x) <= 1.1 && Math.abs(position.current.y) <= 1.1 && position.current.z < 1 && normal.current.dot(toCamera.current) > .08;
    element.style.visibility = inView ? 'visible' : 'hidden';
    const x = (position.current.x + 1) * width / 2 + 58, y = (1 - position.current.y) * height / 2 - 34;
    element.style.left = `${Math.max(12, Math.min(x, width - element.offsetWidth - 12))}px`;
    element.style.top = `${Math.max(12, Math.min(y, height - element.offsetHeight - 62))}px`;
  });
  return <Html calculatePosition={() => [0, 0, 0]} zIndexRange={[8, 8]} style={{ pointerEvents: 'none' }}><div ref={card} className="tattoo-transform-card" role="group" aria-label="Tattoo adjustments" style={{ position: 'absolute', visibility: 'hidden' }} onPointerDown={event => event.stopPropagation()}>
    <header><span>Your tattoo</span><button className="tattoo-transform-toggle" type="button" aria-expanded={!collapsed} aria-label={collapsed ? 'Show tattoo adjustments' : 'Minimize tattoo adjustments'} onClick={() => setCollapsed(value => !value)}>{collapsed ? '+' : '−'}</button></header>
    {!collapsed && <><p>Drag the design to move it.<br />Drag bare skin to orbit the model.</p>
      <div className="tattoo-transform-row"><span>Size</span><button type="button" aria-label="Make tattoo smaller" onClick={() => onScale(THREE.MathUtils.clamp(scale - .05, .1, 3))}>−</button><output aria-label="Tattoo size">{Math.round(scale * 100)}%</output><button type="button" aria-label="Make tattoo larger" onClick={() => onScale(THREE.MathUtils.clamp(scale + .05, .1, 3))}>+</button></div>
      <div className="tattoo-transform-row"><span>Rotate</span><button type="button" aria-label="Rotate tattoo counterclockwise" onClick={() => onRotation((rotation - 5 + 360) % 360)}>↶</button><output aria-label="Tattoo rotation">{Math.round(rotation)}°</output><button type="button" aria-label="Rotate tattoo clockwise" onClick={() => onRotation((rotation + 5) % 360)}>↷</button></div>
    </>}
  </div></Html>;
}
