import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runSmoke } from '../wever-external-agent-client-node.mjs';

const BASE = 'https://smoke.example.test';
const INPUT = {
  available_evidence: ['formation', 'accounts'],
  expected_evidence: ['formation', 'ownership', 'accounts'],
};
const INVENTORY = JSON.parse(readFileSync(new URL('./fixtures/inventory-response.json', import.meta.url), 'utf8'));
const TOOL_NAMES = ['get_service_catalog', 'check_evidence_inventory', 'review_mcp_manifest', 'build_operator_brief', 'prepare_work_order'];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function computationFixture(change) {
  const reply = structuredClone(INVENTORY);
  change(reply.result.structuredContent);
  reply.result.content[0].text = JSON.stringify(reply.result.structuredContent);
  return reply;
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function harness(override = () => undefined) {
  const requests = [];
  const fetchImpl = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, BASE, 'The smoke must respect its configured base URL');
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) : undefined;
    const record = { method: request.method, path: url.pathname, body, headers: request.headers };
    requests.push(record);
    const replacement = override(record, requests.length - 1);
    if (replacement !== undefined) return replacement;
    if (request.method === 'GET' && url.pathname === '/agents.json') {
      return response({ name: 'Wever Labs', mcp: { endpoint: `${BASE}/api/mcp` } });
    }
    if (request.method === 'GET' && url.pathname === '/.well-known/mcp.json') {
      return response({ name: 'io.github.CodeWever/wever-labs-products', transport: { type: 'streamable-http', url: `${BASE}/api/mcp` } });
    }
    assert.equal(request.method, 'POST');
    assert.equal(url.pathname, '/api/mcp');
    assert.equal(body.jsonrpc, '2.0');
    if (body.method === 'initialize') {
      return response({ jsonrpc: '2.0', id: body.id, result: {
        protocolVersion: '2025-11-25', capabilities: { tools: {} },
        serverInfo: { name: 'wever-labs-agent-api', version: '0.1.0' },
      } });
    }
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') {
      return response({ jsonrpc: '2.0', id: body.id, result: { tools: TOOL_NAMES.map(name => ({
        name, inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      })) } });
    }
    assert.equal(body.method, 'tools/call', 'Only the supported smoke requests may be made');
    assert.equal(body.params.name, 'check_evidence_inventory');
    assert.deepEqual(body.params.arguments, INPUT);
    return response(structuredClone(INVENTORY));
  };
  return { requests, run: () => runSmoke({ base: BASE, fetchImpl }) };
}

async function rejectsAt(index, override) {
  const h = harness((request, current) => current === index ? override(request) : undefined);
  await assert.rejects(h.run());
  assert.equal(h.requests.length, index + 1, 'Stop at the failed response without reporting success or continuing');
}

test('performs discovery, MCP handshake, tool discovery and verified computation', async () => {
  const h = harness();
  const summary = await h.run();
  assert.equal(summary.runner_state, 'passed');
  assert.equal(summary.computation_verified, true);
  assert.equal(summary.input_hash_verified, true);
  assert.equal(summary.result_hash_verified, true);
  assert.match(summary.transcript_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(h.requests.map(({ method, path, body }) => [method, path, body?.method]), [
    ['GET', '/agents.json', undefined],
    ['GET', '/.well-known/mcp.json', undefined],
    ['POST', '/api/mcp', 'initialize'],
    ['POST', '/api/mcp', 'notifications/initialized'],
    ['POST', '/api/mcp', 'tools/list'],
    ['POST', '/api/mcp', 'tools/call'],
  ]);
  assert.equal(h.requests[2].body.id, 1);
  assert.equal(h.requests[2].body.params.protocolVersion, '2025-11-25');
  assert.equal(Object.hasOwn(h.requests[3].body, 'id'), false);
  assert.equal(h.requests[4].body.id, 2);
  assert.equal(h.requests[5].body.id, 3);
  for (const { headers } of h.requests) {
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.has('Payment-Signature'), false);
    assert.equal(headers.has('X-Wever-Wallet-Proof'), false);
  }
});

test('rejects a descriptor HTTP 404', () => rejectsAt(0, () => new Response('Not Found', { status: 404 })));
test('rejects a computation HTTP 404', () => rejectsAt(5, () => new Response('Not Found', { status: 404 })));
test('rejects malformed JSON instead of accepting an HTTP 200', () => rejectsAt(2, () => new Response('<html>error</html>', { status: 200 })));
test('rejects JSON-RPC errors', () => rejectsAt(2, ({ body }) => response({ jsonrpc: '2.0', id: body.id, error: { code: -32603, message: 'Internal error' } })));

for (const [label, index] of [['initialize', 2], ['tools/list', 4], ['tools/call', 5]]) {
  test(`rejects a mismatched ${label} response ID`, () => rejectsAt(index, () => {
    const reply = index === 5 ? structuredClone(INVENTORY) : {
      jsonrpc: '2.0', result: index === 2
        ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'wever-labs-agent-api', version: '0.1.0' } }
        : { tools: TOOL_NAMES.map(name => ({ name, inputSchema: { type: 'object' } })) },
    };
    reply.id = 'wrong-request-id';
    return response(reply);
  }));
}

test('rejects discovery without the required computation tool', () => rejectsAt(4, ({ body }) => response({
  jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'get_service_catalog', inputSchema: { type: 'object' } }] },
})));

test('rejects MCP tool errors inside an HTTP 200 response', () => rejectsAt(5, () => {
  const reply = structuredClone(INVENTORY);
  reply.result.isError = true;
  return response(reply);
}));

test('rejects wrong computed labels even when the server recomputes their digest', () => rejectsAt(5, () => response(computationFixture(body => {
  body.result.matched_evidence = ['formation', 'ownership'];
  body.result.missing_evidence = ['accounts'];
  body.result_sha256 = digest(body.result);
}))));

test('rejects a tampered input hash', () => rejectsAt(5, () => response(computationFixture(body => {
  body.input_sha256 = '0'.repeat(64);
}))));

test('rejects a tampered result hash', () => rejectsAt(5, () => response(computationFixture(body => {
  body.result_sha256 = '0'.repeat(64);
}))));
