# Body skin, recipe v2

The browser applies the authored Soft cells relief, irregular pigment, follicle marks,
roughness variation, subtle arm veins, and surface-bound fine hairs. Torso, head,
arms and legs have distinct profiles. The reference scale is a 1.75 m figure;
patterns are bound before posing/shaping, so they follow the skin. Camera distance
filters detail through mipmaps and derivatives rather than enlarging pores.

`smartink-live/skinProfile.json` is the versioned recipe: metres, deterministic seed,
region settings, conservative exclusion fades, and the common height tile. This is
an artistic approximation informed by references, not a skin scan or measured anatomy.
No personal reference photos are bundled or uploaded.

## Research informing the implementation

- [NVIDIA: Realistic real-time skin](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin): surface reflection and subsurface diffusion need different treatment. Pores alone do not make convincing skin. Our softened diffuse normal is only an approximation; there is no true diffusion pass yet.
- [DermNet: epidermal structure](https://dermnetnz.org/cme/principles/structure-of-the-epidermis): fine body hair differs from terminal hair, with no follicles on palms/soles. Current masks conservatively omit whole hands, feet and head hair rather than inventing precise segmentation.
- [Blender: Generate Hair Curves](https://docs.blender.org/manual/en/5.1/modeling/geometry_nodes/hair/generation/generate_hair_curves.html): surface UVs/rest positions, density masks and seeds support a deformable groom.
- [PBRT: hair scattering](https://www.pbr-book.org/4ed/Reflection_Models/Scattering_from_Hair): hair has its own reflection/transmission behaviour. Browser fine hairs are a cheap surface coverage approximation, not cylindrical strand geometry.

## Blender handoff

Blender now reads the same physical relief dimensions and stores the entire recipe
on the body object. Package the JSON alongside studioSkin.py (the Runpod image does
this). Existing Blender shading still implements only the authored relief layer;
pigment, veins and body hairs do **not** match the browser yet.

For exact cross-renderer pattern matching, bake the browser's generated pigment,
roughness, follicle and vein fields into the body UV atlas. Use non-colour data for
roughness/height/masks and colour-managed base colour. Preserve source UVs and face
anchors. Browser sin-hash arithmetic is not bit-identical to Blender noise; merely
copying the seed into a Noise Texture node will not reproduce these markings.

For the subsequent 3D hair groom, generate and save roots as source triangle IDs +
barycentric coordinates, length, tangent direction, curvature and radius in metres.
Use the same records to build browser ribbons and Blender curves, with an authored
UV density/exclusion map for palms, soles, lips, nails and other hairless surfaces.
This avoids claiming precision from the current coarse six-region classification.
Blender is Z-up; convert centred browser rest positions (x,y,z) to (x,-z,y), with
consistent scale/origin, before applying the shared records. Validate model-specific
orientation and handedness before baking.

## Remaining realism work

- Authored anatomical masks and directional guides; current boundaries are A-pose heuristics.
- True surface curves for silhouette hairs, shadows and close macro shots.
- UV baking and side-by-side Blender/browser validation under the same lights.
- Subsurface light transport and skin-tone calibration with neutral reference lighting.
- Device performance measurements before increasing strand density or shader complexity.

No commercial-quality guarantee follows from a preset. Review output at its final
resolution, including dark ink, thin lines, regional transitions and multiple skin tones.
