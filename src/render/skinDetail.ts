import * as THREE from 'three';
import profile from '../../smartink-live/skinProfile.json';

/** Baked from our Soft cells material. 16 mm tile, 30 µm encoded height range.
 * This is an artistic preview, not a measured scan or the Blender material. */
export const SKIN_DETAIL = { texture: '/textures/soft-cells-height.png', strength: .9, scale: 1, tileMetres: profile.tileMetres, heightMetres: profile.heightMetres, worldUnitsPerMetre: 4.2 / 1.75 } as const;

/** Shared units/seed/region controls are also shipped with Blender. */
export const SKIN_PROFILE = profile;
const glslNumber = (n: number) => Number.isInteger(n) ? `${n}.0` : String(n);
const regionVector = (name: keyof typeof profile.regions) => {
  const r = profile.regions[name];
  return `vec4(${[r.hairDensity, r.hairLengthMetres, r.relief, r.pigment].map(glslNumber).join(',')})`;
};
export const SKIN_REGION_GLSL = `
  vec4 skinRegion(float region, vec3 rest) {
    float h = rest.y / 1.75 + .5;
    vec4 result = ${regionVector('torso')};
    result.x *= smoothstep(${profile.exclusions.torsoHeightFade.join(',')}, h);
    if (region > .5 && region < 1.5) result = ${regionVector('head')};
    if (region > 1.5 && region < 3.5) {
      result = ${regionVector('arm')};
      result.x *= smoothstep(${profile.exclusions.armHeightFade.join(',')}, h);
    }
    if (region > 3.5) {
      result = ${regionVector('leg')};
      result.x *= smoothstep(${profile.exclusions.legHeightFade.join(',')}, h);
    }
    return result;
  }
`;

/** Bind once before proportions or pose are applied, preserving skin anchors. */
export function bindSkinRestCoordinates(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4, metresPerUnit = 1.75 / 4.2): void {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const rest = new Float32Array(position.count * 3), normals = new Float32Array(rest.length);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld), point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(matrixWorld).multiplyScalar(metresPerUnit).toArray(rest, i * 3);
    point.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix).toArray(normals, i * 3);
  }
  geometry.setAttribute('aSkinRest', new THREE.BufferAttribute(rest, 3));
  geometry.setAttribute('aSkinNormal', new THREE.BufferAttribute(normals, 3));
}

export const SKIN_DETAIL_GLSL = `
  uniform sampler2D skinDetailMap;
  uniform float skinDetailStrength;
  uniform float skinDetailScale;
  varying vec3 vSkinRest;
  varying vec3 vSkinNormal;
  varying float vSkinArm;
  varying vec4 vSkinProfile;
  // Reference-guided variation in resting skin coordinates (metres).
  // This is synthetic appearance, not a reproduction of someone's skin marks.
  float skinHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float skinNoise(vec3 p) {
    vec3 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(skinHash(cell), skinHash(cell+vec3(1,0,0)), f.x),
      mix(skinHash(cell+vec3(0,1,0)),skinHash(cell+vec3(1,1,0)),f.x),f.y),
      mix(mix(skinHash(cell+vec3(0,0,1)),skinHash(cell+vec3(1,0,1)),f.x),
      mix(skinHash(cell+vec3(0,1,1)),skinHash(cell+vec3(1,1,1)),f.x),f.y),f.z);
  }
  // Surface-bound fine hairs: jittered roots, curved/tapered lengths, and
  // neighbouring cells so a strand is never clipped at a lattice boundary.
  float skinStrand(vec2 p, vec2 a, vec2 b, float radius, float pixel) {
    vec2 ab = b-a;
    float t = clamp(dot(p-a,ab)/max(dot(ab,ab),1e-10),0.0,1.0);
    float d = length(p-a-ab*t);
    return (1.0-smoothstep(max(0.0,radius-pixel*.5),radius+pixel*.5,d))
      * min(1.0,2.0*radius/pixel);
  }
  vec2 skinMarks(vec2 metres, float projectionSeed) {
    float spacing = ${profile.hairCellMetres};
    vec2 p = metres/spacing, base = floor(p);
    float pixel = max(length(fwidth(p)),.0001);
    float hairs = 0.0;
    for (int iy=-1; iy<=1; iy++) for (int ix=-1; ix<=1; ix++) {
      vec2 cell = base+vec2(float(ix),float(iy));
      float seed = skinHash(vec3(cell,projectionSeed+${glslNumber(profile.seed)}));
      vec2 root = cell+vec2(skinHash(vec3(cell,12.0+projectionSeed)),skinHash(vec3(cell,22.0+projectionSeed)));
      float enabled = step(seed,vSkinProfile.x) * step(.0001,vSkinProfile.x);
      float angle = -1.57 + (skinHash(vec3(cell,31.0+projectionSeed))-.5)*1.2;
      // Vary growth gently over the body as well as independently per strand.
      angle += .65*sin(metres.y*24.0+metres.x*14.0);
      vec2 direction = vec2(cos(angle),sin(angle));
      float len = vSkinProfile.y/spacing * (.25+.75*skinHash(vec3(cell,48.0+projectionSeed)));
      float curl = (skinHash(vec3(cell,57.0+projectionSeed))-.5)*len*.65;
      vec2 middle = root+direction*len*.5+vec2(-direction.y,direction.x)*curl;
      vec2 tip = root+direction*len;
      float radius = ${profile.hairRadiusMetres}/spacing;
      float strand = 0.0;
      vec2 previous = root;
      for (int segment=1; segment<=4; segment++) {
        float t = float(segment)*.25;
        vec2 next = (1.0-t)*(1.0-t)*root + 2.0*(1.0-t)*t*middle + t*t*tip;
        strand = max(strand,skinStrand(p,previous,next,radius*(1.0-.8*t),pixel));
        previous = next;
      }
      hairs = max(hairs,strand*enabled);
    }
    return vec2(0.0,hairs);
  }
  vec3 skinAppearance() {
    if (skinDetailStrength <= 0.0) return vec3(0.0);
    vec2 mx = skinMarks(vSkinRest.yz,0.0), my = skinMarks(vSkinRest.xz,101.0), mz = skinMarks(vSkinRest.xy,207.0);
    vec2 marks;
    // Reject grazing projections for fibers; otherwise tiny secondary weights
    // expose stretched, crosshatched hairs on the front-facing surface.
    vec3 hairWeights = smoothstep(vec3(.45),vec3(.8),abs(normalize(vSkinNormal)));
    hairWeights /= max(dot(hairWeights,vec3(1.0)),.00001);
    marks = mx*hairWeights.x + my*hairWeights.y + mz*hairWeights.z;
    // Volumetric pigment avoids stretched projected spots on curved limbs.
    marks.x = smoothstep(${profile.pigment.spotThreshold.join(",")},skinNoise(vSkinRest/${profile.pigment.spotSpacingMetres}+vec3(17.0))) * ${profile.pigment.spotContrast} * vSkinProfile.w;
    marks.x += smoothstep(.72,.96,skinNoise(vSkinRest/${profile.pigment.follicleSpacingMetres}+vec3(29.0))) * ${profile.pigment.follicleContrast} * vSkinProfile.x;
    float pigment = (skinNoise(vSkinRest/.007)-.5)*.11 + (skinNoise(vSkinRest/.025)-.5)*.07;
    return vec3(marks,pigment*vSkinProfile.w);
  }

  float skinVeins() {
    if (skinDetailStrength <= 0.0) return 0.0;
    vec3 p = vSkinRest;
    // Gentle longitudinal paths with a tapered tributary. Sparse exposure keeps
    // them beneath the surface rather than drawing a vein diagram on the skin.
    float along = p.y - abs(p.x) * .45;
    float across = abs(p.x) + p.y * .55;
    float bend = sin(along * 23.0) * .005 + sin(along * 51.0 + p.z * 8.0) * .002;
    float phase = (across + bend + p.z * .25) / .075;
    float mainDistance = abs(fract(phase + .5) - .5) * .075;
    float branchOffset = smoothstep(-.1,.1,sin(along*15.0)) * .012;
    float branchDistance = abs(fract(phase + branchOffset/.075 + .5)-.5)*.075;
    float pixel = max(length(fwidth(p)),.0001);
    float main = 1.0-smoothstep(.0005,.0028+pixel,mainDistance);
    float branch = (1.0-smoothstep(.0003,.0018+pixel,branchDistance))
      * smoothstep(.004,.01,branchOffset) * .45;
    float exposure = smoothstep(.38,.7,skinNoise(p/.055+vec3(9.0)));
    return max(main,branch) * exposure;
  }
  float skinHeight() {
    vec3 p = vSkinRest / (${SKIN_DETAIL.tileMetres} * skinDetailScale);
    vec3 w = pow(abs(normalize(vSkinNormal)), vec3(6.0));
    w /= max(w.x + w.y + w.z, .00001);
    float broad = texture2D(skinDetailMap, p.yz).r * w.x
      + texture2D(skinDetailMap, p.xz).r * w.y
      + texture2D(skinDetailMap, p.xy).r * w.z;
    // Keep the authored 0.29 mm cell pattern at its original size. The texture's
    // mip chain filters unresolved grooves as they recede; no zoom magnification
    // or extra fade that erases visible skin at normal tattoo-view distances.
    return broad;
  }
  vec3 skinDetailNormal(vec3 N, float height) {
    if (skinDetailStrength <= 0.0) return N;
    float h = height * ${SKIN_DETAIL.heightMetres} * ${SKIN_DETAIL.worldUnitsPerMetre} * skinDetailStrength * vSkinProfile.z;
    vec3 dx = dFdx(vWorldPosition), dy = dFdy(vWorldPosition);
    vec3 r1 = cross(dy, N), r2 = cross(N, dx);
    float determinant = dot(dx, r1);
    if (abs(determinant) < 1e-20) return N;
    vec3 gradient = sign(determinant) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(determinant) * N - gradient);
  }

  // A restrained dielectric sheen from the same finite softboxes as diffuse.
  // Shared under the tattoo: ink is not a separate glossy sticker.
  vec3 skinSpecular(vec3 N, float roughness) {
    vec3 V = normalize(cameraPosition - vWorldPosition), result = vec3(0.0);
    float exponent = mix(44.0, 18.0, roughness);
    for (int i = 0; i < MAX_SCENE_LIGHTS; i++) {
      if (i >= uNumLights) break;
      vec3 L; float attenuation = 1.0;
      if (uLightType[i] > .5) {
        vec3 delta = uLightPos[i] - vWorldPosition;
        float distanceSquared = dot(delta, delta);
        L = delta / max(sqrt(distanceSquared), .0001);
        attenuation = uLightDistanceScale[i] / max(distanceSquared, .01);
        if (uLightType[i] > 1.5) {
          vec3 axis = normalize(uLightTarget[i] - uLightPos[i]);
          float cosine = dot(-L, axis);
          attenuation *= uLightInnerCone[i] - uLightCone[i] < .000001
            ? step(uLightCone[i], cosine)
            : smoothstep(uLightCone[i], uLightInnerCone[i], cosine);
        }
      } else L = normalize(uLightPos[i] - uLightTarget[i]);
      vec3 H = normalize(L + V);
      float fresnel = .035 + .12 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
      float reflection = fresnel * ((exponent + 2.0) / 8.0)
        * pow(max(dot(N, H), 0.0), exponent) * max(dot(N, L), 0.0);
      result += uLightColor[i] * uLightIntensity[i] * attenuation * reflection;
    }
    return result;
  }
`;
