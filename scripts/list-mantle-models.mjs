/**
 * Lists the models available on Bedrock's Mantle endpoint in a region.
 *
 * Mints a short-term bearer token from the standard AWS credential chain
 * (via @aws/bedrock-token-generator), then calls GET /v1/models on
 * https://bedrock-mantle.<region>.api.aws.
 *
 * Usage:
 *   node scripts/list-mantle-models.mjs [region]
 * Region defaults to AWS_REGION / AWS_DEFAULT_REGION.
 */
import { getTokenProvider } from "@aws/bedrock-token-generator";

const region =
  process.argv[2] ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
if (!region) {
  console.error(
    "Pass a region (e.g. `node scripts/list-mantle-models.mjs us-east-1`) " +
      "or set AWS_REGION.",
  );
  process.exit(1);
}

// Only https, and only the public Bedrock Mantle host for the chosen region —
// never localhost, loopback, or private addresses.
const host = `bedrock-mantle.${region}.api.aws`;
const url = new URL(`https://${host}/v1/models`);
if (url.protocol !== "https:" || url.hostname !== host) {
  throw new Error(`Refusing unexpected endpoint: ${url.toString()}`);
}

console.log(`Minting bearer token for ${host} ...`);
const provideToken = getTokenProvider({ region });
const token = await provideToken();

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) {
  console.error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  const body = await response.text().catch(() => "");
  if (body) console.error(body.slice(0, 2000));
  process.exit(1);
}

const body = await response.json();
const models = (body.data ?? body.models ?? []).map(
  m => `${m.id}${m.owned_by ? `  (${m.owned_by})` : ""}`,
);
console.log(`\n${models.length} model(s) available on Mantle in ${region}:\n`);
console.log(models.sort().join("\n"));
console.log(
  "\nTip: pass one of the anthropic.* ids as MODEL_ID with " +
    "STRANDS_MODEL_PROVIDER=bedrock-mantle.",
);
