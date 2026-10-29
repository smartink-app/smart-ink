import { closeupGeometry } from './render/closeupGeometry';
import FeedbackScene, { type FeedbackSceneProps } from './feedback/FeedbackScene';
import { deformFit, heightWarp, type BodyFit } from './measurements/fitter';
import { bindSkinRestCoordinates, SKIN_DETAIL, SKIN_DETAIL_GLSL, SKIN_REGION_GLSL } from './render/skinDetail';
import { isTattooHit, tattooAnchorPoint } from './model/tattooHit';
import TattooViewportControls from './model/TattooViewportControls';
import SleeveTattooControls from './model/SleeveTattooControls';
import { DEFAULT_SLEEVE, SLEEVE_SOURCES, type SleeveSettings, type SleeveSectionId } from './render/sleeveTypes';
import { buildSleeveComposition, attachSleeveToGeometry, sleeveFraming, type SleeveComposition } from './render/sleevePlacement';
import { SLEEVE_VERTEX_DECL, SLEEVE_VERTEX_ASSIGN, SLEEVE_GLSL } from './render/sleeveShader';
import WrapTattooControls from './model/WrapTattooControls';
import { buildWrapChart, DEFAULT_WRAP, type WrapSettings } from './render/wrapPlacement';
import TattooBoundsControls from './model/TattooBoundsControls';
import { areaAtAnchor, createPlacementDomain, assessPlacement, footprintFromImage, fitPlacement, limitPlacement, type InkFootprint, type PlacementDomain, type PlacementBoundsStatus, type BoundsAssessment } from './render/placementBounds';
import { loadFitAsset } from './measurements/service';
import { measurementGuide, type MeasurementGuide } from './measurements/geometry';
import { createPreviewEyes } from './render/previewEyes';
import { tattooFramingFromGeometry, type TattooFraming } from './render/tattooCamera';
import { resolveTattooSource } from './render/tattooSource';
import { applyBodyPose, DEFAULT_BODY_POSE, type BodyPose } from './render/bodyPose';
import { createRegionMasks } from './render/bodyRegionMask';
import { DEFAULT_BODY_APPEARANCE, type BodyAppearance } from './render/bodyAppearance';
import { createClothing, createClothingCoverage, clothingCoversTriangle } from './render/previewClothing';
import { createPreviewHair, createHairCoverage } from './render/previewHair';
import { disposeAppearance, appearanceHit } from './render/previewAppearance';
import { createBodyShadowMaterials, createSkinLightUniforms, nearestEditorHelperDistance, resolveStudioLightRig, STUDIO_LIGHTING_GLSL } from './render/studioLightRig';
import { visibleRegionPoints, framingFromPoints, regionAtTriangle } from './render/focusGeometry';
import type { RegionFraming } from './render/focusCamera';
export type { RegionFraming } from './render/focusCamera';
import {
  use,
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useLoader, useThree, useFrame } from '@react-three/fiber';
import { DRACOLoader, GLTFLoader } from 'three-stdlib';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import { SURFACE_TATTOO_GLSL, WRAP_TATTOO_GLSL } from './render/tattooLayer';
import { createSurfaceTopology, buildSurfaceChart, type SurfaceAnchor, type SurfaceChart } from './render/surfacePlacement';
import { findById, REGISTRY } from './render/registry';
import type { LightDefinition } from './config/lightingPresets';
import {
  applyBodyShape,
  DEFAULT_BODY_SHAPE,
  prepareDeformable,
  refreshDeformableGeometry,
  shapeBounds,
  type BodyShape,
  type Deformable,
  type ShapeBounds,
} from './render/bodyShape';
import {
  REGION_BY_INDEX,
  REGION_INDEX,
  classifyPoint,
  regionFrame,
  type BodyRegionId,
} from './render/bodyRegions';

/** Centre on the reshaped body only, so outfits cannot move saved skin anchors. */
function recenterGroup(group: THREE.Object3D, body: THREE.Mesh): void {
  group.updateMatrixWorld(true);
  body.geometry.computeBoundingBox();
  const box = body.geometry.boundingBox!.clone().applyMatrix4(body.matrixWorld);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  group.position.sub(center);
}

/** Normalized figure height and palm-sized design in world units. */
const TARGET_BODY_HEIGHT = 4.2;
const TATTOO_BASE_SIZE = 0.42;

const DRACO_DECODER_PATH = '/draco/';

const vertexShader = `
  ${SLEEVE_VERTEX_DECL}
  #include <common>

  attribute float aRegion;
  attribute float aFocusMask;
  attribute float aClothingMask;
  attribute vec2 aTattooUv;
  attribute float aTattooMask;
  attribute float aTattooBoundary;
  attribute vec4 tangent;
  attribute vec3 aSkinRest;
  attribute vec3 aSkinNormal;
  varying vec3 vSkinRest;
  varying vec3 vSkinNormal;
  varying float vSkinArm;
  varying vec4 vSkinProfile;
  ${SKIN_REGION_GLSL}

  varying vec2 vUv;
  varying vec2 vTattooUv;
  varying float vTattooMask;
  varying float vTattooBoundary;
  varying vec3 vWorldNormal;
  varying vec3 vWorldTangent;
  varying vec3 vWorldBitangent;
  varying vec3 vWorldPosition;
  varying float vFocusMask;
  varying float vClothingMask;
  varying float vHighlightMask;
  uniform float uHighlightRegion;
  uniform float uHighlightRegion2;

  void main() {
    ${SLEEVE_VERTEX_ASSIGN}
    vUv = uv;
    vSkinRest = aSkinRest;
    vSkinProfile = skinRegion(aRegion, aSkinRest);
    vSkinNormal = aSkinNormal;
    vSkinArm = 1.0 - step(.1, min(abs(aRegion - 2.0), abs(aRegion - 3.0)));
    vTattooUv = aTattooUv;
    vTattooMask = aTattooMask;
    vTattooBoundary = aTattooBoundary;
    vFocusMask = aFocusMask;
    vClothingMask = aClothingMask;
    vHighlightMask = max(1.0 - step(0.5, abs(aRegion - uHighlightRegion)),
      1.0 - step(0.5, abs(aRegion - uHighlightRegion2)));

    #include <beginnormal_vertex>
    #include <begin_vertex>

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
    // glTF hands us mikktspace tangents, matching how Blender baked the map.
    vWorldTangent = normalize(mat3(modelMatrix) * tangent.xyz);
    vWorldBitangent = normalize(cross(vWorldNormal, vWorldTangent) * tangent.w);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = `
  ${SURFACE_TATTOO_GLSL}
  ${WRAP_TATTOO_GLSL}
  ${SLEEVE_GLSL}
  uniform float tattooWrap;

  ${STUDIO_LIGHTING_GLSL}

  uniform sampler2D skinTexture;
  uniform sampler2D normalMap;
  uniform float normalMapStrength;
  uniform sampler2D tattooTexture;
  uniform float tattooAspect;
  uniform vec3 tattooColor;
  uniform float tattooOpacity;
  uniform float tattooScale;
  uniform float tattooRotation;
  uniform float tattooVisible;
  /** Region to keep, or -1 to show the whole figure. */
  uniform float uIsolateRegion;
  /** Up to two regions to tint (a symmetric pair), or -1 for none. */
  uniform float uHighlightRegion;
  uniform float uHighlightRegion2;

  varying vec2 vUv;
  varying vec2 vTattooUv;
  varying float vTattooMask;
  varying float vTattooBoundary;
  varying vec3 vWorldNormal;
  varying vec3 vWorldTangent;
  varying vec3 vWorldBitangent;
  varying vec3 vWorldPosition;
  varying float vFocusMask;
  varying float vClothingMask;
  varying float vHighlightMask;

  ${SKIN_DETAIL_GLSL}

  /**
   * Surface normal with the baked sculpt detail folded in. The base cage is
   * only 10.5k faces; everything that reads as muscle definition lives here.
   */
  vec3 surfaceNormal() {
    vec3 N = normalize(vWorldNormal);
    if (normalMapStrength <= 0.0) return N;
    // Posing rotates the UV frame; re-orthogonalize after interpolation.
    vec3 T = normalize(vWorldTangent - N * dot(N, vWorldTangent));
    float handedness = dot(cross(N, T), vWorldBitangent) < 0.0 ? -1.0 : 1.0;
    vec3 B = normalize(cross(N, T)) * handedness;
    vec3 sampled = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    sampled.xy *= normalMapStrength;
    return normalize(mat3(T, B, N) * sampled);
  }

  void main() {
    // Cutting a region out is a fragment reject, so UVs, the placed tattoo
    // and the shape maths all still refer to the whole figure.
    if (uIsolateRegion >= 0.0 && vFocusMask < 0.0) discard;
    if (vClothingMask >= 0.0) discard;

    vec4 skin = texture2D(skinTexture, vUv);
    // Compute relief before branching on ink coverage; both surfaces share it.
    float microHeight = skinHeight();
    vec3 appearance = skinAppearance();
    vec3 baseSkinColor = skin.rgb;
    // Colour irregularity works at normal shot distance, independent of bump.
    skin.rgb *= vec3(1.0) + appearance.z * vec3(.45, 1.0, 1.15);
    skin.rgb *= 1.0 - appearance.x;
    float veins = skinVeins() * smoothstep(.15,.9,vSkinArm);
    skin.rgb *= vec3(1.0) + veins * vec3(-.075,-.012,.018);
    vec3 broadNormal = surfaceNormal();
    vec3 N = skinDetailNormal(broadNormal, microHeight);
    // Diffuse softens fine relief; surface reflections retain pore definition.
    // A preview approximation, not true subsurface light transport.
    vec3 skinLighting = studioLighting(normalize(mix(broadNormal, N, .4)), vWorldPosition);
    float roughness = clamp(.56 + (microHeight - .5) * .14 + appearance.z * .7, .44, .68);
    vec3 reflection = skinSpecular(N, roughness);
    skin.rgb = skin.rgb * skinLighting + reflection;

    if (tattooVisible > 0.5) {
      vec4 tattooLayer = sampleSurfaceTattoo(
        tattooTexture, vTattooUv, vTattooMask * step(0.0, vTattooBoundary), tattooScale,
        tattooAspect, tattooRotation, tattooColor, tattooOpacity
      );
      if (tattooWrap > .5) tattooLayer = sampleWrapTattoo(tattooTexture, vTattooUv, vTattooMask * step(0.0, vTattooBoundary), tattooColor, tattooOpacity);
      if (sleeveEnabled > .5) tattooLayer = sleeveComposite(tattooLayer, tattooColor, tattooOpacity);
      if (tattooLayer.a > 0.0) {
        skin.rgb = mix(skin.rgb, tattooLayer.rgb * 0.85 * skinLighting + reflection, tattooLayer.a);
      }
    }

    // Fine hairs sit over both bare and tattooed skin, with the same light rig.
    skin.rgb = mix(skin.rgb, baseSkinColor * skinLighting * .38 + reflection * .6,
      min(.65, appearance.y));

    bool lit = vHighlightMask > 0.5;
    if (lit) {
      skin.rgb = mix(skin.rgb, vec3(0.30, 0.49, 1.0), 0.22);
    }

    gl_FragColor = skin;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Generate box-projection UVs from position when geometry has no UVs (e.g. OBJ without vt). */
function ensureUVs(geometry: THREE.BufferGeometry): void {
  if (geometry.attributes.uv) return;
  const pos = geometry.attributes.position;
  if (!(pos instanceof THREE.BufferAttribute)) return;
  const count = pos.count;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = new THREE.Vector3();
  box.getSize(size);
  const min = box.min;
  const uvArray = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = (pos.getX(i) - min.x) / (size.x || 1);
    const y = (pos.getY(i) - min.y) / (size.y || 1);
    uvArray[i * 2] = x;
    uvArray[i * 2 + 1] = 1 - y;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
}

/**
 * Tags every vertex with the body region it belongs to, from the undeformed
 * pose. Membership is a property of the figure, not of the sliders, so this
 * is computed once and survives every reshape.
 */
function tagRegions(geometry: THREE.BufferGeometry, base: Float32Array, bounds: ShapeBounds): void {
  const frame = regionFrame(bounds);
  const count = base.length / 3;
  const regions = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    regions[i] = REGION_INDEX[classifyPoint(base[i * 3], base[i * 3 + 1], frame)];
  }
  geometry.setAttribute('aRegion', new THREE.BufferAttribute(regions, 1));
}

function createSkinTexture(hexColor: string): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 1.5;
    imgData.data[i] += noise;
    imgData.data[i + 1] += noise * 0.8;
    imgData.data[i + 2] += noise * 0.5;
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface UVTattooPlacementSnapshot {
  center: [number, number];
  scaleUV: number;
  rotationRad: number;
  hasPlaced: boolean;
  /** Source currently displayed by the tattoo texture, including the built-in example. */
  imageSource: string;
  imageReady: boolean;
  /** Effective visibility, including before/after mode and image readiness. */
  visible: boolean;
  bounds?: BoundsAssessment;
  surface?: { sleeve?: boolean; wrap?: boolean; geometry: THREE.BufferGeometry; size: number; aspect: number; color: string; opacity: number };
}

export interface ModelWithUVTattooHandle {
  setSleeve: (value: SleeveSettings | null) => boolean;
  getSleeveFraming: (section?: SleeveSectionId) => TattooFraming | null;
  setWrap: (value: WrapSettings | null) => boolean;
  placeInView: () => boolean;
  nudgeInView: (dx: number, dy: number) => boolean;
  getPlacement: () => UVTattooPlacementSnapshot;
  getRegionFraming: () => RegionFraming | null;
  getMeasurementGuide: (key: string) => MeasurementGuide | null;
  getTattooFraming: (join?: boolean) => TattooFraming | null;
  limitScale: (value: number) => number;
  limitRotation: (value: number) => number;
  setAreaLock: (locked: boolean) => void;
  fitToArea: () => void;
}

interface ModelWithUVTattooProps {
  feedback?: FeedbackSceneProps;
  uploadedImage: string | null;
  skinToneId: string;
  /** Which figure to load; falls back to the first registry entry. */
  bodyMeshId?: string;
  decalRotation: number;
  decalScale: number;
  decalColor: string;
  decalOpacity: number;
  setDecalVisible: (visible: boolean) => void;
  visible?: boolean;
  /** Photo mode keeps camera navigation available while blocking edits. */
  editingEnabled?: boolean;
  closeupPreview?: boolean;
  showTattooControls?: boolean;
  onHideTattooControls?: () => void;
  fingerPlacement?: boolean;
  /** Model mode selects anatomy; it never places or moves ink. */
  interactionMode?: 'tattoo' | 'model';
  onDecalScaleChange?: (value: number) => void;
  onDecalRotationChange?: (value: number) => void;
  onSleeveView?: (section?: SleeveSectionId) => void;
  onWrapRegion?: (region: 'armLeft' | 'armRight') => void;
  onWrapView?: (join: boolean) => void;
  onBoundsStatus?: (status: PlacementBoundsStatus | null) => void;
  initialPlacement?: SurfaceAnchor | null;
  onPlacementChange?: (anchor: SurfaceAnchor | null) => void;
  onPlacementStatus?: (message: string) => void;
  lights?: LightDefinition[];
  intensityScale?: number;
  performanceMode?: boolean;
  /** Sims-style shape sliders; identity when omitted. */
  bodyShape?: BodyShape;
  bodyFit?: BodyFit | null;
  /** Joint angles applied after body proportions; tattoos follow the same skin. */
  bodyPose?: BodyPose;
  bodyAppearance?: BodyAppearance;
  /** Only this region is drawn, and only it can take a tattoo. */
  isolateRegion?: BodyRegionId | null;
  /** Tinted in the viewport, e.g. while a slider for them is hovered. */
  highlightRegions?: BodyRegionId[];
  /** Pointer moved over (or off) a region, for the hover tint. */
  onHoverRegion?: (region: BodyRegionId | null) => void;
  /** Primary click in Model mode, or legacy right-press in Tattoo mode. */
  onRegionPress?: (
    region: BodyRegionId,
    clientX: number,
    clientY: number,
    pointerId: number
  ) => void;
  /** Bounds of a newly isolated region, so the camera can frame it. */
  onFrameRegion?: (framing: RegionFraming | null) => void;
}

const ModelWithUVTattoo = forwardRef<ModelWithUVTattooHandle, ModelWithUVTattooProps>(
  function ModelWithUVTattoo(
    {
      feedback,
      uploadedImage,
      skinToneId,
      bodyMeshId,
      decalRotation,
      decalScale,
      decalColor,
      decalOpacity,
      setDecalVisible,
      visible = true,
      editingEnabled = true,
      closeupPreview = false,
      showTattooControls = true,
      onHideTattooControls,
      fingerPlacement = false,
      interactionMode = 'tattoo',
      onDecalScaleChange,
      onDecalRotationChange,
      onBoundsStatus,
      onWrapView,
      onSleeveView,
      onWrapRegion,
      initialPlacement = null,
      onPlacementChange,
      onPlacementStatus,
      lights = [],
      intensityScale = 1,
      performanceMode = false,
      bodyShape = DEFAULT_BODY_SHAPE,
      bodyFit = null,
      bodyPose = DEFAULT_BODY_POSE,
      bodyAppearance = DEFAULT_BODY_APPEARANCE,
      isolateRegion = null,
      highlightRegions,
      onHoverRegion,
      onRegionPress,
      onFrameRegion,
    },
    ref
  ) {
    const { camera, scene, gl } = useThree();
    const fitAsset = bodyFit ? use(loadFitAsset(bodyFit.bodyMeshId)) : null;
    const [cloneGroup, setCloneGroup] = useState<THREE.Object3D | null>(null);
    const pickTargetRef = useRef<THREE.Object3D | null>(null);
    const deformablesRef = useRef<{ items: Deformable[]; bounds: ShapeBounds } | null>(null);
    const regionMasksRef = useRef<Record<BodyRegionId, Float32Array> | null>(null);
    const shapedPositionsRef = useRef<Float32Array | null>(null);
    const eyesRef = useRef<THREE.Group | null>(null);
    const appearanceGroupsRef = useRef<THREE.Group[]>([]);
    const clothingCoverageRef = useRef<Float32Array | null>(null);
    const hairCoverageRef = useRef<Float32Array | null>(null);
    const pickBlockedRef = useRef(false);
    const bodyMeshRef = useRef<THREE.Mesh | null>(null);
    const referenceGeoRef = useRef<THREE.BufferGeometry | null>(null);
    const topologyRef = useRef<ReturnType<typeof createSurfaceTopology> | null>(null);
    const chartRef = useRef<SurfaceChart | null>(null);
    const domainRef = useRef<PlacementDomain | null>(null);
    const [inkFootprint, setInkFootprint] = useState<InkFootprint | null>(null);
    const [boundsLimitMessage, setBoundsLimitMessage] = useState('');
    const anchorRef = useRef<SurfaceAnchor | null>(initialPlacement);
    const [chartVersion, setChartVersion] = useState(0);
    const [imageAspect, setImageAspect] = useState(1);
    const loadedImageRef = useRef<string | null>(null);
    const pointerStart = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
    const grabOffset = useRef({ x: 0, y: 0 });
    const pendingMove = useRef<PointerEvent | null>(null);
    const dragFrame = useRef<number | null>(null);
    const [hasPlaced, setHasPlaced] = useState(false);
    const hasPlacedRef = useRef(false);
    const isDragging = useRef(false);
    const touchGesture = useRef({ pointers: new Set<number>(), blocked: false });
    const isolateRef = useRef<BodyRegionId | null>(isolateRegion);
    const hoverRef = useRef<BodyRegionId | null>(null);
    const [hoveredRegion, setHoveredRegion] = useState<BodyRegionId | null>(null);

    useEffect(() => {
      hasPlacedRef.current = hasPlaced;
    }, [hasPlaced]);

    useEffect(() => {
      isolateRef.current = isolateRegion;
    }, [isolateRegion]);

    useEffect(() => {
      hoverRef.current = null;
      setHoveredRegion(null);
      gl.domElement.style.cursor = '';
    }, [interactionMode, gl]);

    const bodyDef =
      (bodyMeshId ? findById(REGISTRY.bodyMeshes, bodyMeshId) : undefined) ??
      REGISTRY.bodyMeshes[0];

    const gltf = useLoader(GLTFLoader, bodyDef.previewUrl, (loader) => {
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_PATH);
      (loader as GLTFLoader).setDRACOLoader(draco);
    });
    const normalMap = useLoader(TextureLoader, bodyDef.normalMapUrl);
    const [sleeveShoulderTexture, sleeveChestTexture] = useLoader(TextureLoader, [SLEEVE_SOURCES.shoulder, SLEEVE_SOURCES.chest]);
    useEffect(() => { for (const texture of [sleeveShoulderTexture, sleeveChestTexture]) { texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; } }, [sleeveShoulderTexture, sleeveChestTexture]);
    const detailMap = useLoader(TextureLoader, SKIN_DETAIL.texture);
    useEffect(() => {
      detailMap.colorSpace = THREE.NoColorSpace;
      detailMap.wrapS = detailMap.wrapT = THREE.RepeatWrapping;
      detailMap.minFilter = THREE.LinearMipmapLinearFilter;
      detailMap.magFilter = THREE.LinearFilter;
      detailMap.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      detailMap.needsUpdate = true;
    }, [detailMap, gl]);
    useEffect(() => {
      // A normal map is vector data, not colour: sampling it through sRGB
      // would bend every normal it encodes.
      normalMap.colorSpace = THREE.NoColorSpace;
      normalMap.flipY = false;
      normalMap.needsUpdate = true;
    }, [normalMap]);

    const skinSwatch =
      findById(REGISTRY.skinTones, skinToneId)?.swatch ?? REGISTRY.skinTones[1].swatch;
    const skinTexture = useMemo(() => createSkinTexture(skinSwatch), [skinSwatch]);
    // GPU texture dimensions are fixed after the first upload. Reusing the
    // allocation for differently sized artwork can leave old pixels visible.
    // Each source owns a fresh texture; the cleanup below releases the old one.
    const tattooTexture = useMemo(() => {
      const texture = new THREE.Texture();
      texture.name = resolveTattooSource(uploadedImage);
      return texture;
    }, [uploadedImage]);
    useEffect(() => {
      let cancelled = false;
      loadedImageRef.current = null;
      setInkFootprint(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        loadedImageRef.current = resolveTattooSource(uploadedImage);
        tattooTexture.image = img;
        tattooTexture.colorSpace = THREE.SRGBColorSpace;
        tattooTexture.needsUpdate = true;
        setImageAspect(img.naturalWidth / Math.max(1, img.naturalHeight));
        setInkFootprint(footprintFromImage(img));
      };
      img.onerror = () => { if (!cancelled) onPlacementStatus?.('The design could not be loaded. Please upload it again.'); };
      img.src = resolveTattooSource(uploadedImage);
      return () => { cancelled = true; };
    }, [uploadedImage, tattooTexture, onPlacementStatus]);
    useEffect(() => () => skinTexture.dispose(), [skinTexture]);
    useEffect(() => () => tattooTexture.dispose(), [tattooTexture]);

    const shaderMaterial = useMemo(
      () => new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: {
          skinTexture: { value: null }, normalMap: { value: null }, normalMapStrength: { value: .75 },
          skinDetailMap: { value: null }, skinDetailStrength: { value: SKIN_DETAIL.strength }, skinDetailScale: { value: SKIN_DETAIL.scale },
          sleeveEnabled: { value: 0 }, sleeveShoulderTexture: { value: null }, sleeveChestTexture: { value: null },
          tattooTexture: { value: null }, tattooAspect: { value: 1 },
          tattooColor: { value: new THREE.Color('#ffffff') }, tattooOpacity: { value: 1 },
          tattooScale: { value: TATTOO_BASE_SIZE }, tattooRotation: { value: 0 }, tattooVisible: { value: 0 }, tattooWrap: { value: 0 },
          ...createSkinLightUniforms(resolveStudioLightRig([])),
          uIsolateRegion: { value: -1 }, uHighlightRegion: { value: -1 }, uHighlightRegion2: { value: -1 },
        },
        side: THREE.DoubleSide,
      }), []
    );
    useEffect(() => {
      shaderMaterial.uniforms.sleeveShoulderTexture.value = sleeveShoulderTexture;
      shaderMaterial.uniforms.sleeveChestTexture.value = sleeveChestTexture;
      shaderMaterial.uniforms.skinTexture.value = skinTexture;
      shaderMaterial.uniforms.normalMap.value = normalMap;
      shaderMaterial.uniforms.skinDetailMap.value = detailMap;
      shaderMaterial.uniforms.tattooTexture.value = tattooTexture;
    }, [shaderMaterial, skinTexture, normalMap, tattooTexture, detailMap, sleeveShoulderTexture, sleeveChestTexture]);
    useEffect(() => { shaderMaterial.uniforms.skinDetailStrength.value = performanceMode ? 0 : SKIN_DETAIL.strength; }, [shaderMaterial, performanceMode]);
    useEffect(() => () => shaderMaterial.dispose(), [shaderMaterial]);
    const shadowMaterials = useMemo(() => createBodyShadowMaterials(shaderMaterial.uniforms.uIsolateRegion), [shaderMaterial]);
    useEffect(() => () => { shadowMaterials.depth.dispose(); shadowMaterials.distance.dispose(); }, [shadowMaterials]);
    const lighting = useMemo(() => resolveStudioLightRig(lights, intensityScale), [lights, intensityScale]);
    useEffect(() => { Object.assign(shaderMaterial.uniforms, createSkinLightUniforms(lighting)); }, [shaderMaterial, lighting]);

    useEffect(() => {
      shaderMaterial.uniforms.uIsolateRegion.value =
        isolateRegion === null ? -1 : REGION_INDEX[isolateRegion];
    }, [shaderMaterial, isolateRegion]);

    const highlightA = highlightRegions?.[0] ?? (interactionMode === 'model' && editingEnabled ? hoveredRegion : null);
    const highlightB = highlightRegions?.[1] ?? null;
    useEffect(() => {
      shaderMaterial.uniforms.uHighlightRegion.value =
        highlightA === null ? -1 : REGION_INDEX[highlightA];
      shaderMaterial.uniforms.uHighlightRegion2.value =
        highlightB === null ? -1 : REGION_INDEX[highlightB];
    }, [shaderMaterial, highlightA, highlightB]);

    const requestedSize = TATTOO_BASE_SIZE * THREE.MathUtils.clamp(Number.isFinite(decalScale) ? decalScale : 1, 0.1, 3);
    // Saved designs keep their explicit size; only interactive changes are
    // constrained. Invalid old placements offer an explicit Fit action.
    const size = requestedSize;
    const rotationRad = THREE.MathUtils.degToRad(Number.isFinite(decalRotation) ? decalRotation % 360 : 0);
    const placementInput = useRef({ inkFootprint, size, imageAspect, rotationRad });
    placementInput.current = { inkFootprint, size, imageAspect, rotationRad };
    const sleeve = anchorRef.current?.sleeve;
    const wrap = anchorRef.current?.wrap;
    const periodicTattoo = !!(wrap || sleeve);
    useEffect(() => {
      const wrapping = periodicTattoo ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      if (tattooTexture.wrapS !== wrapping) {
        tattooTexture.wrapS = wrapping;
        // Pending images upload in onload. Section edits need no texture upload.
        if (tattooTexture.image) tattooTexture.needsUpdate = true;
      }
    }, [tattooTexture, periodicTattoo]);
    const assessment = useMemo(() => domainRef.current && inkFootprint
      ? assessPlacement(domainRef.current, inkFootprint, size, imageAspect, rotationRad) : null,
      // chartVersion invalidates the spatial index stored in domainRef.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [inkFootprint, size, imageAspect, rotationRad, chartVersion]);
    const fittedScale = useMemo(() => assessment && !assessment.valid && domainRef.current && inkFootprint
      ? fitPlacement(value => assessPlacement(domainRef.current!, inkFootprint, value * TATTOO_BASE_SIZE, imageAspect, rotationRad), decalScale) : null,
      [assessment, inkFootprint, imageAspect, rotationRad, decalScale]);
    const boundsStatus = useMemo<PlacementBoundsStatus | null>(() => {
      const bounds = anchorRef.current?.bounds;
      if (!hasPlaced || !bounds || anchorRef.current?.wrap || anchorRef.current?.sleeve) return null;
      return { ...(assessment ?? { outside: 0, distorted: 0, valid: false, empty: false }), region: bounds.region,
        locked: !bounds.allowAcrossRegions, ready: !!assessment, canFit: fittedScale !== null, conservative: !!inkFootprint?.conservative, limitMessage: boundsLimitMessage };
    // The selected anchor's region is updated with its chart revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assessment, fittedScale, hasPlaced, inkFootprint, chartVersion, boundsLimitMessage]);
    useEffect(() => { onBoundsStatus?.(boundsStatus); }, [boundsStatus, onBoundsStatus]);
    useEffect(() => {
      if (!assessment) return;
      onPlacementStatus?.(boundsLimitMessage || (!assessment.valid ? 'The design exceeds this area. Use Fit to area, move it, or allow placement across regions.'
        : 'Drag the tattoo to move it. Drag bare skin to orbit.'));
    }, [assessment, onPlacementStatus, boundsLimitMessage]);

    const limitScale = useCallback((value: number) => {
      const next = THREE.MathUtils.clamp(Number.isFinite(value) ? value : decalScale, .1, 3);
      if (!domainRef.current || !hasPlacedRef.current) return next;
      if (!inkFootprint) return decalScale;
      const result = limitPlacement(v => assessPlacement(domainRef.current!, inkFootprint, v * TATTOO_BASE_SIZE, imageAspect, rotationRad), decalScale, next, .05);
      setBoundsLimitMessage(Math.abs(result - next) > .001 ? 'Size limited here. Move to a broader spot, or allow across regions.' : '');
      return result;
    }, [decalScale, inkFootprint, imageAspect, rotationRad]);
    const limitRotation = useCallback((value: number) => {
      if (!Number.isFinite(value)) return decalRotation;
      if (!domainRef.current || !hasPlacedRef.current) return value;
      if (!inkFootprint) return decalRotation;
      const delta = ((value - decalRotation + 540) % 360 + 360) % 360 - 180;
      const result = limitPlacement(v => assessPlacement(domainRef.current!, inkFootprint, size, imageAspect, THREE.MathUtils.degToRad(v)), decalRotation, decalRotation + delta, 5);
      setBoundsLimitMessage(Math.abs(result - decalRotation - delta) > .001 ? 'Rotation limited to keep the design inside this area.' : '');
      return result === decalRotation + delta ? value : result;
    }, [decalRotation, inkFootprint, size, imageAspect]);
    const fitToArea = useCallback(() => { if (fittedScale !== null) { setBoundsLimitMessage(''); onDecalScaleChange?.(fittedScale); } }, [fittedScale, onDecalScaleChange]);

    useFrame(() => {
      shaderMaterial.uniforms.sleeveEnabled.value = anchorRef.current?.sleeve ? 1 : 0;
      shaderMaterial.uniforms.tattooWrap.value = anchorRef.current?.wrap || anchorRef.current?.sleeve ? 1 : 0;
      shaderMaterial.uniforms.tattooScale.value = size;
      shaderMaterial.uniforms.tattooRotation.value = rotationRad;
      shaderMaterial.uniforms.tattooAspect.value = imageAspect;
      shaderMaterial.uniforms.tattooColor.value.set(decalColor);
      shaderMaterial.uniforms.tattooOpacity.value = THREE.MathUtils.clamp(decalOpacity, 0, 1);
      shaderMaterial.uniforms.tattooVisible.value = hasPlacedRef.current && visible && loadedImageRef.current === (resolveTattooSource(uploadedImage)) ? 1 : 0;

    });

    useEffect(() => {
      const group = gltf.scene.clone(true);
      deformablesRef.current = null;
      regionMasksRef.current = null;
      chartRef.current = null;

      // Keep eyes separate from the skin UVs and tattoo anchors.
      const meshes: THREE.Mesh[] = [];
      group.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.isMesh) meshes.push(m);
      });
      const mesh = meshes.reduce<THREE.Mesh | null>(
        (best, m) =>
          !best || m.geometry.getAttribute('position').count > best.geometry.getAttribute('position').count
            ? m
            : best,
        null
      );
      if (!mesh) {
        pickTargetRef.current = null;
        setCloneGroup(null);
        return;
      }
      group.updateMatrixWorld(true);
      const eyes = createPreviewEyes(meshes.filter(m => m !== mesh && /eye/i.test(m.name)), mesh);
      for (const m of meshes) {
        if (m !== mesh) m.removeFromParent();
      }

      // The GLB is in metres; scale to a fixed world height so the camera
      // presets frame this figure the same as any other mesh we might ship.
      group.updateMatrixWorld(true);
      const raw = new THREE.Box3().setFromObject(group);
      const rawHeight = raw.max.y - raw.min.y;
      if (rawHeight > 1e-6) {
        group.scale.multiplyScalar(TARGET_BODY_HEIGHT / rawHeight);
      }
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const center = new THREE.Vector3();
      box.getCenter(center);
      group.position.sub(center);

      // Give each triangle its own corners so overlap rejection can hide ink
      // on one face without cutting the neighbouring face or the body itself.
      // toNonIndexed preserves triangle order, including saved face anchors.
      const source = mesh.geometry as THREE.BufferGeometry;
      const geo = source.index ? source.toNonIndexed() : source.clone();
      ensureUVs(geo);
      group.updateMatrixWorld(true);
      bindSkinRestCoordinates(geo, mesh.matrixWorld);
      for (const name of ['aSleeveShoulder', 'aSleeveChest']) geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 4), 4));
      geo.setAttribute('aTattooUv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      geo.setAttribute('aTattooMask', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
      geo.setAttribute('aTattooBoundary', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1), 1));
      geo.setAttribute('aFocusMask', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1), 1));
      geo.setAttribute('aClothingMask', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(-1), 1));
      referenceGeoRef.current = geo.clone();
      topologyRef.current = createSurfaceTopology(referenceGeoRef.current);
      bodyMeshRef.current = mesh;
      mesh.geometry = geo;
      mesh.material = shaderMaterial;
      mesh.userData.smartInkBody = true;
      mesh.castShadow = true;
      mesh.customDepthMaterial = shadowMaterials.depth;
      mesh.customDistanceMaterial = shadowMaterials.distance;
      const deformable = prepareDeformable(geo);
      const bounds = shapeBounds([deformable]);
      tagRegions(geo, deformable.base, bounds);
      regionMasksRef.current = createRegionMasks(deformable.base, bounds);
      if (isolateRef.current) {
        const focusMask = geo.getAttribute('aFocusMask') as THREE.BufferAttribute;
        (focusMask.array as Float32Array).set(regionMasksRef.current[isolateRef.current]);
      }
      mesh.add(eyes);
      eyesRef.current = eyes;
      eyes.visible = !isolateRef.current || isolateRef.current === 'head';
      const eyeDeformables = eyes.children.map(child => prepareDeformable((child as THREE.Mesh).geometry));
      deformablesRef.current = { items: [deformable, ...eyeDeformables], bounds };
      pickTargetRef.current = group;
      setCloneGroup(group);
      return () => {
        disposeAppearance(eyes);
        if (eyesRef.current === eyes) eyesRef.current = null;
        appearanceGroupsRef.current.forEach(disposeAppearance);
        appearanceGroupsRef.current = [];
        shapedPositionsRef.current = null;
        clothingCoverageRef.current = hairCoverageRef.current = null;
        geo.dispose();
        referenceGeoRef.current?.dispose();
        referenceGeoRef.current = null;
        topologyRef.current = null;
        bodyMeshRef.current = null;
        pickTargetRef.current = null;
      };
    }, [gltf, shaderMaterial, shadowMaterials]);

    // The selected region is a signed skin field, not a numeric region ID.
    // Interpolating IDs manufactured strips of unrelated body parts at seams.
    useEffect(() => {
      if (eyesRef.current) eyesRef.current.visible = !isolateRegion || isolateRegion === 'head';
      const mesh = bodyMeshRef.current, masks = regionMasksRef.current;
      if (!mesh || !masks || !cloneGroup) return;
      const mask = mesh.geometry.getAttribute('aFocusMask') as THREE.BufferAttribute;
      if (isolateRegion) (mask.array as Float32Array).set(masks[isolateRegion]);
      else (mask.array as Float32Array).fill(1);
      mask.needsUpdate = true;
    }, [cloneGroup, isolateRegion]);

    // Reshape whenever the sliders change or the group is rebuilt. Positions
    // are always recomputed from the undeformed snapshot, so sliders never
    // compound, and the UV-placed tattoo rides along with the skin.
    useEffect(() => {
      const prepared = deformablesRef.current;
      const mesh = bodyMeshRef.current;
      if (!cloneGroup || !prepared || !mesh) return;
      applyBodyShape(prepared.items, prepared.bounds, bodyFit ? DEFAULT_BODY_SHAPE : bodyShape);
      if (bodyFit && fitAsset) {
        const fitted = deformFit(fitAsset, bodyFit), position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        if (position.count !== fitAsset.indices.length) throw new Error('The fitted body does not match this model version.');
        for (let i = 0; i < position.count; i++) position.setXYZ(i, fitted[fitAsset.indices[i] * 3], fitted[fitAsset.indices[i] * 3 + 1], fitted[fitAsset.indices[i] * 3 + 2]);
        refreshDeformableGeometry(prepared.items[0]);
        const warp = heightWarp(fitAsset.H, bodyFit.measurements.height, bodyFit.measurements.inseam);
        for (const eye of prepared.items.slice(1)) {
          const p = eye.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < p.count; i++) p.setXYZ(i, eye.base[i * 3] * warp.scale, warp.sample(eye.base[i * 3 + 1]), eye.base[i * 3 + 2] * warp.scale);
          refreshDeformableGeometry(eye);
        }
      }
      shapedPositionsRef.current = new Float32Array(mesh.geometry.getAttribute('position').array);
      applyBodyPose(prepared.items, prepared.bounds, bodyPose);
      recenterGroup(cloneGroup, mesh);
    }, [cloneGroup, bodyShape, bodyPose, bodyFit, fitAsset]);

    // Garments are separate local-space meshes; their size must never change
    // the figure's origin or its saved tattoo anchors. Focus exposes the skin.
    useEffect(() => {
      const mesh = bodyMeshRef.current, prepared = deformablesRef.current;
      if (!cloneGroup || !mesh || !prepared) return;
      appearanceGroupsRef.current.forEach(disposeAppearance);
      const { base } = prepared.items[0], { bounds } = prepared;
      const groups: THREE.Group[] = [];
      const coverage = isolateRegion ? new Float32Array(base.length / 3).fill(-1)
        : createClothingCoverage(base, bounds, bodyAppearance);
      clothingCoverageRef.current = coverage;
      const mask = mesh.geometry.getAttribute('aClothingMask') as THREE.BufferAttribute;
      (mask.array as Float32Array).set(coverage); mask.needsUpdate = true;
      if (!isolateRegion) groups.push(createClothing(mesh.geometry, base, bounds, bodyAppearance, shapedPositionsRef.current ?? undefined));
      const showHair = !isolateRegion || isolateRegion === 'head';
      hairCoverageRef.current = showHair ? createHairCoverage(base, bounds, bodyAppearance) : null;
      if (showHair) groups.push(createPreviewHair(mesh.geometry, base, bounds, bodyAppearance));
      groups.forEach((group) => mesh.add(group));
      appearanceGroupsRef.current = groups;
      cloneGroup.updateMatrixWorld(true);
    }, [cloneGroup, bodyShape, bodyPose, bodyAppearance, bodyFit, isolateRegion]);

    /** World-space bounds of one region of the reshaped figure. */
    const regionFraming = useCallback(
      (region: BodyRegionId | null): RegionFraming | null => {
        const group = cloneGroup;
        const mesh = bodyMeshRef.current;
        if (!group || !mesh) return null;
        group.updateMatrixWorld(true);
        const mask = region ? regionMasksRef.current?.[region] : undefined;
        const chunks = [visibleRegionPoints(mesh.geometry, mesh.matrixWorld, mask)];
        if (!region || region === 'head') for (const accessory of appearanceGroupsRef.current) {
          if (region && accessory.userData.previewAppearance !== 'hair') continue;
          accessory.traverse((child) => {
            const part = child as THREE.Mesh;
            if (part.isMesh) chunks.push(visibleRegionPoints(part.geometry, part.matrixWorld));
          });
        }
        const points = new Float32Array(chunks.reduce((count, chunk) => count + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) { points.set(chunk, offset); offset += chunk.length; }
        return framingFromPoints(points);
      },
      [cloneGroup]
    );



    // Frame the camera when the isolated region changes, but not while the
    // sliders move it: reframing on every tick would fight the user.
    const lastFramedRef = useRef<BodyRegionId | null>(isolateRegion);
    useEffect(() => {
      if (!cloneGroup || !onFrameRegion) return;
      if (lastFramedRef.current === isolateRegion) return;
      lastFramedRef.current = isolateRegion;
      onFrameRegion(regionFraming(isolateRegion));
    }, [cloneGroup, isolateRegion, regionFraming, onFrameRegion]);

    const applyAnchor = useCallback((anchor: SurfaceAnchor, notify = true, changingBoundary = false): boolean => {
      const { inkFootprint, size, imageAspect, rotationRad } = placementInput.current;
      const mesh = bodyMeshRef.current;
      const reference = referenceGeoRef.current;
      const topology = topologyRef.current;
      if (!mesh || !reference || !topology || anchor.bodyMeshId !== bodyDef.id) return false;
      mesh.updateWorldMatrix(true, false);
      const masks = regionMasksRef.current;
      if (!masks) return false;
      if (anchor.sleeve) {
        const composition = buildSleeveComposition(reference, topology, masks, mesh.matrixWorld, bodyDef.id, anchor.sleeve);
        if (!composition) { onPlacementStatus?.('This sleeve could not fit the selected body. Return to regular placement to continue.'); return false; }
        mesh.userData.sleeveComposition = composition;
        chartRef.current = attachSleeveToGeometry(mesh.geometry, composition);
        domainRef.current = null;
        anchorRef.current = composition.anchor;
        hasPlacedRef.current = true; setHasPlaced(true); setBoundsLimitMessage(''); setChartVersion(v => v + 1);
        onPlacementStatus?.('Sleeve test: select a section to adjust it. Drag bare skin to orbit.');
        if (notify) { setDecalVisible(true); onPlacementChange?.(composition.anchor); }
        return true;
      }
      mesh.userData.sleeveComposition = null;
      const wrapped = anchor.wrap ? buildWrapChart(reference, masks, anchor.wrap) : null;
      const chart = anchor.wrap ? wrapped?.chart : buildSurfaceChart(topology, reference, mesh.matrixWorld, anchor);
      if (!chart || chart.maxSize < 0.045) {
        onPlacementStatus?.(anchor.wrap ? 'This band would reach the shoulder or elbow. Try a narrower band or move it toward the middle of the upper arm.' : 'This area is too folded for a clean placement. Try a flatter spot nearby.');
        return false;
      }
      // Dragging retains the original area. An explicit click may target a new
      // area; restored scenes retain the area/override saved with their anchor.
      const bounds = anchor.bounds ?? (notify && isDragging.current ? anchorRef.current?.bounds : undefined)
        ?? { region: isolateRef.current ?? areaAtAnchor(masks, anchor, mesh.geometry), allowAcrossRegions: anchorRef.current?.bounds?.allowAcrossRegions ?? false };
      const boundary = bounds.allowAcrossRegions ? undefined : masks[bounds.region];
      const domain = anchor.wrap ? null : createPlacementDomain(reference, mesh.matrixWorld, chart, boundary);
      if (domain && notify && !changingBoundary && hasPlacedRef.current && inkFootprint) {
        const next = assessPlacement(domain, inkFootprint, size, imageAspect, rotationRad);
        const before = domainRef.current ? assessPlacement(domainRef.current, inkFootprint, size, imageAspect, rotationRad) : null;
        if (!next.valid && (before?.valid || !before || next.outside + next.distorted >= before.outside + before.distorted)) {
          onPlacementStatus?.('This placement would lose or stretch part of the design. Reduce its size or use Fit to area first.');
          setBoundsLimitMessage('Move limited here. Reduce the size or move to a broader spot.');
          return false;
        }
      }
      mesh.geometry.setAttribute('aTattooBoundary', new THREE.BufferAttribute(boundary?.slice() ?? new Float32Array(chart.mask.length).fill(1), 1));
      domainRef.current = domain;
      setBoundsLimitMessage('');
      const placed = wrapped ? { ...anchor, ...wrapped.anchor } : { ...anchor, bounds };
      mesh.geometry.setAttribute('aTattooUv', new THREE.BufferAttribute(chart.uv, 2));
      const mask = chart.mask.slice();
      for (let face = 0; face < chart.faceMask.length; face++) {
        if (chart.faceMask[face] < 0.5) mask.fill(0, face * 3, face * 3 + 3);
      }
      mesh.geometry.setAttribute('aTattooMask', new THREE.BufferAttribute(mask, 1));
      chartRef.current = chart;
      anchorRef.current = placed;
      hasPlacedRef.current = true;
      setHasPlaced(true);
      setChartVersion((v) => v + 1);
      if (placed.wrap) onPlacementStatus?.('360° band: use Position and Band height to adjust it. Drag bare skin to orbit.');
      if (notify) {
        setDecalVisible(true);
        onPlacementChange?.(placed);
      }
      return true;
    }, [bodyDef.id, onPlacementStatus, onPlacementChange, setDecalVisible]);

    const setWrap = useCallback((value: WrapSettings | null): boolean => {
      const current = anchorRef.current;
      if (!value && !current) return false;
      const anchor: SurfaceAnchor = { ...(current ?? { bodyMeshId: bodyDef.id, faceIndex: 0, barycentric: [1, 0, 0] as [number, number, number] }), sleeve: undefined, wrap: value ?? undefined };
      if (value) anchor.bounds = { region: value.region, allowAcrossRegions: false };
      const success = applyAnchor(anchor, true, true);
      if (success && value) onPlacementStatus?.('360° band: use Position and Band height to adjust it. Drag bare skin to orbit.');
      return success;
    }, [applyAnchor, bodyDef.id, onPlacementStatus]);

    const setSleeve = useCallback((value: SleeveSettings | null): boolean => {
      const current = anchorRef.current;
      if (!value && !current) return false;
      return applyAnchor({ ...(current ?? { bodyMeshId: bodyDef.id, faceIndex: 0, barycentric: [1, 0, 0] as [number, number, number] }), wrap: undefined, sleeve: value ?? undefined }, true, true);
    }, [applyAnchor, bodyDef.id]);
    const getSleeveFraming = useCallback((section?: SleeveSectionId): TattooFraming | null => {
      const mesh = bodyMeshRef.current, composition = mesh?.userData.sleeveComposition as SleeveComposition | undefined;
      if (!anchorRef.current?.sleeve || !mesh || !composition) return null;
      mesh.updateWorldMatrix(true, false);
      return sleeveFraming(mesh.geometry, mesh.matrixWorld, composition, section);
    }, []);

    const setAreaLock = useCallback((locked: boolean) => {
      const anchor = anchorRef.current;
      if (anchor?.bounds) applyAnchor({ ...anchor, bounds: { ...anchor.bounds, allowAcrossRegions: !locked } }, true, true);
    }, [applyAnchor]);

    useEffect(() => {
      if (!cloneGroup) return;
      // The parent owns saved placement, including Undo back to an empty body.
      // Normal pointer feedback already applied this exact anchor; avoid baking
      // the chart twice per drag sample when the parent echoes it back.
      const desired = initialPlacement ?? null;
      if (desired === anchorRef.current && chartRef.current) return;
      if (desired && applyAnchor(desired, false)) return;
      anchorRef.current = null;
      chartRef.current = null;
      domainRef.current = null;
      hasPlacedRef.current = false;
      setHasPlaced(false);
      const mask = bodyMeshRef.current?.geometry.getAttribute('aTattooMask') as THREE.BufferAttribute | undefined;
      if (mask) { (mask.array as Float32Array).fill(0); mask.needsUpdate = true; }
      shaderMaterial.uniforms.tattooVisible.value = 0;
      setChartVersion((version) => version + 1);
      if (desired) onPlacementStatus?.('Click a flatter area of the skin to restore this placement.');
    }, [initialPlacement, cloneGroup, applyAnchor, onPlacementStatus, shaderMaterial]);

    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());

    /** Pick the same face that the isolation shader actually displays. */
    const pick = useCallback((event: Pick<PointerEvent, 'clientX' | 'clientY'>, selectCovered = false) => {
      pickBlockedRef.current = false;
      const rect = gl.domElement.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
      mouse.current.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.current.setFromCamera(mouse.current, camera);
      const helperDistance = nearestEditorHelperDistance(raycaster.current, scene);
      const target = pickTargetRef.current;
      if (!target) return null;
      for (const hit of raycaster.current.intersectObject(target, true)) {
        const appearance = appearanceHit(hit.object);
        if (appearance === 'hidden') continue;
        if (appearance) {
          if (selectCovered) continue;
          if (helperDistance < hit.distance) return null;
          pickBlockedRef.current = true; return null;
        }
        const mesh = hit.object as THREE.Mesh;
        if (mesh !== bodyMeshRef.current) continue;
        if (!hit.face || hit.faceIndex == null) continue;
        const p = mesh.worldToLocal(hit.point.clone());
        const pos = mesh.geometry.getAttribute('position');
        const indices = [hit.face.a, hit.face.b, hit.face.c];
        const vertices = indices.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i));
        const bary = THREE.Triangle.getBarycoord(p, vertices[0], vertices[1], vertices[2], new THREE.Vector3());
        if (!bary) continue;
        const reg = mesh.geometry.getAttribute('aRegion');
        const isolated = isolateRef.current;
        if (isolated) {
          const field = regionMasksRef.current?.[isolated];
          if (!field || field[indices[0]] * bary.x + field[indices[1]] * bary.y + field[indices[2]] * bary.z < 0) continue;
        }
        if (helperDistance < hit.distance) return null;
        const clothing = clothingCoverageRef.current, hair = hairCoverageRef.current;
        if (!selectCovered && ((clothing && clothingCoversTriangle(clothing, hit.faceIndex, bary)) ||
          (hair && hair[indices[0]] * bary.x + hair[indices[1]] * bary.y + hair[indices[2]] * bary.z >= .5))) {
          pickBlockedRef.current = true; return null;
        }
        const r = reg ? regionAtTriangle(indices.map((i) => reg.getX(i)), bary) : 0;
        const region = isolated ?? REGION_BY_INDEX[r] ?? null;
        return { region, anchor: { bodyMeshId: bodyDef.id, faceIndex: hit.faceIndex,
          barycentric: [bary.x, bary.y, bary.z] as [number, number, number] } };
      }
      return null;
    }, [camera, gl, scene, bodyDef.id]);

    const placeInView = useCallback((): boolean => {
      // Replacing artwork preserves an existing placement. For a fresh body,
      // use the same visible-skin picker as clicks, including clothing and Focus.
      if (hasPlacedRef.current && chartRef.current) return true;
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height || !editingEnabled) return false;
      camera.updateMatrixWorld(true);
      pickTargetRef.current?.updateWorldMatrix(true, true);
      const positions = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
      for (const y of [0.4, 0.5, 0.3, 0.6, 0.2, 0.7, 0.8]) {
        for (const x of positions) {
          const hit = pick({ clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y });
          if (hit && applyAnchor(hit.anchor)) {
            onPlacementStatus?.('Drag the tattoo to move it. Drag bare skin to orbit.');
            return true;
          }
        }
      }
      onPlacementStatus?.('Bring an uncovered area of skin into view, then click it to place your design.');
      return false;
    }, [gl, camera, editingEnabled, pick, applyAnchor, onPlacementStatus]);

    // Explicit Shoot controls may edit while canvas dragging stays locked.
    const nudgeInView = useCallback((dx: number, dy: number): boolean => {
      const mesh = bodyMeshRef.current, anchor = anchorRef.current;
      if (!mesh || !anchor || anchor.wrap || anchor.sleeve || !visible ||
          !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 8 || Math.abs(dy) > 8) return false;
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      camera.updateMatrixWorld(true); mesh.updateWorldMatrix(true, false);
      const point = tattooAnchorPoint(mesh, anchor, new THREE.Vector3()).project(camera);
      if (point.z < -1 || point.z > 1) return false;
      const hit = pick({ clientX: rect.left + (point.x + 1) * rect.width / 2 + dx,
        clientY: rect.top + (1 - point.y) * rect.height / 2 + dy });
      return !!hit && applyAnchor({ ...hit.anchor, bounds: anchor.bounds });
    }, [gl, camera, visible, pick, applyAnchor]);

    useImperativeHandle(ref, () => ({
      placeInView, nudgeInView, setWrap, setSleeve, getSleeveFraming,
      limitScale, limitRotation, setAreaLock, fitToArea,
      getPlacement: () => ({
        imageSource: resolveTattooSource(uploadedImage),
        imageReady: loadedImageRef.current === resolveTattooSource(uploadedImage),
        center: [0, 0], scaleUV: 0, rotationRad, hasPlaced: hasPlacedRef.current && loadedImageRef.current === (resolveTattooSource(uploadedImage)),
        visible: hasPlacedRef.current && visible && loadedImageRef.current === (resolveTattooSource(uploadedImage)),
        bounds: assessment ?? undefined,
        surface: bodyMeshRef.current && chartRef.current ? {
          geometry: bodyMeshRef.current.geometry, size, aspect: imageAspect, wrap: !!(anchorRef.current?.wrap || anchorRef.current?.sleeve), sleeve: !!anchorRef.current?.sleeve,
          color: decalColor, opacity: decalOpacity,
        } : undefined,
      }),
      getRegionFraming: () => regionFraming(isolateRegion),
      getMeasurementGuide: (key) => bodyMeshRef.current ? measurementGuide(bodyMeshRef.current, key) : null,
      getTattooFraming: (join = false) => {
        const mesh = bodyMeshRef.current, anchor = anchorRef.current;
        if (!mesh || !anchor || !hasPlacedRef.current || loadedImageRef.current !== resolveTattooSource(uploadedImage)) return null;
        mesh.updateWorldMatrix(true, false);
        if (anchor.sleeve) return getSleeveFraming();
        let framingAnchor = anchor;
        if (join && anchor.wrap) {
          const uv = mesh.geometry.getAttribute('aTattooUv'), mask = mesh.geometry.getAttribute('aTattooMask');
          let best = Infinity;
          for (let i = 0; i < uv.count; i += 3) {
            if (mask.getX(i) < .5) continue;
            const u = ((uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3 % 1 + 1) % 1;
            const v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
            const score = Math.min(u, 1 - u) + Math.abs(v);
            if (score < best) { best = score; framingAnchor = { ...anchor, faceIndex: i / 3, barycentric: [1 / 3, 1 / 3, 1 / 3] }; }
          }
        }
        return tattooFramingFromGeometry(mesh.geometry, mesh.matrixWorld, framingAnchor, {
          size, aspect: imageAspect, rotationRad, wrap: !!anchor.wrap, hairCoverage: hairCoverageRef.current,
        });
      },
    }), [placeInView, nudgeInView, setWrap, setSleeve, getSleeveFraming, size, imageAspect, decalColor, decalOpacity, rotationRad, uploadedImage, visible, regionFraming, isolateRegion, assessment, limitScale, limitRotation, setAreaLock, fitToArea]);

    const setOrbitEnabled = useCallback(
      (enabled: boolean) => {
        const controls = (scene as THREE.Scene & { orbitControls?: { enabled: boolean } })
          .orbitControls;
        if (controls) controls.enabled = enabled && scene.userData.orbitInputEnabled !== false;
      },
      [scene]
    );

    const onPointerDown = useCallback((e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        const gesture = touchGesture.current;
        gesture.pointers.add(e.pointerId);
        if (gesture.pointers.size > 1 || gesture.blocked) {
          gesture.blocked = true;
          pointerStart.current = null;
          isDragging.current = false;
          pendingMove.current = null;
          if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
          dragFrame.current = null;
          setOrbitEnabled(true);
          return;
        }
      }
      if ((anchorRef.current?.wrap || anchorRef.current?.sleeve) && interactionMode === 'tattoo') return;
      if (!editingEnabled) return;
      if (e.button === 2 && interactionMode === 'tattoo') {
        const hit = pick(e);
        if (hit?.region && onRegionPress) {
          e.preventDefault();
          setOrbitEnabled(false);
          onRegionPress(hit.region, e.clientX, e.clientY, e.pointerId);
        }
        return;
      }
      if (e.button !== 0 || !e.isPrimary) return;
      pointerStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      grabOffset.current = { x: 0, y: 0 };
      if (interactionMode === 'model') return;
      const hit = pick(e), mesh = bodyMeshRef.current;
      const onInk = hit && mesh && hasPlacedRef.current && visible
        && isTattooHit(mesh.geometry, hit.anchor, size, imageAspect, rotationRad);
      // Fingers always navigate; Pencil and mouse retain precise ink dragging.
      if ((e.pointerType !== 'touch' || fingerPlacement) && (e.metaKey || e.ctrlKey || onInk)) {
        if (!hit) {
          if (pickBlockedRef.current) onPlacementStatus?.('This area is covered. Use Focus or remove the clothing or hair to place a tattoo.');
          return;
        }
        isDragging.current = true;
        setOrbitEnabled(false);
        gl.domElement.setPointerCapture(e.pointerId);
        if (onInk && mesh && anchorRef.current && !e.metaKey && !e.ctrlKey) {
          // Preserve the grab point instead of snapping the tattoo centre to it.
          const point = tattooAnchorPoint(mesh, anchorRef.current, new THREE.Vector3()).project(camera);
          const rect = gl.domElement.getBoundingClientRect();
          grabOffset.current = { x: rect.left + (point.x + 1) * rect.width / 2 - e.clientX, y: rect.top + (1 - point.y) * rect.height / 2 - e.clientY };
        } else applyAnchor(hit.anchor);
      }
    }, [pick, onRegionPress, setOrbitEnabled, applyAnchor, gl, editingEnabled, interactionMode, onPlacementStatus, size, imageAspect, rotationRad, visible, camera, fingerPlacement]);

    const onPointerMove = useCallback((e: PointerEvent) => {
      if (!editingEnabled) return;
      const start = pointerStart.current;
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) start.moved = true;
      if (isDragging.current && start?.id === e.pointerId) {
        pendingMove.current = e;
        if (dragFrame.current === null) dragFrame.current = requestAnimationFrame(() => {
          dragFrame.current = null;
          const event = pendingMove.current;
          if (event && isDragging.current) {
            const hit = pick({ clientX: event.clientX + grabOffset.current.x, clientY: event.clientY + grabOffset.current.y });
            if (hit) applyAnchor(hit.anchor);
          }
        });
        return;
      }
      if (e.buttons !== 0) return;
      const region = interactionMode === 'model' && e.target === gl.domElement ? pick(e, true)?.region ?? null : null;
      gl.domElement.style.cursor = region ? 'pointer' : '';
      if (region !== hoverRef.current) { hoverRef.current = region; setHoveredRegion(region); onHoverRegion?.(region); }
    }, [pick, applyAnchor, gl, onHoverRegion, editingEnabled, interactionMode]);

    const finishPointer = useCallback((e?: PointerEvent) => {
      const gesture = touchGesture.current;
      if (e) gesture.pointers.delete(e.pointerId);
      else gesture.pointers.clear();
      const blocked = gesture.blocked;
      if (gesture.pointers.size === 0) gesture.blocked = false;
      const start = pointerStart.current;
      if (e && start && e.pointerId !== start.id) return;
      if (!blocked && editingEnabled && e?.type === 'pointerup' && e.button === 0 && start) {
        if (interactionMode === 'model') {
          if (!start.moved) {
            const hit = pick(e, true);
            if (hit?.region) {
              onRegionPress?.(hit.region, e.clientX, e.clientY, e.pointerId);
              onFrameRegion?.(regionFraming(hit.region));
            }
          }
        } else if (isDragging.current ? start.moved : !start.moved) {
          const hit = pick({ clientX: e.clientX + grabOffset.current.x, clientY: e.clientY + grabOffset.current.y });
          if (hit) applyAnchor(hit.anchor);
          else if (pickBlockedRef.current) onPlacementStatus?.('This area is covered. Use Focus or remove the clothing or hair to place a tattoo.');
        }
      }
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
      pendingMove.current = null;
      if (start && gl.domElement.hasPointerCapture(start.id)) gl.domElement.releasePointerCapture(start.id);
      pointerStart.current = null;
      isDragging.current = false;
      setOrbitEnabled(true);
    }, [pick, applyAnchor, gl, setOrbitEnabled, editingEnabled, onPlacementStatus, interactionMode, onRegionPress, onFrameRegion, regionFraming]);

    useEffect(() => {
      if (editingEnabled) return;
      finishPointer();
      hoverRef.current = null;
      setHoveredRegion(null);
      gl.domElement.style.cursor = '';
      onHoverRegion?.(null);
    }, [editingEnabled, finishPointer, onHoverRegion, gl]);

    useEffect(() => {
      const el = gl.domElement;
      const blockContextMenu = (e: MouseEvent) => e.preventDefault();
      const blur = () => finishPointer();
      // Capture runs before OrbitControls starts handling a modifier drag.
      el.addEventListener('pointerdown', onPointerDown, true);
      el.addEventListener('contextmenu', blockContextMenu);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', finishPointer);
      window.addEventListener('pointercancel', finishPointer);
      window.addEventListener('blur', blur);
      return () => {
        el.removeEventListener('pointerdown', onPointerDown, true);
        el.removeEventListener('contextmenu', blockContextMenu);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', finishPointer);
        window.removeEventListener('pointercancel', finishPointer);
        window.removeEventListener('blur', blur);
        if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      };
    }, [onPointerDown, onPointerMove, finishPointer, gl]);

    useEffect(() => {
      const mesh = bodyMeshRef.current;
      if (!closeupPreview || !mesh || !cloneGroup) return;
      const geometry = closeupGeometry(mesh.geometry);
      const visual = new THREE.Mesh(geometry, shaderMaterial);
      // Picking and baking continue to use original face indices. The visual
      // shell is deliberately excluded from all placement raycasts.
      visual.raycast = () => {};
      visual.castShadow = true;
      visual.customDepthMaterial = shadowMaterials.depth;
      visual.customDistanceMaterial = shadowMaterials.distance;
      const originalMaterial = mesh.material;
      const pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false });
      mesh.material = pickMaterial;
      mesh.add(visual);
      return () => {
        mesh.remove(visual); geometry.dispose(); pickMaterial.dispose();
        mesh.material = originalMaterial;
      };
    }, [closeupPreview, cloneGroup, chartVersion, bodyShape, bodyPose, bodyFit, bodyAppearance, isolateRegion, shaderMaterial, shadowMaterials]);

    if (!cloneGroup) return null;
    return <>
      <primitive object={cloneGroup} />
      {feedback && <FeedbackScene {...feedback} mesh={bodyMeshRef} bodyMeshId={bodyDef.id} pick={pick} />}
      {showTattooControls && editingEnabled && interactionMode === 'tattoo' && hasPlaced && visible && onDecalScaleChange && onDecalRotationChange && <TattooViewportControls
        onHide={onHideTattooControls}
        mesh={bodyMeshRef} anchor={anchorRef} scale={decalScale} rotation={decalRotation}
        onScale={value => onDecalScaleChange(limitScale(value))} onRotation={value => onDecalRotationChange(limitRotation(value))}
        customTitle={sleeve ? 'Sleeve composition' : undefined}
        wrapControls={sleeve ? <SleeveTattooControls compact value={sleeve} onStart={() => setSleeve(DEFAULT_SLEEVE)} onChange={setSleeve} onExit={() => setSleeve(null)} onView={onSleeveView} /> : wrap ? <WrapTattooControls compact value={wrap} onSample={() => setWrap(DEFAULT_WRAP)} onChange={value => { if (setWrap(value) && value.region !== wrap.region) onWrapRegion?.(value.region); }} onExit={() => setWrap(null)} onView={onWrapView} /> : undefined}
        boundsControls={<TattooBoundsControls status={boundsStatus} onLock={setAreaLock} onFit={fitToArea} />}
      />}
    </>;
  }
);

export default ModelWithUVTattoo;
