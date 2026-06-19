const base = process.env.WEVER_BASE || 'https://weverlabs.com';
async function post(path, body) { const res = await fetch(base + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); return res.json(); }
const tools = await post('/api/mcp', { jsonrpc:'2.0', id:1, method:'tools/list' });
const run = await post('/api/external-agent-client-runner', { mode:'run_external_agent_client_runner', rail_key:process.env.RAIL_KEY || 'packetops', idempotency_key:'node-client-runner-001', movement_amount_units:1000, movement_type:'transaction' });
console.log(JSON.stringify({ tools_seen: Boolean(tools.result), runner_state: run.runner_state, transcript_hash: run.transcript_hash }, null, 2));
