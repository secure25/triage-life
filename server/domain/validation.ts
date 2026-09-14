import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  isAllowedMimeType,
} from "@shared/const";

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
};

/**
 * Server-side upload validation. The client pre-validates for UX, but the
 * server never trusts it: MIME type, extension, and size are all re-checked.
 */
export function validateUpload(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): ValidationResult {
  const { filename, mimeType, sizeBytes } = input;

  if (!filename || typeof filename !== "string") {
    return { ok: false, error: "A filename is required." };
  }

  const normalizedMime = mimeType.trim().toLowerCase();
  if (!isAllowedMimeType(normalizedMime)) {
    return {
      ok: false,
      error:
        `Unsupported file type "${normalizedMime || "unknown"}". ` +
        `Allowed: PDF, PNG, JPG, DOCX.`,
    };
  }

  const expectedExtension = EXTENSION_BY_MIME[normalizedMime];
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext =>
    filename.toLowerCase().endsWith(ext),
  );
  if (!hasValidExtension) {
    return {
      ok: false,
      error: `Filename "${filename}" does not match a ${expectedExtension} file.`,
    };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "The file appears to be empty." };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File is too large (${formatBytes(sizeBytes)}). Maximum is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }

  return { ok: true };
}

export function validateBufferSize(sizeBytes: number): ValidationResult {
  if (sizeBytes <= 0) {
    return { ok: false, error: "The uploaded file is empty." };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`,
    };
  }
  return { ok: true };
}

/** Strip anything that could smuggle path segments or control characters. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[\r\n\0]/g, "").trim().slice(0, 200) || "document";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MIME_TYPE_LIST = ALLOWED_MIME_TYPES;
