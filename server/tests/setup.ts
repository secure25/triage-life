import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Test bootstrap: point storage and the database at disposable locations
 * BEFORE any server module is imported, so tests never write into the repo
 * or hit a real database.
 */

const storageDir = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "triage-test-storage-")),
);
process.env.STORAGE_DIR = storageDir;
delete process.env.DATABASE_URL;
process.env.STORAGE_DRIVER = "local";
process.env.OCR_PROVIDER = "demo";
process.env.AGENT_PROVIDER = "deterministic";
process.env.JWT_SECRET = "test-secret";
