import { describe, expect, it } from "vitest";
import { buildSyntheticDocument, makeSimplePdf } from "../demo/documents";
import type { DocumentStore } from "../storage";
import { LocalTextProvider } from "./local";
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

function ocrInput(storageKey: string, mimeType: string) {
  return { storageKey, mimeType, sha256: "irrelevant" };
}

describe("LocalTextProvider (PDF text-layer extraction)", () => {
  it("extracts the real text layer from a synthetic demo PDF", async () => {
    const store = new FakeStore();
    const provider = new LocalTextProvider(store, null);
    const built = buildSyntheticDocument("insurance-renewal");
    if (!built) throw new Error("synthetic doc missing");
    await store.put("users/1/doc.pdf", built.pdfBytes);

    const result = await provider.extractText(
      ocrInput("users/1/doc.pdf", "application/pdf"),
    );

    expect(result.provider).toBe("local-text");
    expect(result.confidence).toBe(0.99);
    expect(result.pages).toHaveLength(1);
    // The labeled lines the extraction parsers rely on are intact.
    expect(result.text).toContain("NORTHSTAR HEALTH INSURANCE");
    expect(result.text).toContain("NEW PREMIUM: EUR 214.60 per month");
    expect(result.text).toMatch(/DEADLINE: [A-Z][a-z]+ \d{1,2}, \d{4}/);
    expect(result.text).toContain("TRIAGE-SYNTHETIC:insurance-renewal");
  });

  it("extracts all three synthetic documents with parseable labeled text", async () => {
    const store = new FakeStore();
    const provider = new LocalTextProvider(store, null);

    for (const id of [
      "insurance-renewal",
      "school-form",
      "appointment-confirmation",
    ]) {
      const built = buildSyntheticDocument(id);
      if (!built) throw new Error(`synthetic doc ${id} missing`);
      await store.put(`users/1/${id}.pdf`, built.pdfBytes);
      const result = await provider.extractText(
        ocrInput(`users/1/${id}.pdf`, "application/pdf"),
      );
      expect(result.text.length).toBeGreaterThan(100);
      expect(result.text).toContain("TRIAGE-SYNTHETIC");
    }
  });

  it("refuses scanned PDFs (no text layer) with an actionable error", async () => {
    const store = new FakeStore();
    const provider = new LocalTextProvider(store, null);
    // A structurally valid PDF with an empty content stream: no text layer.
    await store.put("users/1/scan.pdf", makeSimplePdf([]));

    await expect(
      provider.extractText(ocrInput("users/1/scan.pdf", "application/pdf")),
    ).rejects.toThrow(OcrUnavailableError);
    await expect(
      provider.extractText(ocrInput("users/1/scan.pdf", "application/pdf")),
    ).rejects.toThrow(/looks like a scan/);
  });

  it("refuses images without a scan fallback, explaining what they need", async () => {
    const store = new FakeStore();
    const provider = new LocalTextProvider(store, null);
    await store.put("users/1/photo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await expect(
      provider.extractText(ocrInput("users/1/photo.png", "image/png")),
    ).rejects.toThrow(/Images have no embedded text/);
  });

  it("fails clearly when the original file is missing", async () => {
    const provider = new LocalTextProvider(new FakeStore(), null);
    await expect(
      provider.extractText(ocrInput("users/1/gone.pdf", "application/pdf")),
    ).rejects.toThrow("could not be read from storage");
  });
});
