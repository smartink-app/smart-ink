# Tattoo placement boundaries

Added on `studio-test`, 9 October 2026.

Each new placement defaults to an ink-only region boundary. The area comes from
the existing signed region fields on the undeformed model, using the clicked
triangle and barycentric weights. It is independent of Focus: returning to the
full figure does not unlock the tattoo or hide any body geometry. Dragging keeps
the original area; explicitly clicking another area can establish a new target.
Unchecking **Keep within…** allows intentional designs across regions.

The region and override are stored on `surfacePlacement.bounds`, so saves,
reloads and undo use the same settings. Older anchors infer a default boundary
without silently changing their saved position, size or rotation. An oversized
design shows a warning and **Fit to area**. Invalid placements cannot render
until the artist fits, repositions or enables a suitable override.

Placement checks use alpha-weighted artwork samples, chart support and local
stretching. Transparent padding and disconnected design islands are supported.
The check uses the continuous skin chart, never current screen visibility, so
wrapping out of view around the same arm is permitted. Resize/rotate requests
stop at the last valid transform; invalid drag targets preserve the last anchor.
Fit reduces the size at the current angle/anchor and reports the resulting size.
If the smallest supported size cannot fit, the UI asks for a broader spot.

`aTattooBoundary` carries the interpolated signed ink cutoff. Preview, hit tests,
tattoo camera framing and the Blender atlas bake all respect it. Export clones
the field with the chart before asynchronous image loading. Body geometry,
normals and atlas coordinates are unchanged; Blender requires no new contract.

Limits: region borders are model-derived approximations, especially at shoulders.
Ink coverage is estimated with a 96×96 alpha footprint from a bounded image
readback, with 0.3% coverage tolerance and 1% distortion tolerance. Shader clipping
enforces the exact signed region boundary independently of that estimate. Tiny
edge clipping can remain; this is not an exact per-pixel mathematical fit. If
CORS prevents reading alpha, a visible notice explains the conservative image
outline fallback. Unchecking the region lock does not permit chart foldovers or
excessive stretching. Clothing/other accessories retain their existing behavior.

Validation: full `npm run test:phase1` passes. The added
`tools/placement-bounds.test.mjs` exercises alpha, padding, rotation/aspect,
distortion, safe transforms, actual male/female upper-arm meshes, production
placement callbacks, persistence, blocked cross-region drag, explicit override,
unchanged geometry/UVs and matching preview/export cutoffs. Export regression
checks cover boundary snapshot ownership and invalid-placement render rejection.
Browser checks exercised scale limiting, the override and an oversized 155%,
−30° arm placement: it warned about roughly 25% unsupported ink and fitted to
about 84%. A Blender shot with the full body present completed successfully:
the fitted design stayed on the arm, with no stray chest fragments.
