import { ENV } from "../_core/env";
import { extractFromText, ExtractionUnavailableError, type ExtractionResult } from "./extraction";

/**
 * Extraction engine boundary. The deterministic engine parses the labeled
 * synthetic demo documents with no external dependencies. A Strands engine
 * (Strands Agents SDK + configured model provider) handles real documents
 * when AGENT_PROVIDER=strands is configured — see README for setup.
 */

export interface ExtractionEngine {
  readonly name: string;
  readonly modelId: string | null;
  extract(text: string, ocrConfidence: number | null): Promise<ExtractionResult>;
}

export class DeterministicEngine implements ExtractionEngine {
  readonly name = "deterministic";
  readonly modelId = null;

  async extract(text: string, ocrConfidence: number | null): Promise<ExtractionResult> {
    return extractFromText(text, ocrConfidence);
  }
}

let _enginePromise: Promise<ExtractionEngine> | null = null;

export function getExtractionEngine(): Promise<ExtractionEngine> {
  if (_enginePromise) return _enginePromise;

  if (ENV.agentProvider === "strands") {
    // Loaded lazily so the app still boots without the Strands SDK installed.
    _enginePromise = import("./strands")
      .then(({ StrandsEngine }) => new StrandsEngine() as ExtractionEngine)
      .catch(error => {
        console.warn(
          "[Agent] AGENT_PROVIDER=strands but the Strands engine is unavailable " +
            `(${error instanceof Error ? error.message : String(error)}). ` +
            "Falling back to the deterministic engine.",
        );
        return new DeterministicEngine() as ExtractionEngine;
      });
  } else {
    _enginePromise = Promise.resolve(new DeterministicEngine());
  }
  return _enginePromise;
}

/** Test seam. */
export function setExtractionEngine(engine: ExtractionEngine | null): void {
  _enginePromise = engine ? Promise.resolve(engine) : null;
}

export { ExtractionUnavailableError };
