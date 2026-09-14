import type { OcrPage } from "../../drizzle/schema";
import type { DocumentStore } from "../storage";
import {
  OcrUnavailableError,
  type OcrInput,
  type OcrProvider,
  type OcrResult,
} from "./types";

/**
 * Local text-extraction provider (no cloud, no cost).
 *
 * Reads the text directly out of documents that already contain it:
 * - PDFs with an embedded text layer (most portal downloads, our synthetic
 *   demo documents) — extracted exactly, confidence 0.99.
 * - DOCX files — raw text via mammoth.
 *
 * Scanned PDFs (no text layer) and images have no embedded text; those are
 * delegated to the scan fallback (Textract) when one is configured. This
 * provider never fakes text it cannot read.
 */

/** Below this many characters per page, a PDF is treated as scanned. */
const MIN_TEXT_CHARS_PER_PAGE = 30;

export class LocalTextProvider implements OcrProvider {
  readonly name = "local-text";

  constructor(
    private store: DocumentStore,
    /** Provider for scanned PDFs / images (typically Textract). */
    private scanFallback: OcrProvider | null,
  ) {}

  async extractText(input: OcrInput): Promise<OcrResult> {
    const stored = await this.store.get(input.storageKey);
    if (!stored) {
      throw new OcrUnavailableError(
        "The original file could not be read from storage.",
      );
    }

    if (input.mimeType === "application/pdf") {
      return this.extractPdf(stored.data, input);
    }
    if (
      input.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return this.extractDocx(stored.data);
    }
    if (input.mimeType === "image/png" || input.mimeType === "image/jpeg") {
      return this.delegateToScanFallback(
        input,
        "Images have no embedded text — they always need real OCR.",
      );
    }

    throw new OcrUnavailableError(
      `No local extractor available for ${input.mimeType} files.`,
    );
  }

  private async extractPdf(bytes: Buffer, input: OcrInput): Promise<OcrResult> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Headless text extraction only — pdfjs's font-substitution warnings
    // (it cannot fetch its bundled font files via file:// in Node) are noise
    // here; real failures still throw. verbosity 0 = errors only.
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      verbosity: 0,
    });

    let doc: Awaited<typeof loadingTask.promise>;
    try {
      doc = await loadingTask.promise;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "PasswordException") {
        throw new OcrUnavailableError(
          "This PDF is password-protected. Remove the password and upload it again.",
        );
      }
      throw error;
    }

    try {
      const pages: OcrPage[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          text += item.str;
          if (item.hasEOL) text += "\n";
        }
        pages.push({
          pageNumber,
          text: text.replace(/\n{3,}/g, "\n\n").trim(),
          confidence: 0.99,
        });
      }

      const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
      const hasTextLayer =
        pages.length > 0 && totalChars / pages.length >= MIN_TEXT_CHARS_PER_PAGE;

      if (!hasTextLayer) {
        return this.delegateToScanFallback(
          input,
          "This PDF has no embedded text layer — it looks like a scan. " +
            "Scanned documents need real OCR.",
        );
      }

      const text = pages.map(page => page.text).join("\n\n");
      return { text, pages, confidence: 0.99, provider: this.name };
    } finally {
      await loadingTask.destroy();
    }
  }

  private async extractDocx(bytes: Buffer): Promise<OcrResult> {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    const text = result.value.trim();
    if (text.length === 0) {
      throw new OcrUnavailableError(
        "This document contains no extractable text.",
      );
    }
    return {
      text,
      pages: [{ pageNumber: 1, text, confidence: 0.99 }],
      confidence: 0.99,
      provider: this.name,
    };
  }

  private async delegateToScanFallback(
    input: OcrInput,
    reason: string,
  ): Promise<OcrResult> {
    if (this.scanFallback) {
      return this.scanFallback.extractText(input);
    }
    throw new OcrUnavailableError(
      `${reason} Configure OCR_PROVIDER=textract with activated AWS Textract ` +
        "(image scans are the one document kind that needs it).",
    );
  }
}
