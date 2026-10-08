# Studio skin and local motion

`skinMaterial: "studio"` opts into the saved Soft cells height bake. Omission keeps
the previous material. The 1024² linear height texture is an authored 16 mm
seamless tile encoding -20 to +10 micrometres, composed at 35% bump strength over
the original sculpt normal. Those are artistic dimensions, not measured anatomy.
Coordinates and blend normals bind before fitting/posing; tattoo atlas UVs are
not modified. The existing colour, roughness, hair, and ink shading remain.

Normal lookup includes public/models and the worker's packaged asset folder.
The opt-in material fails visibly if its height/rest data is missing. The Docker
recipe packages the new material module and texture but has not been deployed.

Motion is intentionally available only through the local HTTP renderer. Health
advertises capabilities.video, including FFmpeg readiness. The client declines
RunPod and other remote transports; RunPod's input validator rejects motion.

POST /video-jobs accepts the same multipart contract/ink layer as stills, adding:
`reveal: {version:1,preset:"reveal"|"orbit",durationSeconds:4,fps:24}`.
The camera must preserve framing. Output is bounded to even dimensions 64–1280
and 64 samples. A job returns an ID; GET /video-jobs/:id reports frame progress;
POST /video-jobs/:id/cancel stops its process group; GET /video-jobs/:id/output
downloads the completed H.264 MP4. The still endpoint rejects reveal contracts.

Slow reveal pulls back 12%; Small orbit moves through a 12-degree arc. Body,
lights and random seed stay fixed. Every camera position is checked against the
posed scene before rendering; an occluded path fails instead of inventing a
different composition. Browser math and Blender math are tested for parity.
Micro-motion around concave anatomy may still require another starting view.

Jobs survive browser navigation. Status and MP4 files are stored in a repo-specific
temporary folder (override SMARTINK_VIDEO_DIR for persistent storage). Graceful
shutdown cancels active processes; restart marks unfinished jobs interrupted.
This is not frame-level resume, cloud storage or a production queue. The temporary
folder may be cleared by the OS. Only one local motion job can run at a time;
it also consumes a shared still-render slot. A two-GB completed cache limit stops
new jobs until old local files are saved/removed. Default process timeout is one
hour (SMARTINK_VIDEO_TIMEOUT, bounded to two hours). Full-resolution cost and
temporal denoising quality need device-specific review before a public release.

Checks: tools/render-server.test.py (stills regression), tools/reveal-render.test.py
(HTTP validation, completion/encoding, cancellation/capacity, restart),
tools/reveal-camera.test.mjs (192 cross-language camera samples), and
tools/studio-render-proof.py (real Blender material/UV verification, stills and a
short diagnostic frame sequence). Offline --proof-frames never enters the API.
