import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const protocolVersion = '2025-11-25';
const inventoryInput = {
  available_evidence: ['formation', 'accounts'],
  expected_evidence: ['formation', 'ownership', 'accounts'],
};

// The Labs contract hashes JSON with recursively sorted object keys.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export async function runSmoke({ base = 'https://weverlabs.com', fetchImpl = globalThis.fetch } = {}) {
  const transcript = [];
  async function request(path, payload) {
    const url = new URL(path, base).href;
    const response = await fetchImpl(url, {
      method: payload ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json, text/event-stream',
        ...(payload ? { 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocolVersion } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    assert.ok(response.ok, path + ': HTTP ' + response.status);
    const text = await response.text();
    if (payload && !Object.hasOwn(payload, 'id')) {
      assert.equal(response.status, 202, 'MCP notification must be accepted');
      assert.equal(text, '', 'MCP notification must not return a body');
      transcript.push({ path, request: payload, status: response.status });
      return;
    }
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(path + ': invalid JSON response'); }
    assert.ok(object(body), path + ': response must be a JSON object');
    transcript.push({ path, request: payload ?? null, response: body });
    return body;
  }
  async function rpc(id, method, params) {
    const reply = await request('/api/mcp', { jsonrpc: '2.0', id, method, params });
    assert.equal(reply.jsonrpc, '2.0', method + ': invalid JSON-RPC version');
    assert.equal(reply.id, id, method + ': response ID mismatch');
    assert.ok(!Object.hasOwn(reply, 'error'), method + ': JSON-RPC error ' + JSON.stringify(reply.error));
    assert.ok(object(reply.result), method + ': missing result');
    return reply.result;
  }

  await request('/agents.json');
  await request('/.well-known/mcp.json');
  const initialized = await rpc(1, 'initialize', {
    protocolVersion, capabilities: {},
    clientInfo: { name: 'wever-labs-agent-client-smoke', version: '1.1.0' },
  });
  assert.equal(initialized.protocolVersion, protocolVersion, 'Unsupported MCP protocol');
  assert.ok(object(initialized.capabilities?.tools), 'Server must support tools');
  assert.equal(initialized.serverInfo?.name, 'wever-labs-agent-api', 'Unexpected MCP server');
  await request('/api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' });

  const listed = await rpc(2, 'tools/list', {});
  assert.ok(Array.isArray(listed.tools), 'tools/list must contain tools');
  assert.ok(listed.tools.some(tool => tool.name === 'check_evidence_inventory'), 'Evidence inventory tool missing');
  const called = await rpc(3, 'tools/call', { name: 'check_evidence_inventory', arguments: inventoryInput });
  assert.equal(called.isError, false, 'Evidence inventory tool returned an error');
  const output = called.structuredContent;
  assert.ok(object(output), 'Missing structured computation result');
  assert.equal(output.ok, true);
  assert.equal(output.execution, 'completed');
  assert.equal(output.service_id, 'com.weverlabs/diligenceops-inventory');
  assert.equal(output.operation, 'evidence_inventory');
  assert.equal(output.provenance?.kind, 'deterministic_computation');
  assert.equal(output.provenance?.signature, 'none');
  const result = output.result;
  assert.ok(object(result), 'Missing inventory result');
  assert.equal(result.operation, 'evidence_inventory');
  assert.equal(result.matching, 'trimmed_ascii_case_insensitive_exact');
  assert.deepEqual(result.available_evidence, inventoryInput.available_evidence);
  assert.deepEqual(result.expected_evidence, inventoryInput.expected_evidence);
  assert.deepEqual(result.matched_evidence, ['formation', 'accounts']);
  assert.deepEqual(result.missing_evidence, ['ownership']);
  assert.deepEqual(result.unexpected_evidence, []);
  assert.deepEqual(result.counts, { available: 2, expected: 3, matched: 2, missing: 1, unexpected: 0 });
  assert.equal(result.coverage_percentage, 67);
  assert.equal(result.complete_label_coverage, false);
  assert.equal(output.input_sha256, digest(inventoryInput), 'Input hash mismatch');
  assert.equal(output.result_sha256, digest(result), 'Result hash mismatch');
  assert.ok(Array.isArray(called.content), 'Missing MCP text content');
  const content = called.content.find(item => item.type === 'text');
  assert.ok(content, 'Missing MCP text result');
  assert.deepEqual(JSON.parse(content.text), output, 'Text and structured results disagree');

  return {
    runner_state: 'passed', evidence_kind: 'synthetic_acceptance',
    endpoint: new URL('/api/mcp', base).href, tools_seen: listed.tools.length,
    computation_verified: true, input_hash_verified: true, result_hash_verified: true,
    transcript_hash: digest(transcript),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runSmoke({ base: process.env.WEVER_BASE || process.env.BASE || 'https://weverlabs.com' })));
  } catch (error) {
    console.error('Smoke test failed: ' + error.message);
    process.exitCode = 1;
  }
}
