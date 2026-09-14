import { ENV } from "../_core/env";
import { getDocumentStore } from "../storage";
import { DemoOcrProvider } from "./demo";
import { TextractOcrProvider } from "./textract";
import type { OcrProvider } from "./types";

export type { OcrInput, OcrProvider, OcrResult } from "./types";
export { OcrUnavailableError } from "./types";

function awsCredentialsLikelyPresent(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_PROFILE ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,
  );
}

let _provider: OcrProvider | null = null;

/**
 * Provider selection (spec §6): explicit OCR_PROVIDER wins; "auto" uses
 * Textract when AWS credentials look configured, otherwise the demo provider.
 */
export function getOcrProvider(): OcrProvider {
  if (_provider) return _provider;

  const store = getDocumentStore();
  if (
    ENV.ocrProvider === "textract" ||
    (ENV.ocrProvider === "auto" && awsCredentialsLikelyPresent())
  ) {
    _provider = new TextractOcrProvider(store);
  } else {
    _provider = new DemoOcrProvider(store);
  }
  return _provider;
}

/** Test seam: inject a provider. */
export function setOcrProvider(provider: OcrProvider | null): void {
  _provider = provider;
}
