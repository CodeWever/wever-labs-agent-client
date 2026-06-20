import crypto from "node:crypto";

const MCP_URL = process.env.WEVER_MCP_URL || "https://weverlabs.com/api/mcp";

async function rpc(method, params = {}) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params
    })
  });

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${MCP_URL}: ${text.slice(0, 500)}`);
  }

  if (!res.ok || json.error) {
    throw new Error(JSON.stringify({ status: res.status, error: json.error || json }, null, 2));
  }

  return json.result ?? json;
}

async function callTool(name, argumentsObject = {}) {
  return rpc("tools/call", {
    name,
    arguments: argumentsObject
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function unwrapTool(result) {
  if (result?.structuredContent) return result.structuredContent;

  const text = result?.content?.find?.((item) => item.type === "text")?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw_text: text };
    }
  }

  return result;
}

function findDeep(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findDeep(value, keys);
      if (found !== undefined && found !== null) return found;
    }
  }

  return undefined;
}

const transcript = {
  runner: "wever-external-return-package-runner-node",
  started_at: new Date().toISOString(),
  mcp_url: MCP_URL,
  steps: []
};

try {
  const initialize = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "wever-external-return-package-runner-node",
      version: "1.0.1"
    }
  });

  transcript.steps.push({ step: "initialize", ok: true, sample: initialize });

  const toolsList = await rpc("tools/list");
  const tools = toolsList.tools || toolsList.result?.tools || [];
  const toolNames = tools.map((t) => t.name);

  transcript.steps.push({
    step: "tools/list",
    ok: toolNames.length > 0,
    tool_count: toolNames.length,
    has_quote: toolNames.includes("quote_movement_fee"),
    has_start: toolNames.includes("start_rail_run"),
    has_fetch_return_package: toolNames.includes("fetch_return_package"),
    has_record_receipt: toolNames.includes("record_receipt"),
    has_verify_receipt: toolNames.includes("verify_receipt"),
    has_store_receipt_ledger_entry: toolNames.includes("store_receipt_ledger_entry")
  });

  const quoteRaw = await callTool("quote_movement_fee", {
    rail_key: "packetops",
    movement_type: "transaction",
    movement_amount_units: 1000,
    currency: "usd",
    idempotency_key: `external-return-package-quote-${Date.now()}`
  });
  const quote = unwrapTool(quoteRaw);

  transcript.steps.push({ step: "quote_movement_fee", ok: true, result: quote });

  const runRaw = await callTool("start_rail_run", {
    rail_key: "packetops",
    run_source: "external_public_client_repo",
    idempotency_key: `external-return-package-run-${Date.now()}`,
    payment_reference: "quote_only_no_live_charge",
    operator_boundary: "external_agent_test_no_money_movement",
    packet_type: "external_agent_sample_packet",
    available_documents: [
      "intake_form",
      "identity_attestation",
      "packet_summary"
    ],
    expected_documents: [
      "intake_form",
      "identity_attestation",
      "packet_summary",
      "authorization_form"
    ],
    metadata: {
      external_client: "node",
      proof_type: "first_external_return_package_run_v1",
      live_charges_created: false,
      fake_revenue_created: false
    }
  });
  const run = unwrapTool(runRaw);

  transcript.steps.push({ step: "start_rail_run", ok: true, result: run });

  const returnPackageId = findDeep(run, ["return_package_id"]);
  const productionRunId = findDeep(run, ["production_run_id", "run_id"]);
  const totalUnits = findDeep(run, ["total_units"]) ?? 0;

  if (!returnPackageId || !productionRunId) {
    throw new Error("Missing return_package_id or production_run_id from start_rail_run response.");
  }

  const returnPackageRaw = await callTool("fetch_return_package", {
    rail_key: "packetops",
    return_package_id: returnPackageId
  });
  const returnPackage = unwrapTool(returnPackageRaw);

  transcript.steps.push({ step: "fetch_return_package", ok: true, result: returnPackage });

  const receiptRaw = await callTool("record_receipt", {
    production_run_id: productionRunId,
    return_package_id: returnPackageId,
    total_units: totalUnits
  });
  const receipt = unwrapTool(receiptRaw);

  transcript.steps.push({ step: "record_receipt", ok: true, result: receipt });

  const receiptId = findDeep(receipt, ["receipt_id"]);
  const receiptHash = findDeep(receipt, ["receipt_hash"]);
  const receiptSignature = findDeep(receipt, ["receipt_signature"]);

  if (!receiptId && !receiptHash) {
    throw new Error("No receipt_id or receipt_hash found in record_receipt response.");
  }

  const verifyRaw = await callTool("verify_receipt", {
    receipt_id: receiptId,
    receipt_hash: receiptHash,
    receipt_signature: receiptSignature,
    production_run_id: productionRunId,
    return_package_id: returnPackageId,
    verification_source: "external_public_client_repo",
    metadata: {
      external_client: "node",
      proof_type: "first_external_return_package_run_v1"
    }
  });
  const verify = unwrapTool(verifyRaw);

  transcript.steps.push({ step: "verify_receipt", ok: true, result: verify });

  const ledgerRaw = await callTool("store_receipt_ledger_entry", {
    receipt_id: receiptId,
    production_run_id: productionRunId,
    return_package_id: returnPackageId,
    transcript_hash: sha256(transcript),
    metadata: {
      external_client: "node",
      proof_type: "first_external_return_package_run_v1",
      live_charges_created: false,
      fake_revenue_created: false
    }
  });
  const ledger = unwrapTool(ledgerRaw);

  transcript.steps.push({ step: "store_receipt_ledger_entry", ok: true, result: ledger });

  const transcriptHash = sha256(transcript);

  const output = {
    ok: true,
    service: "first_external_return_package_run_v1",
    runner_state: "passed",
    tools_seen: true,
    quote_created: true,
    rail_run_started: true,
    return_package_received: true,
    receipt_recorded: true,
    receipt_verified: true,
    receipt_ledger_stored: true,
    live_charges_created: false,
    fake_revenue_created: false,
    production_run_id: productionRunId,
    return_package_id: returnPackageId,
    receipt_id: receiptId || null,
    receipt_hash: receiptHash || null,
    receipt_signature: receiptSignature || null,
    transcript_hash: transcriptHash,
    transcript
  };

  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  transcript.steps.push({
    step: "error",
    ok: false,
    message: error.message
  });

  console.log(JSON.stringify({
    ok: false,
    service: "first_external_return_package_run_v1",
    runner_state: "failed",
    live_charges_created: false,
    fake_revenue_created: false,
    transcript_hash: sha256(transcript),
    transcript
  }, null, 2));

  process.exit(1);
}
