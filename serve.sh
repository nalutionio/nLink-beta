#!/bin/sh
set -e

PORT="${PORT:-5173}"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Serving on http://localhost:${PORT}"
echo "Open: http://localhost:${PORT}/shared/auth-choice.html"
echo "Press Ctrl+C to stop."

cd "${ROOT_DIR}/public"
python3 -m http.server "${PORT}"
