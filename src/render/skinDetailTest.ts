// Browser preview detail. Settings are session-only; Blender exports use their own material.
export const skinDetailSettings = { enabled: true, strength: .65, scale: 1 };
export const SKIN_DETAIL_GLSL = `
  uniform sampler2D skinDetailMap;
  uniform float skinDetailStrength;
  uniform float skinDetailScale;
  varying vec3 vSkinRest;
  varying vec3 vSkinNormal;
  vec3 skinDetailNormal(vec3 N) {
    if (skinDetailStrength <= 0.0) return N;
    vec3 p = vSkinRest / (.016 * skinDetailScale);
    vec3 w = pow(abs(normalize(vSkinNormal)), vec3(6.0));
    w /= max(w.x + w.y + w.z, .00001);
    // A seamless, linear height field, triplanar projected in the rest pose.
    float h = texture2D(skinDetailMap, p.yz).r * w.x
            + texture2D(skinDetailMap, p.xz).r * w.y
            + texture2D(skinDetailMap, p.xy).r * w.z;
    // Relief range comes from the shared recipe; browser units are 2.4 per metre.
    h *= .000030 * 2.4 * skinDetailStrength;
    vec3 dx = dFdx(vWorldPosition), dy = dFdy(vWorldPosition);
    vec3 r1 = cross(dy, N), r2 = cross(N, dx);
    float determinant = dot(dx, r1);
    if (abs(determinant) < 1e-20) return N;
    vec3 gradient = sign(determinant) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(determinant) * N - gradient);
  }
`;
