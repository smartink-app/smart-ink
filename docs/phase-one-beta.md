# Phase 1 artist beta — studio-test

Implemented locally, 8 October 2026. No production deployment or database changes
were performed. The existing Focus Studio work was preserved in commit 2ae8d0b.

## Artist workflow

- The public homepage explains tattoo projection, client proportions and guided
  studio shots using actual product renders. The public simplified editor route
  is removed, including the legacy `?demo=1` entry point.
- Hosted access continues through email request, admin approval/invitation and
  verified active membership. An unconfigured production build fails closed.
  The local preview explicitly uses browser-only demo accounts and storage.
- Tattoo: place and drag the design directly, with size/rotation controls beside
  it. Dragging bare skin or the background orbits the model. Existing uploads,
  projection, fit/pose and undo remain available.
- Model: click a body region to focus it and open proportion sliders. Existing
  presets, skin tones, measurements, pose, clothing and hair are retained.
  Measurement-fitted figures protect their proportions and offer Edit measurements.
- Shoot: Portfolio, Sculpted light and Skin detail presets; bounded camera
  controls; portrait, square and landscape framing; paper backdrops; brightness;
  tattoo-focused lens blur in Blender. Advanced lights remain available.
  Composition temporarily owns the full viewport. Closing it restores the
  editor camera, lights and background. Temporary shot states are not autosaved
  over the editing scene.
- Video: a four-second pull-back or small orbit, browser preview and local Blender
  MP4 output. Frame progress, cancellation, downloads and job recovery are included.
  This first version moves only the camera; the body and light rig remain fixed.
- Artwork, renders and account remain reachable using existing functionality.
  Broader asset management and account features remain Phase 2.

## Rendering boundaries

The viewport uses a restrained Soft cells bump texture, stable before body fitting
and posing. Shoot exports opt into the corresponding Blender material and require
the existing sculpt normal. See `studio-render-foundation.md` for material scale,
worker packaging, motion limits and local job storage.

Both photo qualities use a frozen 4096-square tattoo atlas within the existing
16-megapixel server limit. Detailed increases output quality, but cannot invent
source tattoo detail. A separate high-density tattoo projection path remains
future work: macro diagnostics still show atlas pixelation. These changes do not
establish commercial-photo fidelity across body regions, skin tones and tattoos.

Video is capability-gated to the local renderer. Cloud/RunPod video is unavailable.
The real end-to-end proof used 192×240, 96 frames, 24 fps, four seconds; this proves
the pipeline, not full-resolution speed or final temporal quality. Render jobs are
stored in a local temporary folder, not durable cloud storage. A browser panel
closure can recover an accepted job; ambiguous network loss during submission
still needs server idempotency before production video rollout.

## Local preview

`npm run dev:focus` serves the interface on 4320 and renderer on 4321. Override
`FOCUS_UI_PORT` / `FOCUS_RENDER_PORT` if occupied. `FOCUS_PYTHON` may point to an
existing Python environment with the server requirements installed. If the copied
server environment is unavailable, the launcher creates an ignored `.focus-venv`
without changing stale external symlinks. Blender and FFmpeg must be installed for
photo and video output. Local accounts are development-only.

## Verification completed

- Typecheck, lint and production build passed; Vite reports its existing large
  bundle warning.
- Full demo regression suite passed. After correcting the upload size, snapshot
  and export tests passed again. Private routing/auth, direct body/tattoo
  interactions and reveal lifecycle tests passed. `npm run test:phase1` collects
  these frontend checks.
- Nine existing local render-server tests and four video lifecycle tests passed;
  192 browser/Blender camera samples agree.
- Real Blender still checks confirm sculpt-normal composition and unchanged
  geometry/UV hashes. A real HTTP → Blender → FFmpeg four-second MP4 completed.
- Browser testing covered the saved test project, region selection and chest
  adjustment, adjacent tattoo resize controls, shot formats, motion preview,
  disabled controls while previewing, editor return and an actual Quick photo.
  Video submission advanced through actual Blender frames, and cancellation was
  confirmed in the interface. That photo completed in about 16 seconds on this machine. Screenshot proof is
  outside the repo in `../phase1-render-proof/browser-photo.jpg`.

## Required before inviting artists on the hosted site

1. Review/apply `20261008120000_active_beta_resources.sql` to staging, execute
   `supabase/tests/active_beta_resources.sql`, and verify active/revoked/invited/
   anonymous access using separate accounts. The migration is saved but unapplied;
   local SQL execution was unavailable. Existing signed downloads remain valid
   until their expiry after revocation.
2. Verify the real email request → approval → invitation → verified sign-in path
   against the production configuration, including mail delivery and redirect URLs.
3. Build and test the updated cloud worker image before deploying Studio skin.
   Worker tests were not run locally because aiohttp/runpod dependencies were
   unavailable. Do not claim cloud material deployment is complete.
4. Review photo fidelity with actual artists and reference photographs across
   representative placements and skin tones. Test upload limits and the supported
   browser/device range; validate desktop layout in a full desktop viewport.
5. Deploy only after those gates pass. Cloud video, durable job storage, additional
   camera paths, body animation and outdoor environments are subsequent work.
