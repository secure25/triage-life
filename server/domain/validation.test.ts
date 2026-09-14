import { describe, expect, it } from "vitest";
import {
  sanitizeFilename,
  validateBufferSize,
  validateUpload,
} from "./validation";

describe("validateUpload", () => {
  it("accepts a normal PDF", () => {
    expect(
      validateUpload({
        filename: "notice.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      }),
    ).toEqual({ ok: true });
  });

  it("accepts jpeg with .jpg and .jpeg extensions", () => {
    for (const filename of ["scan.jpg", "scan.jpeg"]) {
      expect(
        validateUpload({ filename, mimeType: "image/jpeg", sizeBytes: 500 }),
      ).toEqual({ ok: true });
    }
  });

  it("accepts DOCX", () => {
    expect(
      validateUpload({
        filename: "form.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 500,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects unsupported MIME types", () => {
    const result = validateUpload({
      filename: "virus.exe",
      mimeType: "application/x-msdownload",
      sizeBytes: 10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Unsupported file type");
  });

  it("rejects MIME/extension mismatches (content-type spoofing)", () => {
    const result = validateUpload({
      filename: "actually-an-exe.pdf.exe",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects files over the size limit", () => {
    const result = validateUpload({
      filename: "huge.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too large");
  });

  it("rejects empty files", () => {
    const result = validateUpload({
      filename: "empty.pdf",
      mimeType: "application/pdf",
      sizeBytes: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects missing filenames", () => {
    const result = validateUpload({
      filename: "",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateBufferSize", () => {
  it("rejects empty and oversized buffers", () => {
    expect(validateBufferSize(0).ok).toBe(false);
    expect(validateBufferSize(16 * 1024 * 1024).ok).toBe(false);
    expect(validateBufferSize(1024).ok).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  it("strips path traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\windows\\system32\\config.pdf")).toBe(
      "config.pdf",
    );
  });

  it("removes control characters", () => {
    expect(sanitizeFilename("bad\r\nname.pdf")).toBe("badname.pdf");
  });

  it("caps length", () => {
    const long = "a".repeat(500) + ".pdf";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });
});
