import { describe, expect, it } from "vitest";
import { buildSyntheticDocument } from "../demo/documents";
import type { DocumentStore } from "../storage";
import { DemoOcrProvider } from "./demo";
import { getOcrProvider } from "./index";
import { OcrUnavailableError } from "./types";

/** Fake object store so OCR tests never touch the filesystem. */
class FakeStore implements DocumentStore {
  files = new Map<string, Buffer>();

  async put(key: string, data: Buffer) {
    this.files.set(key, data);
    return { key, url: null };
  }

  async get(key: string) {
    const data = this.files.get(key);
    return data ? { data, contentType: "application/pdf" } : null;
  }

  async delete(key: string) {
    this.files.delete(key);
  }
}

describe("DemoOcrProvider", () => {
  it("recognizes synthetic documents by their marker", async () => {
    const store = new FakeStore();
    const provider = new DemoOcrProvider(store);
    const built = buildSyntheticDocument("insurance-renewal");
    if (!built) throw new Error("synthetic doc missing");
    await store.put("users/1/doc.pdf", built.pdfBytes);

    const result = await provider.extractText({
      storageKey: "users/1/doc.pdf",
      mimeType: "application/pdf",
      sha256: "irrelevant",
    });

    expect(result.provider).toBe("demo");
    expect(result.text).toContain("NORTHSTAR HEALTH INSURANCE");
    expect(result.pages.length).toBe(2);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.text).toContain("[Synthetic demo document");
  });

  it("refuses real documents with a clear, actionable error", async () => {
    const store = new FakeStore();
    const provider = new DemoOcrProvider(store);
    await store.put(
      "users/1/real.pdf",
      Buffer.from("%PDF-1.4 a real scanned document with no marker"),
    );

    await expect(
      provider.extractText({
        storageKey: "users/1/real.pdf",
        mimeType: "application/pdf",
        sha256: "x",
      }),
    ).rejects.toThrow(OcrUnavailableError);
  });

  it("fails when the original file is missing from storage", async () => {
    const provider = new DemoOcrProvider(new FakeStore());
    await expect(
      provider.extractText({
        storageKey: "users/1/gone.pdf",
        mimeType: "application/pdf",
        sha256: "x",
      }),
    ).rejects.toThrow("could not be read from storage");
  });
});

describe("provider selection", () => {
  it("selects the demo provider when no AWS credentials are present", () => {
    // The test setup clears AWS-adjacent env; selection must fall back to demo.
    const provider = getOcrProvider();
    expect(provider.name).toBe("demo");
  });
});
