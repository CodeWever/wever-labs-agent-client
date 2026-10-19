#!/usr/bin/env bash
set -euo pipefail
# Compatibility entry point: use the same checked MCP flow as npm run smoke.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec node "$SCRIPT_DIR/wever-external-agent-client-node.mjs"
