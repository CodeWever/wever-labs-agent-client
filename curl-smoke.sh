#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-https://weverlabs.com}
curl -s "$BASE/agents.json" >/dev/null
curl -s "$BASE/.well-known/mcp.json" >/dev/null
curl -s -X POST "$BASE/api/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
curl -s -X POST "$BASE/api/external-agent-client-runner" -H "Content-Type: application/json" -d '{"mode":"run_external_agent_client_runner","rail_key":"packetops","idempotency_key":"external-client-runner-001","movement_amount_units":1000,"movement_type":"transaction"}'
