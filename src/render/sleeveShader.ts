/** Same straight-alpha composition in the viewport and Blender's ink atlas. */
export const SLEEVE_VERTEX_DECL = /* glsl */ `
  attribute vec4 aSleeveShoulder;
  attribute vec4 aSleeveChest;
  varying vec4 vSleeveShoulder;
  varying vec4 vSleeveChest;
`;
export const SLEEVE_VERTEX_ASSIGN = /* glsl */ `
  vSleeveShoulder = aSleeveShoulder;
  vSleeveChest = aSleeveChest;
`;
export const SLEEVE_GLSL = /* glsl */ `
  uniform float sleeveEnabled;
  uniform sampler2D sleeveShoulderTexture;
  uniform sampler2D sleeveChestTexture;
  varying vec4 vSleeveShoulder;
  varying vec4 vSleeveChest;
  vec4 sleeveOver(vec4 below, vec4 above) {
    float a = above.a + below.a * (1.0 - above.a);
    return vec4((above.rgb * above.a + below.rgb * below.a * (1.0 - above.a)) / max(a, 0.00001), a);
  }
  vec4 sleevePatch(sampler2D image, vec4 chart, vec3 tint, float opacity) {
    return sampleSurfaceTattoo(image, vec2(chart.x - .5, chart.y), chart.z * step(0.0, chart.w), 1.0, 1.0, 0.0, tint, opacity);
  }
  vec4 sleeveComposite(vec4 arm, vec3 tint, float opacity) {
    return sleeveOver(sleeveOver(arm, sleevePatch(sleeveShoulderTexture, vSleeveShoulder, tint, opacity)), sleevePatch(sleeveChestTexture, vSleeveChest, tint, opacity));
  }
`;
