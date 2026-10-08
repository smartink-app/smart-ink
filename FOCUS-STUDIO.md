# Smart Ink · Focus studio

Functional redesign on `codex/focus-studio`, based on the local `origin/beta` commit `6676b8a`.

## Try it locally

Run `npm run dev:focus`. This starts the app at **http://127.0.0.1:4320/** and the local Blender service at **http://127.0.0.1:4321/**. Blender must be installed; the launcher checks `/Applications/Blender.app` automatically through the existing server. Node 22 and Python 3 are required. The launcher installs missing project dependencies on first run. Both ports can be overridden with `FOCUS_UI_PORT` and `FOCUS_RENDER_PORT`.

On the homepage, **Try the live demo** opens a real 3D sample without signing in. **Log in → Sign in as local admin** opens the full local studio (the existing development-only account). Projects, artwork uploads, account preferences, and rendered history stay in this browser. The launcher does not enable local authentication in a production build.

The normal hosted beta sign-in, invite acceptance, waitlist, project storage and render sharing integrations remain in place. Use the existing `.env.example` and `docs/supabase-setup.md` to configure a hosted environment. The demo never creates an account or calls project storage, upload, sharing, or server rendering services.

## What changed

- Dark theme by default; light theme uses the same controls and layout. The choice is remembered and synchronized across tabs.
- A shared Projects / Studio / Artwork / Renders / Account rail.
- Projects first, with searchable recent work. New project opens a focused name-and-template dialog instead of filling the overview with setup controls.
- One editing panel on the left: Tattoo / Body / Lighting. Artwork replaces that panel while choosing a design. The 3D canvas stays mounted.
- Size, rotation and before/after remain direct. Persistent “More controls” sections expose tint/opacity, pose/outfits/hair and the full light rig. Non-default hidden values are summarized. Hiding controls does not change scene data or undo history.
- Body fitting stays optional, with the complete measurement guide and fitted export behavior.
- Focus, Fit and Clean view remain visible. All camera presets and preview settings are together under View.
- Render image opens the existing composition/quality flow. Previous successful results, cancellation, retry, live comparison provenance, downloads, quick canvas export, Blender export, watermarks, history and sharing are preserved.
- Public homepage → sample demo → beta request, with sign-in/invite acceptance separate. Local requests explicitly say they stay in the local preview. Retrying a failed hosted form delivery actually resubmits it.
- Keyboard-accessible native dialogs for creation, account, exports and render history; responsive layout places controls below the canvas on narrow screens.

UI theme changes do not recolor the scene or exported image. New projects start with a charcoal studio background; existing projects keep their saved scene settings.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:demo`, and `npm run test:focus-ui`.

The original regression suites cover placement/UV seams, save queue failure/retry, uploads, scene persistence, shape/pose/appearance, lighting, camera/focus, undo, measurement fitting, snapshot composition, cancellation, previous-image retention and comparison provenance. Focus UI tests cover new project/artwork navigation, asynchronous creation and failure recovery, theme storage fallback, disclosure persistence, and the public-demo authentication boundary.

The running branch was also exercised through the actual snapshot client/session against the local Blender service. Browser visual and pointer validation remained unavailable because the browser policy check was blocked; the user confirmed that the preview loads. Hosted Google/email sign-in and cloud sharing need a configured hosted environment and were not exercised against real accounts.
