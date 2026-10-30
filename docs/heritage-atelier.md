# Heritage Atelier experiment

Branch: `experiment/heritage-atelier`, based on local `beta` at `8e1a808`.

Select **Shoot → More controls → Backdrop → Heritage Atelier**, or select it in the photo studio's Backdrop menu. Scene persistence and render contracts use `studio.mode: "heritage"`. Cinematic camera/light presets preserve an active environment.

The room is fixed in world coordinates: scale 2, floor offset -2.12 (Y in Three.js; Z in Blender). The body and shot camera are not moved. This keeps the same architectural placement in both engines, including Focus views.

Browser: `public/environments/heritage-atelier/scene.glb` and `probe.png`; geometry is batched by material and assets load only when selected. The reflection probe applies to room materials only, preserving the artist's body lighting. Blender: `smartink-live/environments/heritage-atelier.blend`; the importer appends room meshes and lights, never the room camera or world. Browser illumination is an approximation, not Cycles parity.

Source assets: `/Users/sil/Work/smart-ink gpt/assets/environments/heritage-atelier/`.

Local preview: port 4356, render service 4357. Use `tools/start-focus-studio.sh` with those `FOCUS_UI_PORT` / `FOCUS_RENDER_PORT` values and a Python environment containing `server/requirements.txt`.

Verification: frontend typecheck/lint/build; studio, lighting, persistence and contract tests; Python server/direct-importer validation. `tools/heritage-render-proof.py` exercises the real importer with the local arm texture fixture, reconstructs a full UV atlas for this beta baseline, and saves a packed Blend plus PNG under `reports/heritage/`. The fixture path can be supplied through `SMARTINK_HERITAGE_FIXTURE`.

This is a local test branch. Production gateway/worker deployment is not part of this experiment. Do not expose the option on production until its renderer asset packaging and hosted contract acceptance are verified. No cloud rendering was used.

## Sharp tattoo export

The local launcher enables `VITE_RENDER_INK_REGION=1`. The baker measures occupied UV coverage, then redraws original artwork into that region at 4096 pixels; it does not upscale the low-resolution first pass. The contract carries `inkUvRegion`, which the importer uses for texture placement and tattoo autofocus. Cropped textures use CLIP extension to prevent repetition on other body regions. Empty and broadly covered atlases retain the legacy mapping.

Ordinary builds keep the feature disabled unless that flag is set: older hosted workers do not understand localized UV coordinates. This change does not enable the separate portfolio/skin experiments.

Regression checks: `node tools/ink-region.test.mjs`, `python tools/ink-region-backend.test.py`, and `npm run test:snapshot` (including propagation into frozen shots and quality rerenders).
