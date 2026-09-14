import {
  DetectDocumentTextCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import type { OcrPage } from "../../drizzle/schema";
import { S3DocumentStore, type DocumentStore } from "../storage";
import { OcrUnavailableError, type OcrInput, type OcrProvider, type OcrResult } from "./types";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 45; // ~90 seconds, then fail visibly
const SYNC_RETRIES = 3;

function isRetryable(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? "";
  return (
    name === "ThrottlingException" ||
    name === "ProvisionedThroughputExceededException" ||
    name === "ServiceUnavailable" ||
    name === "TooManyRequestsException" ||
    name === "InternalServerError"
  );
}

async function withRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SYNC_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
      await new Promise(resolve =>
        setTimeout(resolve, 250 * Math.pow(2, attempt)),
      );
    }
  }
  throw lastError;
}

/**
 * Amazon Textract OCR provider (spec §6). Images are processed synchronously
 * with inline bytes; PDFs run as async detection jobs, which require the
 * document to live in S3 (STORAGE_DRIVER=s3).
 */
export class TextractOcrProvider implements OcrProvider {
  readonly name = "textract";
  private client: TextractClient;

  constructor(private store: DocumentStore) {
    this.client = new TextractClient({});
  }

  async extractText(input: OcrInput): Promise<OcrResult> {
    const stored = await this.store.get(input.storageKey);
    if (!stored) {
      throw new OcrUnavailableError(
        "The original file could not be read from storage.",
      );
    }

    if (input.mimeType === "image/png" || input.mimeType === "image/jpeg") {
      return this.extractImage(stored.data);
    }
    if (input.mimeType === "application/pdf") {
      return this.extractPdf(input.storageKey);
    }
    throw new OcrUnavailableError(
      `Textract cannot process ${input.mimeType} files.`,
    );
  }

  private async extractImage(bytes: Buffer): Promise<OcrResult> {
    const response = await withRetries(() =>
      this.client.send(
        new DetectDocumentTextCommand({ Document: { Bytes: bytes } }),
      ),
    );

    const lines = (response.Blocks ?? []).filter(
      block => block.BlockType === "LINE",
    );
    const text = lines.map(line => line.Text ?? "").join("\n");
    const confidences = lines
      .map(line => line.Confidence)
      .filter((value): value is number => typeof value === "number");
    const confidence =
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) /
          confidences.length /
          100
        : null;

    const pages: OcrPage[] = [
      { pageNumber: 1, text, confidence: confidence ?? undefined },
    ];
    return { text, pages, confidence, provider: this.name };
  }

  private async extractPdf(storageKey: string): Promise<OcrResult> {
    if (!(this.store instanceof S3DocumentStore)) {
      throw new OcrUnavailableError(
        "Textract processes PDFs as async jobs, which require the document " +
          "in S3. Set STORAGE_DRIVER=s3 (with S3_BUCKET) to OCR PDFs.",
      );
    }

    const location = this.store.s3Location(storageKey);
    const start = await this.client.send(
      new StartDocumentTextDetectionCommand({
        DocumentLocation: {
          S3Object: { Bucket: location.bucket, Name: location.key },
        },
      }),
    );
    if (!start.JobId) {
      throw new Error("Textract did not return a job id");
    }

    // Bounded polling — never retry forever (spec §6).
    let pages: OcrPage[] = [];
    for (let poll = 0; poll < MAX_POLLS; poll++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await this.client.send(
        new GetDocumentTextDetectionCommand({ JobId: start.JobId }),
      );
      if (response.JobStatus === "IN_PROGRESS") continue;
      if (response.JobStatus !== "SUCCEEDED") {
        throw new Error(
          `Textract job failed: ${response.JobStatus ?? "unknown"} ` +
            `(${response.StatusMessage ?? "no detail"})`,
        );
      }

      pages = this.aggregateBlocks(response.Blocks ?? []);
      let nextToken = response.NextToken;
      while (nextToken) {
        const nextPage = await this.client.send(
          new GetDocumentTextDetectionCommand({
            JobId: start.JobId,
            NextToken: nextToken,
          }),
        );
        pages = mergePages(pages, this.aggregateBlocks(nextPage.Blocks ?? []));
        nextToken = nextPage.NextToken;
      }
      break;
    }

    if (pages.length === 0) {
      throw new Error(
        `Textract job did not finish within ${MAX_POLLS * POLL_INTERVAL_MS / 1000}s`,
      );
    }

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

  private aggregateBlocks(
    blocks: Array<{
      BlockType?: string;
      Text?: string;
      Confidence?: number;
      Page?: number;
    }>,
  ): OcrPage[] {
    const byPage = new Map<number, { lines: string[]; confidences: number[] }>();
    for (const block of blocks) {
      if (block.BlockType !== "LINE") continue;
      const pageNumber = block.Page ?? 1;
      const bucket = byPage.get(pageNumber) ?? { lines: [], confidences: [] };
      bucket.lines.push(block.Text ?? "");
      if (typeof block.Confidence === "number") {
        bucket.confidences.push(block.Confidence / 100);
      }
      byPage.set(pageNumber, bucket);
    }

    return Array.from(byPage.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([pageNumber, bucket]) => ({
        pageNumber,
        text: bucket.lines.join("\n"),
        confidence:
          bucket.confidences.length > 0
            ? bucket.confidences.reduce((sum, value) => sum + value, 0) /
              bucket.confidences.length
            : undefined,
      }));
  }
}

function mergePages(existing: OcrPage[], additions: OcrPage[]): OcrPage[] {
  const merged = new Map<number, OcrPage>();
  for (const page of existing) {
    merged.set(page.pageNumber, page);
  }
  for (const page of additions) {
    const current = merged.get(page.pageNumber);
    if (current) {
      merged.set(page.pageNumber, {
        pageNumber: page.pageNumber,
        text: `${current.text}\n${page.text}`,
        confidence: page.confidence ?? current.confidence,
      });
    } else {
      merged.set(page.pageNumber, page);
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.pageNumber - b.pageNumber);
}
