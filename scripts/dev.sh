#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export SERVE_FRONTEND="${SERVE_FRONTEND:-true}"
export NEXT_DEV="${NEXT_DEV:-1}"
export NEXT_INTERNAL_PORT="${NEXT_INTERNAL_PORT:-3001}"
exec cargo run
