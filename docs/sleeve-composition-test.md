# Shoulder + sleeve composition test

Local experiment on `studio-test`, available from the Tattoo inspector → **Try a shoulder + sleeve**.

## Try it

1. Open or create a full-figure project. Start the sleeve sample from Tattoo.
2. Choose Arm, Shoulder or Chest in the floating controls. Adjust size, position, rotation (shoulder/chest), visibility and edge trim independently.
3. Use Whole sleeve or Inspect section, then orbit on bare skin to check the inside and outside joins.
4. Use Shoot → Create photo to bake all three sections into the existing Blender render. Undo/redo, saved projects and return to regular placement are supported.

The original artwork sources are `public/tattoos/orbit-sleeve-{arm,shoulder,chest}.svg`, with matching transparent PNGs. They are a circle-pattern study, not a recreation of the reference photograph. PNGs are 2048 pixels wide. The arm strip is periodic horizontally, with the join on the inside of the arm; its shaped lower edge tapers down the forearm.

## What this validates

- A longer circumferential arm chart plus two local curved charts can share the same body and lighting.
- Each section has its own transform and transparent outline. All ink coordinates are attached to the rest mesh, so existing shape and pose changes move the ink with the skin.
- Shoulder and chest use complementary region boundaries to prevent one piece spilling into the other. Arm and shoulder can overlap.
- Browser and Blender use the same layer composition. The bake snapshots all attributes before waiting for images, and cleans up all resources on a partial image failure.
- Existing single-placement and 360-degree band modes remain available.

## Deliberate limits and next step

This is a left-side, three-section sample, not an arbitrary sleeve editor. Shoulder/chest images are fixed samples; Replace arm artwork changes only the arm strip. A single photograph cannot supply the hidden artwork around the limb.

The section joins are visible. Adjacent motifs do not automatically align, and enlarging/moving a section can clip it at its supported surface. Edge trim is a simple directional cut, not a painted mask. The current sample establishes placement and export; it is not a finished artist-ready sleeve stencil.

Next: export a fitted body template with shared landmarks, import a transparent image per section, add a paint/erase join mask and distortion feedback. Artists should deliver artwork in separate transparent layers aligned to that template, with overlap at joins and no baked skin or lighting. Keep the editable vector master where available.

## Verification

- Both body meshes: full arm circumference, no reversed sleeve mapping faces, independent transforms/visibility, saved-anchor validation, camera framing, unchanged body UVs and attachment through shape/pose.
- Bake: independent section snapshot isolation and resource cleanup when a layer image fails.
- Browser: created a separate project, checked front/side coverage, adjusted/reset a section, hid/restored it, reopened the saved project, exited the mode and restored it with undo.
- Blender: the combined three-section photo completed successfully through the normal Shoot workflow.
- Existing phase-one regression checks, TypeScript, lint and production build pass. Build retains its existing large-chunk warning.
