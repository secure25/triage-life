import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

/**
 * Object storage for original documents. Bytes never live in the database —
 * only storage keys and metadata. Two implementations:
 * - LocalFileStore: filesystem directory (development / no-infra demo).
 * - S3Store: any S3-compatible bucket (production).
 */

export interface DocumentStore {
  put(
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<{ key: string; url: string | null }>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** For S3-backed stores: a short-lived signed read URL. Local: null. */
  presignedGetUrl?(key: string, expiresInSec?: number): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Local filesystem store
// ---------------------------------------------------------------------------

export class LocalFileStore implements DocumentStore {
  constructor(private baseDir: string) {}

  private resolve(key: string): string {
    // Defense in depth against path traversal: the key must resolve inside
    // the storage root. Keys are server-generated, but verify anyway.
    const resolved = path.resolve(this.baseDir, key);
    const root = path.resolve(this.baseDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return resolved;
  }

  async put(key: string, data: Buffer, contentType: string) {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data, { flag: "wx" });
    // Persist content type alongside the bytes so reads can restore it.
    await fs.writeFile(`${filePath}.meta`, contentType, { flag: "wx" });
    return { key, url: null };
  }

  async get(key: string) {
    try {
      const filePath = this.resolve(key);
      const [data, contentType] = await Promise.all([
        fs.readFile(filePath),
        fs.readFile(`${filePath}.meta`, "utf-8").catch(() => "application/octet-stream"),
      ]);
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const filePath = this.resolve(key);
    await Promise.all([
      fs.unlink(filePath).catch(() => {}),
      fs.unlink(`${filePath}.meta`).catch(() => {}),
    ]);
  }
}

// ---------------------------------------------------------------------------
// S3 store
// ---------------------------------------------------------------------------

export class S3DocumentStore implements DocumentStore {
  private client: S3Client;

  constructor(
    private bucket: string,
    private prefix: string,
  ) {
    this.client = new S3Client(ENV.s3Region ? { region: ENV.s3Region } : {});
  }

  private objectKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  /** S3 coordinates for a storage key (used by Textract for PDF jobs). */
  s3Location(key: string): { bucket: string; key: string } {
    return { bucket: this.bucket, key: this.objectKey(key) };
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: data,
        ContentType: contentType,
      }),
    );
    return { key, url: null };
  }

  async get(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
      }),
    );
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return {
      data: Buffer.from(bytes),
      contentType: response.ContentType ?? "application/octet-stream",
    };
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }

  async presignedGetUrl(key: string, expiresInSec = 300): Promise<string | null> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
      { expiresIn: expiresInSec },
    );
    return url;
  }
}

// ---------------------------------------------------------------------------
// Selection + key generation
// ---------------------------------------------------------------------------

let _store: DocumentStore | null = null;

export function getDocumentStore(): DocumentStore {
  if (_store) return _store;

  if (ENV.storageDriver === "s3") {
    if (!ENV.s3Bucket) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET to be configured");
    }
    _store = new S3DocumentStore(ENV.s3Bucket, ENV.s3Prefix);
  } else {
    _store = new LocalFileStore(path.resolve(process.cwd(), ENV.storageDir));
  }
  return _store;
}

/**
 * Sanitize a client-provided filename down to a safe basename and build a
 * unique, server-controlled storage key. Never trust the raw filename.
 */
export function buildStorageKey(userId: number, originalFilename: string): string {
  const basename = path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeName = basename.replace(/^\.+/, "").slice(0, 120) || "document";
  return `users/${userId}/${randomUUID()}-${safeName}`;
}
