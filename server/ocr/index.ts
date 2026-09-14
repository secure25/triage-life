import { ENV } from "../_core/env";
import { getDocumentStore } from "../storage";
import { DemoOcrProvider } from "./demo";
import { LocalTextProvider } from "./local";
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
 * Provider selection (spec §6):
 * - "auto" (default): read embedded text directly (PDF text layers, DOCX) —
 *   instant, free, exact. Scanned PDFs and images fall back to Textract when
 *   AWS credentials look configured.
 * - "demo": synthetic demo documents only (canned OCR text).
 * - "textract": force Amazon Textract for everything.
 */
export function getOcrProvider(): OcrProvider {
  if (_provider) return _provider;

  const store = getDocumentStore();

  if (ENV.ocrProvider === "textract") {
    _provider = new TextractOcrProvider(store);
  } else if (ENV.ocrProvider === "demo") {
    _provider = new DemoOcrProvider(store);
  } else {
    const scanFallback = awsCredentialsLikelyPresent()
      ? new TextractOcrProvider(store)
      : null;
    _provider = new LocalTextProvider(store, scanFallback);
  }
  return _provider;
}

/** Test seam: inject a provider. */
export function setOcrProvider(provider: OcrProvider | null): void {
  _provider = provider;
}
