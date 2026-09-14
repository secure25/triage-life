import type { ExtractionResult } from "./extraction";
import type { ExtractionEngine } from "./engine";

/**
 * Strands Agents SDK engine (AGENT_PROVIDER=strands).
 *
 * TODO: wired to the Strands TypeScript SDK once a model provider is
 * configured; see README "Agent setup". This placeholder exists so the
 * import boundary in engine.ts resolves and the fallback path is exercised
 * until the SDK integration is enabled.
 */
export class StrandsEngine implements ExtractionEngine {
  readonly name = "strands";
  readonly modelId = process.env.MODEL_ID ?? null;

  constructor() {
    throw new Error(
      "Strands engine is not configured yet — falling back to the " +
        "deterministic engine. See README for model-provider setup.",
    );
  }

  async extract(): Promise<ExtractionResult> {
    throw new Error("unreachable");
  }
}
