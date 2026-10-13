import * as THREE from 'three';

/** Baked from our Soft cells material. 16 mm tile, 30 µm encoded height range.
 * This is an artistic preview, not a measured scan or the Blender material. */
export const SKIN_DETAIL = { texture: '/textures/soft-cells-height.png', strength: .4, scale: 1 } as const;

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
  float skinHeight() {
    vec3 p = vSkinRest / (.016 * skinDetailScale);
    vec3 w = pow(abs(normalize(vSkinNormal)), vec3(6.0));
    w /= max(w.x + w.y + w.z, .00001);
    return texture2D(skinDetailMap, p.yz).r * w.x
      + texture2D(skinDetailMap, p.xz).r * w.y
      + texture2D(skinDetailMap, p.xy).r * w.z;
  }
  vec3 skinDetailNormal(vec3 N, float height) {
    if (skinDetailStrength <= 0.0) return N;
    float h = height * .000030 * 2.4 * skinDetailStrength;
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
