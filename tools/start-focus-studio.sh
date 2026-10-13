#!/usr/bin/env bash
# Run the isolated UI and local Blender service; leave ~/smartink-live untouched.
set -euo pipefail
FOCUS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$FOCUS_ROOT"
FOCUS_UI_PORT="${FOCUS_UI_PORT:-4320}"
FOCUS_RENDER_PORT="${FOCUS_RENDER_PORT:-4321}"
if [[ ! -d node_modules ]]; then npm ci; fi
FOCUS_PYTHON="${FOCUS_PYTHON:-$FOCUS_ROOT/server/.venv/bin/python}"
if [[ ! -x "$FOCUS_PYTHON" ]]; then
  # A copied worktree can contain a stale external .venv symlink. Leave it alone.
  FOCUS_PYTHON="$FOCUS_ROOT/.focus-venv/bin/python"
  if [[ ! -x "$FOCUS_PYTHON" ]]; then
    python3 -m venv "$FOCUS_ROOT/.focus-venv"
    "$FOCUS_PYTHON" -m pip install -r server/requirements.txt
  fi
fi
FOCUS_RENDER_PID=""
cleanup() { if [[ -n "$FOCUS_RENDER_PID" ]]; then kill "$FOCUS_RENDER_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$FOCUS_PYTHON" -m uvicorn server.app:app --host 127.0.0.1 --port "$FOCUS_RENDER_PORT" &
FOCUS_RENDER_PID=$!
# Fail visibly if this branch cannot start its own render service.
FOCUS_PORT="$FOCUS_RENDER_PORT" "$FOCUS_PYTHON" - <<'PY'
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
  npm run dev -- --configLoader runner --host 127.0.0.1 --port "$FOCUS_UI_PORT" --strictPort
