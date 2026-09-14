import type { OcrPage } from "../../drizzle/schema";

/**
 * OCR is a replaceable service boundary (spec §6). Providers receive a
 * storage key and read the bytes from object storage themselves.
 */
export interface OcrInput {
  storageKey: string;
  mimeType: string;
  sha256: string;
}

export interface OcrResult {
  text: string;
  pages: OcrPage[];
  /** Overall confidence 0..1 when the provider can estimate it. */
  confidence: number | null;
  provider: string;
}

export interface OcrProvider {
  readonly name: string;
  extractText(input: OcrInput): Promise<OcrResult>;
}

/** Thrown when no provider can handle the document (missing credentials). */
export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrUnavailableError";
  }
}
