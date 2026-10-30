# Portfolio render finish

Shoot → Detailed exposes Standard (2560 px / 512 samples) and Portfolio (4000 px / up to 2048 samples), plus a regional skin checkbox. Detailed defaults to Portfolio with regional skin. Quick remains 960 px / 64 samples. Aspect ratio and captured camera are preserved.

Portfolio matches the local cinematic study: adaptive threshold .003, 12 total / 4 diffuse / 6 glossy bounces, accurate OpenImageDenoise, .7 pixel filter, 16-bit RGB PNG. Lighting and camera remain the user's composition. Output.finish is an explicit opt-in; older contracts keep their settings.

Guided and manual Shoot zoom allow up to 12×. Collision clearance remains unchanged; a narrower field of view adds magnification after reaching clearance. Minimum FOV is 5 degrees. Higher magnification intentionally crops the artwork.

Deploy worker first, then render-job gateway, then beta frontend. Keep the existing 600-second Blender / 660-second provider limits and one scale-to-zero worker. Larger outputs must use the private signed storage path. Confirm a live Portfolio render completes within these limits before claiming cloud validation.
