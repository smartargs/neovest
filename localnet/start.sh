#!/usr/bin/env bash
# Convenience launcher for the local-net workflow described in docs/LOCAL.md.
#
# Clones AxLabs/neo3-privatenet-docker into ./localnet/.chain (gitignored)
# the first time, then `docker compose up -d` to bring it online. Idempotent.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAIN_DIR="$HERE/.chain"
REPO_URL="https://github.com/AxLabs/neo3-privatenet-docker.git"

if [ ! -d "$CHAIN_DIR" ]; then
  echo "[localnet] cloning $REPO_URL → $CHAIN_DIR"
  git clone --depth 1 "$REPO_URL" "$CHAIN_DIR"
fi

cd "$CHAIN_DIR"
echo "[localnet] starting consensus nodes (docker compose up -d)…"
docker compose up -d

echo
echo "Local Neo N3 chain is up:"
echo "  client1   RPC: http://localhost:10332   (default for the UI)"
echo "  client2   RPC: http://localhost:20332"
echo "  consensus RPC: http://localhost:40332   (use this to seed client1)"
echo
echo "Test wallet (import into NeoLine via Private Key):"
echo "  client1: NdihqSLYTf1B1WYuzhM52MNqvCNPJKLZaz"
echo "  WIF:     L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok"
echo "  (client1 starts with 0 balance — see docs/LOCAL.md for the seed step)"
echo
echo "Stop: $HERE/stop.sh"
echo "Full walkthrough: docs/LOCAL.md"
