import * as THREE from 'three';

/** Baked from our Soft cells material. 16 mm tile, 30 µm encoded height range.
 * This is an artistic preview, not a measured scan or the Blender material. */
export const SKIN_DETAIL = { texture: '/textures/soft-cells-height.png', strength: .9, scale: 1, tileMetres: .016, heightMetres: .000030, worldUnitsPerMetre: 4.2 / 1.75 } as const;

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
  // Reference-guided variation in resting skin coordinates (metres).
  // This is synthetic appearance, not a reproduction of someone's skin marks.
  float skinHash(vec3 p) {
    p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float skinNoise(vec3 p) {
    vec3 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(skinHash(cell), skinHash(cell+vec3(1,0,0)), f.x),
      mix(skinHash(cell+vec3(0,1,0)),skinHash(cell+vec3(1,1,0)),f.x),f.y),
      mix(mix(skinHash(cell+vec3(0,0,1)),skinHash(cell+vec3(1,0,1)),f.x),
      mix(skinHash(cell+vec3(0,1,1)),skinHash(cell+vec3(1,1,1)),f.x),f.y),f.z);
  }
  // Returns follicle/spot shade and fine surface-hair coverage. Derivative
  // filtering retains soft subpixel coverage rather than flickering hard dots.
  vec2 skinMarks(vec2 metres) {
    vec2 p = metres / .0035, cell = floor(p), local = fract(p);
    float seed = skinHash(vec3(cell, 7.0));
    vec2 origin = vec2(.25 + .3 * seed, .2 + .15 * skinHash(vec3(cell, 12.0)));
    float pixel = max(length(fwidth(p)), .0001);
    float radius = .025 + .018 * skinHash(vec3(cell, 22.0));
    float follicle = (1.0 - smoothstep(max(0.0, radius-pixel), radius+pixel, length(local-origin)))
      * min(1.0, radius / pixel);
    vec2 direction = vec2(.15 + .15 * seed, .35 + .2 * skinHash(vec3(cell, 31.0)));
    vec2 delta = local-origin;
    float along = clamp(dot(delta,direction)/dot(direction,direction),0.0,1.0);
    float distance = length(delta-direction*along);
    float width = .012 * (1.0 - .65 * along);
    float hair = (1.0 - smoothstep(max(0.0,width-pixel*.5),width+pixel*.5,distance))
      * min(1.0,width/pixel) * step(.25,seed);
    vec2 spotCell = floor(metres/.009), spotLocal = fract(metres/.009);
    float spotSeed = skinHash(vec3(spotCell, 91.0));
    float spotRadius = .035 + .055 * skinHash(vec3(spotCell, 19.0));
    float spotPixel = max(length(fwidth(metres/.009)),.0001);
    float spot = (1.0-smoothstep(spotRadius*.4,spotRadius+spotPixel,
      length(spotLocal-vec2(.25+.5*spotSeed,.3+.4*skinHash(vec3(spotCell,41.0)))))) * step(.88,spotSeed);
    return vec2(follicle*.18 + spot*.26, hair);
  }
  vec3 skinAppearance() {
    if (skinDetailStrength <= 0.0) return vec3(0.0);
    vec3 w = pow(abs(normalize(vSkinNormal)),vec3(6.0)); w /= max(dot(w,vec3(1.0)),.00001);
    vec2 marks = skinMarks(vSkinRest.yz)*w.x + skinMarks(vSkinRest.xz)*w.y + skinMarks(vSkinRest.xy)*w.z;
    float pigment = (skinNoise(vSkinRest/.007)-.5)*.11 + (skinNoise(vSkinRest/.025)-.5)*.07;
    return vec3(marks,pigment);
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
    float h = height * ${SKIN_DETAIL.heightMetres} * ${SKIN_DETAIL.worldUnitsPerMetre} * skinDetailStrength;
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
      float fresnel = .028 + .12 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
      float reflection = fresnel * ((exponent + 2.0) / 8.0)
        * pow(max(dot(N, H), 0.0), exponent) * max(dot(N, L), 0.0);
      result += uLightColor[i] * uLightIntensity[i] * attenuation * reflection;
    }
    return result;
  }
`;
