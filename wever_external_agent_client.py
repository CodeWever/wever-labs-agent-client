import json, os, urllib.request
BASE = os.environ.get('WEVER_BASE', 'https://weverlabs.com')
def post(path, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(BASE + path, data=data, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))
tools = post('/api/mcp', {'jsonrpc':'2.0','id':1,'method':'tools/list'})
run = post('/api/external-agent-client-runner', {'mode':'run_external_agent_client_runner','rail_key':os.environ.get('RAIL_KEY','packetops'),'idempotency_key':'python-client-runner-001','movement_amount_units':1000,'movement_type':'transaction'})
print(json.dumps({'tools_seen': bool(tools.get('result')), 'runner_state': run.get('runner_state'), 'transcript_hash': run.get('transcript_hash')}, indent=2))
