# 360-degree armband experiment

On studio-test. Tattoo → Try a 360° armband loads the original periodic geometric
sample and a dedicated upper-arm placement. The sample is a transparent 4096×640
PNG with an editable SVG master; the public artwork guide describes artist delivery.
This is one copy of a complete band, not a runtime repeating-motif editor.

The mode supports both upper arms, body models, position, relative band height,
phase around the limb, a front view and a join view. Existing regular placements
retain their previous chart, bounds and controls. Returning to regular placement
keeps the current artwork and puts it on a local patch; normal fit warnings apply.
Wrap settings live on SurfaceAnchor.wrap, so scene saving and history carry them.

The mapping uses a measured arm axis and 13 plane/skin cross-sections. Every
cross-section must be one closed loop inside the selected arm region. Arc-length
coordinates follow the section perimeter, with a join on the inner side of the
rest arm. Each already-split triangle unwraps its own seam-crossing corners;
periodic texture sampling avoids both a faded seam and derivatives across 0→1.
Preview and atlas bake use the same GLSL function, RepeatWrapping and coordinates.
Positions, skin UVs and topology are untouched. UVs follow body shaping and posing;
changing the body therefore changes the physical artwork proportions.

This is deliberately limited to the middle of the upper arm on the shipped
figures. Unsupported shoulder positions retain the last valid placement and show
a message. Arbitrary images need matching edges; this mode cannot make an
unrelated pair of artwork edges seamless. The mapper does not provide a physical
stencil or promise zero distortion on a tapered arm. Lower legs, forearms, sleeves,
custom seam paths and motif repetition are subsequent work.

Verification: tools/wrap-placement.test.mjs checks real male/female arms, closure,
continuous seam triangles, full angular coverage, region protection, serialized
settings, untouched geometry/UVs, camera framing and attachment under body edits.
Production pointer tests protect wraps while orbiting. Existing phase 1 regression
checks run alongside these. Visual verification uses a separate local project,
“360° armband — seamless test”, including front/join views and a Blender export.

The browser test also uploaded the supplied PNG through Replace image, reloaded
the saved scene, adjusted height and rotation, undid those edits, and switched
out of/returned to wrap mode with Undo. A Quick Blender photo completed with
the full body present. Typecheck, lint, build and phase 1 regression checks pass.
