# Blender regional skin study

This recipe is available in Shoot → Detailed through the Regional skin texture checkbox.
The render contract opts in with `skinVariation: "regional"`; Quick and legacy contracts
retain shared skin. It is a Blender effect, not a browser parity claim. The user-provided texture catalogue screenshots
and arm photograph inform visual pattern choices; no source pixels are bundled.

## Recipe

- Arm: stretched, irregular intersecting lines.
- Lower leg: finer, less elongated cells.
- Torso/shoulder area: fine, relatively isotropic surface structure.
- Neck: finer directional lines.
- Posterior elbow / anterior knee: localized distorted folds.

Fixed scales use the existing resting-position attribute in metres. Smooth regional
weights sum to one; folds use surface orientation to avoid encircling the limb.
The sculpt normal chain, pigment, fine-hair layer and tattoo coordinates are preserved.
The previous broad repeated tile is removed in the study; fine micro-cells remain.

These are artistic A-pose masks. They are not scan registration, age/sex-specific
anatomy, or reliable palm/sole/knuckle segmentation. Those areas need authored masks
and directional guides before this can replace the shared production material.

## Repeatable checks

```
python3 tools/regional-skin.test.py
blender -b --python-exit-code 1 --python tools/regional-skin-study.py -- /absolute/export/contract.json /absolute/output
```

The export directory must contain its ink and model assets as for an ordinary local
render. The runner creates a sibling `regional-study-contract.json`; it does not
modify the supplied contract. Each pair uses identical lighting, framing, source
artwork, 768×960 resolution and 128 Cycles samples. Depth of field is disabled.

Eight cases: tattooed arm at two distances, posterior elbow, anterior knee, chest,
neck, lower leg and darker tattooed arm. It checks unchanged tattoo UVs, the original
colour pipeline and the sculpt/bump connection. Pure Python checks sample 6,006
positions for bounded normalized weights, continuity and bilateral symmetry, plus
anterior/posterior joint discrimination.

## Iteration findings

The initial large-cell arm network was too regular and strong. The first joint
light rig was overexposed. That version was rejected, its batch stopped, and the
study rerun with smaller/softer grooves, less fold relief and lower light energy.

Review the completed pairs visually at normal display size and full resolution.
Passing the checks does not establish photographic realism. There is no calibrated
scan scale in the catalogue screenshots; real texture assets and authored placement
would be needed to reproduce their specific patterns faithfully.
