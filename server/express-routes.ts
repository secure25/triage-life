import { createHash } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { MAX_UPLOAD_BYTES } from "@shared/const";
import { authenticateRequest } from "./auth";
import { validateBufferSize, validateUpload } from "./domain/validation";
import { queueProcessing } from "./processing";
import { getRepository } from "./repository";
import { buildStorageKey, getDocumentStore } from "./storage";
import { verifyUploadToken } from "./routers";

/**
 * Raw upload + file-serving routes (outside tRPC, since they carry bytes).
 *
 * Security: uploads require a short-lived, user-bound token minted by the
 * createUploadIntent mutation; file reads enforce per-user ownership before
 * anything is served or signed.
 */

export function registerUploadRoutes(app: Express) {
  // Registered before the JSON body parser so raw bytes reach this handler.
  app.put(
    "/api/uploads/:token",
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    async (req: Request, res: Response) => {
      // Upload tokens are compact JWTs (three base64url segments). Reject
      // anything of the wrong shape or size before it reaches the verifier so
      // no attacker-controlled bytes are parsed.
      const token = req.params.token ?? "";
      if (
        token.length > 2048 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token)
      ) {
        res
          .status(401)
          .json({ error: "Upload link expired or invalid — start the upload again." });
        return;
      }

      const payload = await verifyUploadToken(token);
      if (!payload) {
        res
          .status(401)
          .json({ error: "Upload link expired or invalid — start the upload again." });
        return;
      }

      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Missing file body." });
        return;
      }

      const contentType = (req.headers["content-type"] ?? "")
        .split(";")[0]!
        .trim()
        .toLowerCase();

      // Server-side validation only — nothing from the client is trusted.
      const declared = validateUpload({
        filename: payload.filename,
        mimeType: payload.mimeType,
        sizeBytes: req.body.byteLength,
      });
      const actual = validateUpload({
        filename: payload.filename,
        mimeType: contentType,
        sizeBytes: req.body.byteLength,
      });
      const sizeCheck = validateBufferSize(req.body.byteLength);
      if (!declared.ok) {
        res.status(400).json({ error: declared.error });
        return;
      }
      if (!actual.ok || contentType !== payload.mimeType) {
        res.status(400).json({
          error: `Uploaded bytes do not match the declared file (${payload.mimeType}).`,
        });
        return;
      }
      if (!sizeCheck.ok) {
        res.status(400).json({ error: sizeCheck.error });
        return;
      }

      const sha256 = createHash("sha256").update(req.body).digest("hex");
      const storageKey = buildStorageKey(payload.userId, payload.filename);
      // The key is built server-side (owner prefix + random UUID + sanitized
      // filename). Assert its shape before it reaches storage so the sink only
      // ever sees a provably server-derived path — never raw client input.
      if (!/^users\/\d+\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,124}$/.test(storageKey)) {
        res.status(500).json({ error: "Could not store the file — try again." });
        return;
      }
      const store = getDocumentStore();

      try {
        // payload.mimeType is the value signed into the upload token and
        // re-validated above; the client header was checked to equal it.
        await store.put(storageKey, req.body, payload.mimeType);
      } catch (error) {
        console.error("[Upload] Storage failure:", error);
        res.status(500).json({ error: "Could not store the file — try again." });
        return;
      }

      const repo = getRepository();
      const document = await repo.createDocument({
        userId: payload.userId,
        originalFilename: payload.filename,
        storageKey,
        storageUrl: null,
        mimeType: contentType,
        sizeBytes: req.body.byteLength,
        sha256,
        source: "upload",
        isSynthetic: false,
        processingStatus: "pending",
      });

      await repo.createAuditEvent({
        userId: payload.userId,
        documentId: document.id,
        eventType: "document_uploaded",
        actorType: "user",
        summary: `Document uploaded: "${document.originalFilename}"`,
      });

      queueProcessing(document.id, payload.userId);

      res.status(201).json({ documentId: document.id });
    },
  );
}

export function registerFileRoutes(app: Express) {
  app.get("/api/files/*", async (req: Request, res: Response) => {
    const repo = getRepository();
    const user = await authenticateRequest(req, repo);
    if (!user) {
      res.status(401).json({ error: "Sign in to view documents." });
      return;
    }

    const key = req.path.replace(/^\/api\/files\//, "");
    // Storage keys embed the owner: users/<id>/... — enforce it.
    const ownerMatch = /^users\/(\d+)\//.exec(key);
    if (!ownerMatch || parseInt(ownerMatch[1]!, 10) !== user.id) {
      res.status(403).json({ error: "This document belongs to another user." });
      return;
    }

    const store = getDocumentStore();
    try {
      // Prefer a short-lived signed URL when the store supports it (S3).
      if (store.presignedGetUrl) {
        const url = await store.presignedGetUrl(key);
        if (url) {
          res.redirect(307, url);
          return;
        }
      }

      const stored = await store.get(key);
      if (!stored) {
        res.status(404).json({ error: "File not found." });
        return;
      }
      res.setHeader("Content-Type", stored.contentType);
      res.setHeader("Content-Disposition", "inline");
      res.send(stored.data);
    } catch (error) {
      console.error("[Files] Retrieval failed:", error);
      res.status(500).json({ error: "Could not read the file." });
    }
  });
}
