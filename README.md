[![Wever Agent Client Smoke Test](https://github.com/CodeWever/wever-labs-agent-client/actions/workflows/wever-agent-client-smoke.yml/badge.svg)](https://github.com/CodeWever/wever-labs-agent-client/actions/workflows/wever-agent-client-smoke.yml)

# Wever Labs External Agent Client Runner v1

Use these files to test Wever Labs from outside the site package. Tool access is free. Movement fees attach only to completed transaction or escrow movement.

Required checks:
1. Fetch `https://weverlabs.com/agents.json`.
2. Fetch `https://weverlabs.com/.well-known/mcp.json`.
3. POST JSON-RPC initialize to `https://weverlabs.com/api/mcp`.
4. POST tools/list.
5. Call `quote_movement_fee`.
6. Call `start_rail_run`.
7. Call `verify_receipt`.
8. Send or build an A2A callback.

Pass marker: `runner_state: passed` and `transcript_hash`.

## Public Agent Client Repo v1

This folder is GitHub-ready. It contains curl, Node, and Python examples that follow the same external agent path:

1. Read public discovery files.
2. Initialize MCP.
3. List tools.
4. Quote movement fee.
5. Start a rail run with an idempotency key.
6. Verify receipt.
7. Return and store transcript hashes.

Pass marker: `runner_state` is `passed` and a `transcript_hash` is returned.

## CI badge

The release package now includes `.github/workflows/wever-agent-client-smoke.yml` for a public repo smoke check. The badge record can be generated through `/api/public-repo-ci-badge` or the MCP tool `publish_public_repo_ci_badge`.

## Stripe test path

Before a paid production rail run, call `/api/stripe-movement-fee-checkout` or MCP tool `create_stripe_movement_fee_checkout` to create a Checkout Session for the quoted movement fee. Use the returned `payment_reference` in the rail run once payment is verified.
