/**
 * Diagnostics for Bedrock's Mantle endpoint in a region.
 *
 * 1. Lists the models on the OpenAI-compatible surface (GET /v1/models).
 * 2. Probes candidate Anthropic model ids via the Messages API
 *    (POST /anthropic/v1/messages, max_tokens=1) and reports which are
 *    available to this AWS account.
 *
 * Usage:
 *   node scripts/list-mantle-models.mjs <region> [extra-model-id ...]
 *
 * Requires AWS credentials in the standard chain. Bearer tokens are minted
 * via @aws/bedrock-token-generator.
 */
import { getTokenProvider } from "@aws/bedrock-token-generator";

const region = process.argv[2];
if (!region || !/^[a-z]{2}(-[a-z]+)+-[0-9]+$/.test(region)) {
  console.error(
    "Pass a valid region (e.g. `node scripts/list-mantle-models.mjs us-east-1`).",
  );
  process.exit(1);
}
const extraIds = process.argv.slice(3);

// Only the public Bedrock Mantle host for the chosen region is ever
// contacted — never localhost, loopback, or private addresses.
const host = `bedrock-mantle.${region}.api.aws`;

const CANDIDATE_CLAUDE_IDS = [
  "anthropic.claude-opus-4-8",
  "anthropic.claude-sonnet-5",
  "anthropic.claude-sonnet-4-6",
  "anthropic.claude-opus-4-6",
  "anthropic.claude-sonnet-4-5",
  "anthropic.claude-haiku-4-5",
  "anthropic.claude-3-7-sonnet",
  "anthropic.claude-3-5-haiku",
  ...extraIds,
];

console.log(`Minting bearer token for ${host} ...`);
const provideToken = getTokenProvider({ region });
const token = await provideToken();
const headers = { Authorization: `Bearer ${token}` };

// --- 1. OpenAI-compatible surface catalog --------------------------------
const modelsUrl = new URL(`https://${host}/v1/models`);
if (modelsUrl.protocol !== "https:" || modelsUrl.hostname !== host) {
  throw new Error(`Refusing unexpected endpoint: ${modelsUrl.toString()}`);
}
const modelsResponse = await fetch(modelsUrl, { headers });
if (modelsResponse.ok) {
  const body = await modelsResponse.json();
  const models = (body.data ?? body.models ?? []).map(m => m.id).sort();
  console.log(`\n${models.length} model(s) on the OpenAI-compatible surface:`);
  console.log(models.join("\n"));
  console.log("(Note: Claude models are served via the Messages API and may not appear here.)");
} else {
  console.error(`GET /v1/models failed: ${modelsResponse.status} ${modelsResponse.statusText}`);
}

// --- 2. Probe Claude availability via the Messages API -------------------
console.log(`\nProbing Claude model ids via ${host}/anthropic/v1/messages ...`);
console.log("(Each probe is a max_tokens=1 request; rejected ids cost nothing.)\n");

let anyAvailable = false;
for (const modelId of CANDIDATE_CLAUDE_IDS) {
  const messagesUrl = new URL(`https://${host}/anthropic/v1/messages`);
  if (messagesUrl.protocol !== "https:" || messagesUrl.hostname !== host) {
    throw new Error(`Refusing unexpected endpoint: ${messagesUrl.toString()}`);
  }
  const response = await fetch(messagesUrl, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.ok) {
    console.log(`  ✓ ${modelId} — AVAILABLE`);
    anyAvailable = true;
  } else {
    const message =
      body?.error?.message ?? `${response.status} ${response.statusText}`;
    console.log(`  ✗ ${modelId} — ${message}`);
  }
}

if (!anyAvailable) {
  console.log(
    "\nNo probed Claude id is available. Check the Bedrock console → Model access " +
      `for ${region}, and request access to Anthropic Claude models if none are enabled.`,
  );
} else {
  console.log(
    "\nSet MODEL_ID to one of the ✓ ids above with STRANDS_MODEL_PROVIDER=bedrock-mantle.",
  );
}
