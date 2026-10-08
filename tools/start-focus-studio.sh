#!/usr/bin/env bash
# Run the isolated UI and local Blender service; leave ~/smartink-live untouched.
set -euo pipefail
FOCUS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$FOCUS_ROOT"
FOCUS_UI_PORT="${FOCUS_UI_PORT:-4320}"
FOCUS_RENDER_PORT="${FOCUS_RENDER_PORT:-4321}"
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -x server/.venv/bin/python ]]; then
  python3 -m venv server/.venv
  server/.venv/bin/python -m pip install -r server/requirements.txt
fi
FOCUS_RENDER_PID=""
cleanup() { if [[ -n "$FOCUS_RENDER_PID" ]]; then kill "$FOCUS_RENDER_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
server/.venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port "$FOCUS_RENDER_PORT" &
FOCUS_RENDER_PID=$!
# Fail visibly if this branch cannot start its own render service.
FOCUS_PORT="$FOCUS_RENDER_PORT" server/.venv/bin/python - <<'PY'
import os, time, urllib.request, json
url = 'http://127.0.0.1:' + os.environ['FOCUS_PORT'] + '/health'
for attempt in range(30):
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            status = json.load(response)
        print('Render service:', status['message'], flush=True)
        break
    except OSError:
        time.sleep(.2)
else:
    raise SystemExit('Local render service did not start.')
PY
kill -0 "$FOCUS_RENDER_PID" 2>/dev/null || { echo 'The render port is already in use. Choose FOCUS_RENDER_PORT or stop the previous Focus preview.' >&2; exit 1; }
VITE_AUTH_MODE=demo VITE_RENDER_URL="http://127.0.0.1:$FOCUS_RENDER_PORT" \
  npm run dev -- --host 127.0.0.1 --port "$FOCUS_UI_PORT" --strictPort
