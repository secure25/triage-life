import { buildSyntheticDocument } from "../demo/documents";
import type { DocumentStore } from "../storage";
import { OcrUnavailableError, type OcrInput, type OcrProvider, type OcrResult } from "./types";

const MARKER_PATTERN = /TRIAGE-SYNTHETIC:([a-z0-9-]+)/;

/**
 * Deterministic demo OCR provider (spec §6). Recognizes the small set of
 * clearly labeled synthetic demo documents by their embedded marker and
 * returns realistic page-level text. Everything else fails with a clear,
 * actionable error — the project must run without production OCR credentials,
 * but it must never fake OCR for real documents.
 */
export class DemoOcrProvider implements OcrProvider {
  readonly name = "demo";

  constructor(private store: DocumentStore) {}

  async extractText(input: OcrInput): Promise<OcrResult> {
    const stored = await this.store.get(input.storageKey);
    if (!stored) {
      throw new OcrUnavailableError(
        "The original file could not be read from storage.",
      );
    }

    // Markers are plain ASCII inside the uncompressed PDF content stream,
    // so a byte-level scan is enough — no PDF parsing required.
    const raw = stored.data.toString("latin1");
    const match = MARKER_PATTERN.exec(raw);
    if (!match) {
      throw new OcrUnavailableError(
        "OCR is not configured: only synthetic demo documents can be read " +
          "without production OCR credentials. Set OCR_PROVIDER=textract with " +
          "AWS credentials to process real documents.",
      );
    }

    const built = buildSyntheticDocument(match[1]!);
    if (!built) {
      throw new OcrUnavailableError(
        `Unknown synthetic document marker "${match[1]}".`,
      );
    }

    const pages = built.ocrPages;
    const text = pages.map(page => page.text).join("\n\n");
    const confidences = pages
      .map(page => page.confidence)
      .filter((value): value is number => typeof value === "number");
    const confidence =
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : null;

    return { text, pages, confidence, provider: this.name };
  }
}
