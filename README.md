[![Wever Agent Client Smoke Test](https://github.com/CodeWever/wever-labs-agent-client/actions/workflows/wever-agent-client-smoke.yml/badge.svg)](https://github.com/CodeWever/wever-labs-agent-client/actions/workflows/wever-agent-client-smoke.yml)

# Wever Labs Agent Client Smoke Test

Requires Node.js 22 or later. No package installation, credentials or wallet is required.

```sh
npm test
npm run smoke
# Equivalent compatibility entry point:
bash ./curl-smoke.sh
```

The client reads the public discovery JSON, initializes the supported MCP server at
`https://weverlabs.com/api/mcp`, sends the initialized notification, lists tools,
and calls the free `check_evidence_inventory` computation.

The synthetic input contains available labels `formation` and `accounts`, and
expected labels `formation`, `ownership` and `accounts`. The client verifies the
matched and missing labels, counts and 67% coverage. It independently recomputes
the input and result SHA256 hashes using recursively sorted JSON object keys and
checks that the MCP text and structured results agree.

HTTP failures, invalid JSON, JSON-RPC errors or mismatched IDs, missing tools,
tool errors, incorrect computations and hash mismatches exit nonzero. A successful
run emits one JSON line containing `runner_state: "passed"`,
`computation_verified: true`, `input_hash_verified: true`,
`result_hash_verified: true` and a client-computed `transcript_hash`.

This is synthetic acceptance of a supplied-label computation. It performs no
payment, transfer, callback or external task, and does not verify document
contents or a signed receipt.

Override the site origin with `WEVER_BASE` (or the older `BASE` variable):

```sh
WEVER_BASE=https://weverlabs.com npm run smoke
```

The GitHub workflow runs the regression tests, checks all five public descriptor
URLs and executes the same client on pushes to main, manual dispatch and the
existing weekly schedule. Bash pipeline failures propagate to the job.

The September 28 site reconciliation retired `/mcp-server.json` and
`/api/external-agent-client-runner`. The smoke test uses the current Labs MCP
contract instead of their old rail-run and receipt markers. The Python and
return-package scripts retained in this repository are historical examples of
the retired API and are not part of this supported smoke test.
