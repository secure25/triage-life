/**
 * Checks what Claude models this AWS account can actually INVOKE on Bedrock.
 *
 * Runs entirely outside the app, using the standard AWS credential chain, so it
 * separates an account-level block from anything in Triage's code.
 *
 *  1. Control plane  — lists Anthropic models visible to the account and each
 *                      model's agreement/authorization/entitlement status.
 *  2. Data plane     — optionally invokes a model (Converse, maxTokens=16) to
 *                      prove whether inference itself is permitted.
 *
 * Usage:
 *   node scripts/check-bedrock-access.mjs <region> [--invoke <model-id>]
 *
 * Example:
 *   node scripts/check-bedrock-access.mjs us-east-1
 *   node scripts/check-bedrock-access.mjs us-east-1 --invoke global.anthropic.claude-sonnet-4-6
 *
 * Interpreting the result:
 *  - Every model listing 0 / NOT_AVAILABLE, or Converse returning
 *    "Operation not allowed" / "is not available for this account", means the
 *    block is on the ACCOUNT, not on IAM, the model id, or the app. AWS support
 *    has to clear it.
 *  - Models listed AVAILABLE that still fail to invoke with an access error are
 *    the account-level restriction case AWS documents explicitly.
 */
import {
  BedrockClient,
  GetFoundationModelAvailabilityCommand,
  ListFoundationModelsCommand,
} from "@aws-sdk/client-bedrock";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const args = process.argv.slice(2);
const invokeIndex = args.indexOf("--invoke");
const invokeModelId = invokeIndex >= 0 ? args[invokeIndex + 1] : undefined;
const region =
  args.find((a, i) => !a.startsWith("--") && i !== invokeIndex + 1) ??
  process.env.AWS_REGION ??
  process.env.AWS_DEFAULT_REGION;

if (!region || !/^[a-z]{2}(-[a-z]+)+-[0-9]+$/.test(region)) {
  console.error(
    "Pass a valid AWS region, e.g. `node scripts/check-bedrock-access.mjs us-east-1`.",
  );
  process.exit(1);
}

const control = new BedrockClient({ region });
const runtime = new BedrockRuntimeClient({ region });

console.log(`Region: ${region}`);
console.log(
  "(Credentials come from the standard AWS chain — same ones the app uses.)\n",
);

// --- 1. Control plane: models visible to this account ---------------------
let models = [];
try {
  const listed = await control.send(
    new ListFoundationModelsCommand({ byProvider: "anthropic" }),
  );
  models = (listed.modelSummaries ?? []).filter(m =>
    (m.modelId ?? "").startsWith("anthropic."),
  );
} catch (error) {
  console.error(
    `ListFoundationModels failed: ${error.name}: ${error.message}\n` +
      "(A failure here usually means credentials are missing or lack bedrock:ListFoundationModels.)",
  );
}

if (models.length === 0) {
  console.log("No Anthropic models are visible to this account in this region.");
} else {
  console.log(`${models.length} Anthropic model(s) visible to this account:\n`);
  for (const model of models) {
    const lifecycle = model.modelLifecycle?.status ?? "?";
    const streaming = model.responseStreamingSupported ? "stream" : "-";
    const inference = (model.inferenceTypesSupported ?? []).join(",") || "-";
    let availability = "";
    try {
      const status = await control.send(
        new GetFoundationModelAvailabilityCommand({ modelId: model.modelId }),
      );
      availability = [
        status.agreementAvailability?.status ?? "?",
        status.authorizationStatus ?? "?",
        status.entitlementAvailability ?? "?",
      ].join("/");
    } catch (error) {
      availability = `unavailable (${error.name})`;
    }
    console.log(`  ${model.modelId}`);
    console.log(
      `      lifecycle=${lifecycle} ${streaming} inference=${inference}`,
    );
    console.log(
      `      agreement/authorization/entitlement = ${availability}`,
    );
  }
}

// --- 2. Data plane: does an actual invocation succeed? --------------------
if (!invokeModelId) {
  console.log(
    "\nSkipped the invocation test. Re-run with --invoke <model-id> to prove " +
      "whether inference itself is allowed, e.g.\n" +
      "  node scripts/check-bedrock-access.mjs " +
      `${region} --invoke global.anthropic.claude-sonnet-4-6`,
  );
  process.exit(0);
}

console.log(`\nInvoking ${invokeModelId} via Converse (maxTokens=16) ...`);
try {
  const response = await runtime.send(
    new ConverseCommand({
      modelId: invokeModelId,
      messages: [{ role: "user", content: [{ text: "Reply with the word OK." }] }],
      inferenceConfig: { maxTokens: 16, temperature: 0 },
    }),
  );
  const text = response.output?.message?.content?.[0]?.text ?? "(no text)";
  console.log(`  ✓ INVOCATION SUCCEEDED — model replied: ${text}`);
  console.log(
    "\n  Anthropic model access works for this account. If the app still fails, " +
      "the problem is in the app's configuration (provider, model id, region).",
  );
} catch (error) {
  console.log(`  ✗ INVOCATION FAILED — ${error.name}: ${error.message}`);
  console.log(
    "\n  The failure is on the AWS side, not in the app. If the message says " +
      '"Operation not allowed" or "is not available for this account", AWS ' +
      "documents this as an account-level restriction: no IAM policy, console " +
      "setting, or region change fixes it — only AWS Support can clear it. " +
      "See https://repost.aws/knowledge-center/bedrock-invokemodel-api-error",
  );
}
