#!/usr/bin/env bash
# Stop the local Neo N3 chain started by ./start.sh.
# Use `--clean` to also remove the cloned chain directory.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAIN_DIR="$HERE/.chain"

if [ ! -d "$CHAIN_DIR" ]; then
  echo "[localnet] no chain directory; nothing to stop."
  exit 0
fi

cd "$CHAIN_DIR"
echo "[localnet] docker compose down…"
docker compose down

if [ "${1:-}" = "--clean" ]; then
  echo "[localnet] removing $CHAIN_DIR (chain state will be lost)"
  rm -rf "$CHAIN_DIR"
fi
