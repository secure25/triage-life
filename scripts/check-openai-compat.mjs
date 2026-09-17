/**
 * Verifies that an OpenAI-compatible endpoint can actually drive Triage's
 * agent loop, before you wire it into the app.
 *
 * A chat-only model is not enough: the Strands engine needs the model to emit
 * OpenAI-style tool calls (the seven Triage tools) and to return a final
 * structured result. Plenty of free endpoints answer chat but ignore `tools`,
 * silently producing an agent that never calls anything.
 *
 * Usage:
 *   OPENAI_API_KEY=... node scripts/check-openai-compat.mjs <base-url> <model-id>
 *
 * Example:
 *   OPENAI_API_KEY=sk-... node scripts/check-openai-compat.mjs \
 *     https://openrouter.ai/api/v1 deepseek/deepseek-chat-v3:free
 *
 * Exits 0 when the model answers chat AND returns a well-formed tool call.
 */
const [baseUrlArg, modelId] = process.argv.slice(2);

if (!baseUrlArg || !modelId) {
  console.error(
    "Usage: OPENAI_API_KEY=... node scripts/check-openai-compat.mjs <base-url> <model-id>",
  );
  process.exit(1);
}

// --- Endpoint validation ---------------------------------------------------
// Only http/https, never embedded credentials, and never link-local / cloud
// metadata addresses. Cleartext http is allowed only for loopback, so a local
// Ollama/vLLM server works without letting API keys travel unencrypted to a
// remote host.
function validateBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http/https are allowed, got ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("Refusing a URL with embedded credentials.");
  }
  const host = url.hostname.toLowerCase();
  if (/^169\.254\./.test(host)) {
    throw new Error("Refusing a link-local/cloud-metadata address.");
  }
  const isLoopback =
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    /^127\./.test(host);
  if (url.protocol === "http:" && !isLoopback) {
    throw new Error(
      "Cleartext http is only allowed for loopback hosts — use https for remote endpoints.",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

let baseUrl;
try {
  baseUrl = validateBaseUrl(baseUrlArg);
} catch (error) {
  console.error(`Endpoint rejected: ${error.message}`);
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Set OPENAI_API_KEY (or the provider's equivalent key).");
  process.exit(1);
}

const endpoint = `${baseUrl}/chat/completions`;
const headers = {
  "content-type": "application/json",
  authorization: `Bearer ${apiKey}`,
};

async function post(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { response, json, text };
}

console.log(`Endpoint: ${endpoint}`);
console.log(`Model:    ${modelId}\n`);

// --- Test 1: plain chat ----------------------------------------------------
console.log("1. Plain chat completion ...");
try {
  const { response, json, text } = await post({
    model: modelId,
    max_tokens: 32,
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
  });
  if (!response.ok) {
    console.log(`   ✗ HTTP ${response.status} — ${text.slice(0, 400)}`);
    process.exit(1);
  }
  const reply = json?.choices?.[0]?.message?.content ?? "(empty)";
  console.log(`   ✓ replied: ${String(reply).trim().slice(0, 60)}`);
} catch (error) {
  console.log(`   ✗ request failed: ${error.message}`);
  process.exit(1);
}

// --- Test 2: tool calling (the requirement that usually fails) -------------
console.log("\n2. Tool calling (no tool_choice — model decides) ...");
const tools = [
  {
    type: "function",
    function: {
      name: "get_document_text",
      description: "Return the OCR text of the document being processed.",
      parameters: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Id of the document" },
        },
        required: ["documentId"],
      },
    },
  },
];

try {
  const { response, json, text } = await post({
    model: modelId,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content:
          "You must call the get_document_text tool for document id 'doc-123'. " +
          "Do not answer in prose — call the tool.",
      },
    ],
    tools,
  });

  if (!response.ok) {
    console.log(`   ✗ HTTP ${response.status} — ${text.slice(0, 400)}`);
    console.log(
      "\n   This endpoint/model does not accept the `tools` parameter, so it " +
        "cannot drive the Triage agent loop.",
    );
    process.exit(1);
  }

  const toolCalls = json?.choices?.[0]?.message?.tool_calls ?? [];
  if (toolCalls.length === 0) {
    const said = json?.choices?.[0]?.message?.content ?? "(nothing)";
    console.log(`   ✗ no tool_calls returned; model replied in prose: ${String(said).slice(0, 160)}`);
    console.log(
      "\n   The endpoint accepts `tools` but the model ignored them. The agent " +
        "would extract nothing. Pick a model with stronger function calling.",
    );
    process.exit(1);
  }

  const call = toolCalls[0];
  const name = call?.function?.name;
  let args = null;
  try {
    args = JSON.parse(call?.function?.arguments ?? "");
  } catch {
    /* handled below */
  }
  console.log(`   ✓ tool call: ${name}(${call?.function?.arguments ?? ""})`);
  if (name !== "get_document_text" || !args || typeof args.documentId !== "string") {
    console.log("   ✗ tool call was malformed (wrong name or unparseable arguments).");
    process.exit(1);
  }
  console.log(`   ✓ arguments parsed: documentId=${args.documentId}`);
} catch (error) {
  console.log(`   ✗ request failed: ${error.message}`);
  process.exit(1);
}

// --- Test 3: forced tool_choice --------------------------------------------
// The Strands agent sends `tool_choice` when it forces its structured-output
// tool, so an endpoint that rejects that parameter breaks the agent's final
// structured result even though plain tool calling works.
console.log("\n3. Forced tool_choice (what Strands sends for structured output) ...");
try {
  const { response, json, text } = await post({
    model: modelId,
    max_tokens: 256,
    messages: [
      { role: "user", content: "Call the get_document_text tool for 'doc-123'." },
    ],
    tools,
    tool_choice: { type: "function", function: { name: "get_document_text" } },
  });

  if (!response.ok) {
    console.log(`   ✗ HTTP ${response.status} — ${text.slice(0, 300)}`);
    console.log(
      "\n   The endpoint REJECTS tool_choice. Strands sends it when forcing the " +
        "structured-output tool, so the agent's final structured result will " +
        "fail here. Chat and ordinary tool calls still work; structured output " +
        "is the part at risk.",
    );
    process.exit(2);
  }

  const calls = json?.choices?.[0]?.message?.tool_calls ?? [];
  if (calls.length > 0) {
    console.log(`   ✓ honoured: ${calls[0]?.function?.name}(...)`);
  } else {
    console.log(
      "   ⚠ accepted but ignored (no tool_calls) — the parameter is tolerated, " +
        "so the agent's forced structured-output call may return prose instead.",
    );
  }
} catch (error) {
  console.log(`   ✗ request failed: ${error.message}`);
}

console.log(
  "\n✓ This endpoint supports chat + well-formed tool calls — usable with " +
    "STRANDS_MODEL_PROVIDER=openai.\n" +
    "  Note: agent quality also depends on the model reliably chaining several " +
    "tool calls; the Triage engine has a reconciliation pass, but a weak model " +
    "produces a weaker trace.\n",
);
