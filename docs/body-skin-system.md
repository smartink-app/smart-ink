# Body skin, shared material v3

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

New Shoot contracts request `skinMaterial: studio` and `skinProfileVersion: 3`.
Both renderers read the same 4096px UV data maps for pigment, spots, surface hair
coverage, veins and regional relief. `tools/skin-atlas.html` bakes these from the
browser procedural recipe for each body. `skinAtlasManifest.json` records channel
encoding and hashes; Blender rejects missing or altered maps. Regenerate both body
atlases and hashes when changing the procedural recipe or source UVs.

Pore relief is 45 micrometres at the original 16 mm tile scale. Cycles uses a
restrained 0.015 subsurface weight to preserve visible surface detail.
The shared material uses the same base-tone transforms, pore dimensions, regional
roughness and hair-over-ink order. Rest coordinates convert between browser Y-up
and Blender Z-up. Blender also applies the browser's three-segment tangent-plane
surface refinement and closes focused limbs. Original source meshes and placement
anchors remain unchanged. Blender 5.2 triangulation indices and older vector results
are both supported by the closure code.

Run `tools/shared-skin-parity.test.mjs` with a NumPy-enabled `PYTHON` to check surface
math and asset hashes. Run `tools/shared-skin-blender.test.py` inside Blender for
material, geometry and actual render checks; optional `SKIN_TEST_BODY`,
`SKIN_TEST_REGION` and `SKIN_TEST_TONE` select additional cases.

This shares surface inputs, not identical pixels: Cycles light transport, colour
management, lens blur, denoising and export resolution still differ from the live
browser. The local focused-arm photo completed through the app after the Blender
5.2 closure fix; live comparison confirmed matching framing and tattoo placement,
with softer fine lines in the Quick output. Final tonal/sharpness calibration and
hosted verification remain release checks. Four-kilopixel atlases also need device
memory/performance measurements before claiming mobile readiness.

Deploy the rebuilt render-worker image (including the maps, manifest and geometry
module) before releasing the frontend requesting v3. Local checks do not verify a
hosted worker. Legacy contracts retain their existing material path.

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
- Detailed-output sharpness and tonal calibration under matched lighting.
- Subsurface light transport and skin-tone calibration with neutral reference lighting.
- Device performance measurements before increasing strand density or shader complexity.

No commercial-quality guarantee follows from a preset. Review output at its final
resolution, including dark ink, thin lines, regional transitions and multiple skin tones.
