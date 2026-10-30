import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Fixed room coordinates: same 2x scale and -2.12 floor as the Blender importer. */
export default function HeritageAtelier() {
  const { scene, invalidate, gl } = useThree();
  useEffect(() => {
    let cancelled = false;
    const root = new THREE.Group(); root.name = 'Heritage Atelier'; root.userData.studioBackdrop = true;
    root.scale.setScalar(2); root.position.y = -2.12;
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    let probe: THREE.WebGLRenderTarget | undefined;
    scene.add(root);
    new GLTFLoader().load('/environments/heritage-atelier/scene-baked.glb?v=2', asset => {
      if (cancelled) { asset.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } }); return; }
      asset.scene.updateMatrixWorld(true);
      const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
      asset.scene.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial;
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
        if (m.name.includes('BakedDiffuse')) {
          // Cycles already integrated direct + indirect diffuse. Keep live specular
          // reflections, but do not light the baked color a second time.
          m.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace(
              'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
              'vec3 outgoingLight = diffuseColor.rgb + totalSpecular + totalEmissiveRadiance;'
            );
          };
          m.customProgramCacheKey = () => 'heritage-baked-diffuse-v1';
          if (m.map) m.map.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
        }
        m.envMapIntensity = .7;
        const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        geometry.applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
        if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        const list = batches.get(m) ?? []; list.push(geometry); batches.set(m, list); o.geometry.dispose();
      });
      for (const [material, geometries] of batches) {
        const geometry = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; root.add(mesh);
      }
      new THREE.TextureLoader().load('/environments/heritage-atelier/probe.png', texture => {
        if (cancelled) { texture.dispose(); return; }
        texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace;
        const generator = new THREE.PMREMGenerator(gl); probe = generator.fromEquirectangular(texture); generator.dispose(); texture.dispose();
        materials.forEach(m => { const material = m as THREE.MeshStandardMaterial; material.envMap = probe!.texture; material.needsUpdate = true; }); invalidate();
      });
      invalidate();
    }, undefined, error => { if (!cancelled) console.error('Heritage Atelier could not load', error); });
    return () => { cancelled = true; scene.remove(root); root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); probe?.dispose(); invalidate(); };
  }, [scene, invalidate, gl]);
  return null;
}
