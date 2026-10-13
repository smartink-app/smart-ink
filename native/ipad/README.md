# Smart Ink Studio for iPad

A SwiftUI studio around the existing Three.js viewport. The browser version retains its current interface and storage behavior.

## Build and run

From the repository root:

```sh
npm run build:ipad
python3 native/ipad/generate-project.py
xcodebuild -project native/ipad/SmartInkStudio.xcodeproj \
  -scheme SmartInkStudio -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath native/ipad/DerivedData CODE_SIGN_IDENTITY=- build
```

Open the Xcode project, select an iPad simulator and Run. The app starts from its **bundled** interface, models, textures and decoding libraries; no Vite server is needed. Debug uses the existing local demo sign-in. Its Blender renderer is `http://127.0.0.1:4321` in the simulator. For a physical development iPad, configure the renderer address in `StudioModel.swift` to the Mac’s LAN address before building.

For Release, build the independent production web bundle first:

```sh
npm run build:ipad:release
```

Supply the normal `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` build configuration. Release never falls back to demo authentication when these are missing. Select a signing team for physical installation/TestFlight. The generated project copies only the bundle matching `$CONFIGURATION`; a missing bundle fails the build. Rebuild the web bundle after changing web source.

## Native workflow

- Native searchable project gallery: create, reopen, rename, delete with confirmation.
- Artwork / Body / Shoot toolbar, native inspector, shared undo/redo, save indicator, keyboard shortcuts.
- Tap a body region to smoothly frame it and show its relevant native shape controls. Figure, skin, pose, hair, clothing, measurement fitting and reset remain available.
- Fingers orbit/pinch/pan; Pencil precisely drags ink. Explicit finger-placement mode allows editing without Pencil. Multi-pointer release never places a new tattoo.
- Files PNG import, Photos image conversion, image drops and bundled example designs. Size, dimension, project-context and editable-state checks apply.
- Native shot presets, camera angle/elevation/zoom, depth of field, output format and quality. Existing studio rendering/framing code remains authoritative. Measurement guidance and the rendered-image stage remain shared web components.
- Native background render uploads, persistent per-account job status and local PNG results. Leaving Shoot detaches the web viewer without discarding the native job. Finished images share through the system share sheet, without editor controls.
- Native render library shows completed/active/failed jobs and existing project history; retry is explicit. Stopping a transfer does not promise server-side cancellation. iPadOS controls scheduling; force-quitting or renderer interruption can require retry.
- Pencil palette / previous-tool actions respect the system preference; supported Pencil squeeze opens the inspector. Eraser and system-shortcut preferences are not repurposed. Physical Pencil behavior still requires hardware verification.

## Offline projects and account copies

The app serves its read-only bundle on a fixed **loopback-only** origin. This supports WebKit workers, WebGL assets and persistent IndexedDB without a preview server or public network listener. Paths escaping the bundle are rejected.

Demo projects remain in the existing local store. Hosted accounts use account-scoped iPad drafts. **Import from your account** downloads an independent local project with its images. **Save a copy to account** creates a separate hosted copy, so offline editing cannot overwrite another device’s work. This is explicit transfer, not automatic two-way synchronization.

Offline reopening for hosted users requires a previously approved, still-valid auth session. Only transport failures can use that approval; explicit rejection/revocation does not. Signing out clears approval. Signing in, expired sessions, importing/publishing account projects and Blender rendering require connectivity. Remote auth/configuration is not supplied by the native host flag.

## Boundaries and release work

This remains a development beta. Before artist distribution: configure and verify the production account/render services, signing and app icon; test actual iPad memory/performance, Pencil/palm rejection, Photos/Files providers, background transfer and AirDrop/Photos sharing. The motion buttons currently preview existing reveal/orbit camera movement; native video-job export is not part of this still-photo bridge.

The web-native bridge accepts named commands and structured file data, never arbitrary executable text. Native commands use the existing editor state and history. Only the trusted main frame can publish state or request renders. Native storage is per-account and files are protected until first device unlock. Release external navigation stays restricted; use email/password or email-code sign-in rather than Google redirects.

## Verification

`npm run test:ipad` covers import lifecycle, multi-touch behavior, finger placement, account-isolated drafts, failed persistence, offline approval expiry, command bounds, edit locks and save-before-navigation. Existing inspector/history, snapshot/camera, upload and render-service tests exercise the shared browser behavior. `npm run typecheck` checks integration.

Simulator visual checks cover bundled startup, project creation and reopening after relaunch, native gallery/inspector, example artwork, direct body-region selection, undo and an actual Blender render. Check the current task’s final report for remaining device-only checks.
