import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  COOKIE_NAME,
  MAX_UPLOAD_BYTES,
  UPLOAD_TOKEN_TTL_MS,
} from "@shared/const";
import { HttpError } from "@shared/_core/errors";
import type { Document } from "../drizzle/schema";
import { loginWithEmail } from "./auth";
import {
  approveAndExecute,
  ApprovalError,
  dismissDraft,
  editDraft,
  rejectDraft,
} from "./domain/approval";
import { checkRateLimit } from "./domain/ratelimit";
import { sanitizeFilename, validateUpload } from "./domain/validation";
import { SYNTHETIC_DOCUMENTS, buildSyntheticDocument } from "./demo/documents";
import { processPendingDocuments, queueProcessing } from "./processing";
import { getRepository, type TriageRepository } from "./repository";
import { buildStorageKey, getDocumentStore } from "./storage";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().min(3).max(320),
  name: z.string().max(120).optional(),
});

const uploadIntentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive(),
});

const idSchema = z.object({ id: z.string().uuid() });

const listDocumentsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

const queueFilterSchema = z.object({
  urgency: z.enum(["high", "medium", "low"]).optional(),
  status: z
    .enum([
      "needs_decision",
      "due_soon",
      "waiting_for_info",
      "in_progress",
      "handled",
      "dismissed",
    ])
    .optional(),
  category: z.string().max(64).optional(),
  includeHandled: z.boolean().optional(),
});

const setObligationStatusSchema = z.object({
  obligationId: z.string().uuid(),
  status: z.enum(["in_progress", "handled", "dismissed"]),
});

const editDraftSchema = z.object({
  draftId: z.string().uuid(),
  subject: z.string().max(255).nullable(),
  body: z.string().min(1).max(20_000),
});

const draftActionSchema = z.object({
  draftId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

const listAuditSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  documentId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Error mapping: domain errors → tRPC errors with user-safe messages
// ---------------------------------------------------------------------------

function toTRPCError(error: unknown): TRPCError {
  if (error instanceof ApprovalError || error instanceof HttpError) {
    const code =
      error instanceof HttpError && error.statusCode === 404
        ? "NOT_FOUND"
        : "BAD_REQUEST";
    return new TRPCError({ code, message: error.message });
  }
  console.error("[API] Unexpected error:", error);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong. Please try again.",
  });
}

// ---------------------------------------------------------------------------
// Upload tokens (short-lived, user-bound)
// ---------------------------------------------------------------------------

async function getJwtSecret(): Promise<Uint8Array> {
  const secret = ENV.cookieSecret || "triage-life-dev-secret-do-not-use-in-production";
  return new TextEncoder().encode(secret);
}

export async function createUploadToken(payload: {
  userId: number;
  filename: string;
  mimeType: string;
}): Promise<string> {
  return new SignJWT({ ...payload, kind: "upload" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + UPLOAD_TOKEN_TTL_MS) / 1000))
    .sign(await getJwtSecret());
}

export async function verifyUploadToken(
  token: string,
): Promise<{ userId: number; filename: string; mimeType: string } | null> {
  try {
    const { payload } = await jwtVerify(token, await getJwtSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.kind !== "upload") return null;
    const { userId, filename, mimeType } = payload as Record<string, unknown>;
    if (
      typeof userId !== "number" ||
      typeof filename !== "string" ||
      typeof mimeType !== "string"
    ) {
      return null;
    }
    return { userId, filename, mimeType };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadQueueItems(
  repo: TriageRepository,
  userId: number,
  filters: z.infer<typeof queueFilterSchema>,
) {
  const [obligations, documents] = await Promise.all([
    repo.listObligations(userId, {
      urgency: filters.urgency,
      category: filters.category,
      includeHandled: filters.includeHandled,
      status: filters.status ? [filters.status] : undefined,
    }),
    repo.listDocuments(userId, 200),
  ]);
  const documentsById = new Map(documents.map(document => [document.id, document]));

  return Promise.all(
    obligations.map(async obligation => {
      const draft = await repo.findDraftByObligation(obligation.id, userId);
      return {
        obligation,
        draft,
        document: documentsById.get(obligation.documentId) ?? null,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

export const appRouter = router({
  system: router({
    health: publicProcedure.query(() => ({ ok: true })),
  }),

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(loginSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const { user, token } = await loginWithEmail(ctx.repo, input);

          await ctx.repo.createAuditEvent({
            userId: user.id,
            eventType: "user_signed_in",
            actorType: "user",
            summary: `${user.name ?? user.email ?? "User"} signed in`,
          });

          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, {
            ...cookieOptions,
            maxAge: 1000 * 60 * 60 * 24 * 365,
          });
          return user;
        } catch (error) {
          throw toTRPCError(error);
        }
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      return { success: true } as const;
    }),
  }),

  documents: router({
    /**
     * Step 1 of the upload flow: validate metadata and mint a short-lived,
     * user-bound upload token. Step 2 is a raw PUT to /api/uploads/:token.
     */
    createUploadIntent: protectedProcedure
      .input(uploadIntentSchema)
      .mutation(async ({ input, ctx }) => {
        const validation = validateUpload(input);
        if (!validation.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: validation.error });
        }

        const rate = checkRateLimit(`upload:${ctx.user.id}`, 30, 10 * 60 * 1000);
        if (!rate.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many uploads — please wait a moment and try again.",
          });
        }

        const token = await createUploadToken({
          userId: ctx.user.id,
          filename: sanitizeFilename(input.filename),
          mimeType: input.mimeType.trim().toLowerCase(),
        });

        return {
          uploadUrl: `/api/uploads/${token}`,
          maxBytes: MAX_UPLOAD_BYTES,
          expiresAt: new Date(Date.now() + UPLOAD_TOKEN_TTL_MS),
        };
      }),

    list: protectedProcedure
      .input(listDocumentsSchema)
      .query(({ input, ctx }) =>
        ctx.repo.listDocuments(ctx.user.id, input.limit ?? 50),
      ),

    /** Full detail: document + obligations + drafts + approvals + runs + audit. */
    get: protectedProcedure
      .input(idSchema)
      .query(async ({ input, ctx }) => {
        const repo = ctx.repo;
        const document = await repo.getDocument(input.id, ctx.user.id);
        if (!document) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
        }

        const [obligations, agentRuns, auditEvents] = await Promise.all([
          repo.listObligationsByDocument(input.id, ctx.user.id),
          repo.listAgentRunsByDocument(input.id, ctx.user.id),
          repo.listAuditEvents(ctx.user.id, {
            limit: 200,
            documentId: input.id,
          }),
        ]);

        const obligationRows = await Promise.all(
          obligations.map(async obligation => {
            const draft = await repo.findDraftByObligation(obligation.id, ctx.user.id);
            const approval = draft
              ? await repo.findActiveApprovalForDraft(draft.id, ctx.user.id)
              : undefined;
            return { obligation, draft, approval: approval ?? null };
          }),
        );

        return {
          document,
          obligations: obligationRows,
          agentRuns,
          auditEvents,
        };
      }),

    startProcessing: protectedProcedure
      .input(idSchema)
      .mutation(async ({ input, ctx }) => {
        const document = await ctx.repo.getDocument(input.id, ctx.user.id);
        if (!document) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
        }

        const rate = checkRateLimit(`process:${ctx.user.id}`, 20, 10 * 60 * 1000);
        if (!rate.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many processing requests — please wait a moment.",
          });
        }

        queueProcessing(input.id, ctx.user.id);
        return { accepted: true } as const;
      }),

    retryProcessing: protectedProcedure
      .input(idSchema)
      .mutation(async ({ input, ctx }) => {
        const document = await ctx.repo.getDocument(input.id, ctx.user.id);
        if (!document) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
        }
        if (document.processingStatus !== "failed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only failed documents can be retried.",
          });
        }

        const rate = checkRateLimit(`process:${ctx.user.id}`, 20, 10 * 60 * 1000);
        if (!rate.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many processing requests — please wait a moment.",
          });
        }

        queueProcessing(input.id, ctx.user.id, true);
        return { accepted: true } as const;
      }),

    /** Re-queue everything pending/failed (the "Process inbox" action). */
    processPending: protectedProcedure.mutation(async ({ ctx }) => {
      const rate = checkRateLimit(`process:${ctx.user.id}`, 10, 10 * 60 * 1000);
      if (!rate.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many processing requests — please wait a moment.",
        });
      }
      const queued = await processPendingDocuments(ctx.user.id);
      return { queued } as const;
    }),

    /** Delete-data path (spec §12): removes the original file and all rows. */
    delete: protectedProcedure
      .input(idSchema)
      .mutation(async ({ input, ctx }) => {
        const repo = ctx.repo;
        const document = await repo.getDocument(input.id, ctx.user.id);
        if (!document) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
        }

        await getDocumentStore().delete(document.storageKey).catch(() => {});
        await repo.deleteDocument(input.id, ctx.user.id);
        await repo.createAuditEvent({
          userId: ctx.user.id,
          eventType: "document_deleted",
          actorType: "user",
          summary: `You deleted "${document.originalFilename}" and its original file`,
        });
        return { success: true } as const;
      }),
  }),

  queue: router({
    list: protectedProcedure
      .input(queueFilterSchema.optional())
      .query(async ({ input, ctx }) =>
        loadQueueItems(ctx.repo, ctx.user.id, input ?? {}),
      ),

    setStatus: protectedProcedure
      .input(setObligationStatusSchema)
      .mutation(async ({ input, ctx }) => {
        const repo = ctx.repo;
        const obligation = await repo.getObligation(input.obligationId, ctx.user.id);
        if (!obligation) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        }

        const updated = await repo.updateObligation(input.obligationId, ctx.user.id, {
          status: input.status,
        });
        await repo.createAuditEvent({
          userId: ctx.user.id,
          documentId: obligation.documentId,
          obligationId: obligation.id,
          eventType: "obligation_status_changed",
          actorType: "user",
          summary: `"${obligation.title}" marked ${input.status.replace("_", " ")}`,
        });
        return updated;
      }),
  }),

  drafts: router({
    get: protectedProcedure
      .input(idSchema)
      .query(async ({ input, ctx }) => {
        const repo = ctx.repo;
        const draft = await repo.getDraft(input.id, ctx.user.id);
        if (!draft) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
        }
        const obligation = await repo.getObligation(draft.obligationId, ctx.user.id);
        const approval = await repo.findActiveApprovalForDraft(
          draft.id,
          ctx.user.id,
        );
        return {
          draft,
          obligation: obligation ?? null,
          approval: approval ?? null,
        };
      }),

    edit: protectedProcedure
      .input(editDraftSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await editDraft(ctx.repo, {
            draftId: input.draftId,
            userId: ctx.user.id,
            subject: input.subject,
            body: input.body,
          });
        } catch (error) {
          throw toTRPCError(error);
        }
      }),

    /** Approve and immediately run the simulated execution. */
    approve: protectedProcedure
      .input(draftActionSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await approveAndExecute(ctx.repo, {
            draftId: input.draftId,
            userId: ctx.user.id,
          });
        } catch (error) {
          throw toTRPCError(error);
        }
      }),

    reject: protectedProcedure
      .input(draftActionSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await rejectDraft(ctx.repo, {
            draftId: input.draftId,
            userId: ctx.user.id,
            reason: input.reason,
          });
        } catch (error) {
          throw toTRPCError(error);
        }
      }),

    dismiss: protectedProcedure
      .input(draftActionSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await dismissDraft(ctx.repo, {
            draftId: input.draftId,
            userId: ctx.user.id,
          });
        } catch (error) {
          throw toTRPCError(error);
        }
      }),
  }),

  audit: router({
    list: protectedProcedure
      .input(listAuditSchema)
      .query(({ input, ctx }) =>
        ctx.repo.listAuditEvents(ctx.user.id, {
          limit: input.limit ?? 100,
          documentId: input.documentId,
        }),
      ),
  }),

  metrics: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      const [metrics, recentEvents] = await Promise.all([
        ctx.repo.getMetrics(ctx.user.id),
        ctx.repo.listAuditEvents(ctx.user.id, { limit: 8 }),
      ]);
      return { metrics, recentEvents };
    }),
  }),

  demo: router({
    /** Which synthetic documents exist (for the demo panel). */
    list: protectedProcedure.query(() =>
      SYNTHETIC_DOCUMENTS.map(spec => ({
        id: spec.id,
        filename: spec.filename,
      })),
    ),

    /**
     * Create the three synthetic demo documents and run them through the
     * real pipeline: upload → OCR → extraction → queue → drafts → approval
     * gate. Clearly labeled as synthetic; impossible to contact anyone real.
     */
    create: protectedProcedure.mutation(async ({ ctx }) => {
      const rate = checkRateLimit(`demo:${ctx.user.id}`, 5, 60 * 60 * 1000);
      if (!rate.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Demo documents were just created — refresh the queue to see them.",
        });
      }

      const repo = ctx.repo;
      const store = getDocumentStore();
      const existing = await repo.listDocuments(ctx.user.id, 200);
      const created: Document[] = [];

      for (const spec of SYNTHETIC_DOCUMENTS) {
        const alreadyLoaded = existing.some(
          doc => doc.isSynthetic && doc.originalFilename === spec.filename,
        );
        if (alreadyLoaded) continue;

        const built = buildSyntheticDocument(spec.id);
        if (!built) continue;

        const storageKey = buildStorageKey(ctx.user.id, built.filename);
        await store.put(storageKey, built.pdfBytes, built.mimeType);

        const document = await repo.createDocument({
          userId: ctx.user.id,
          originalFilename: built.filename,
          storageKey,
          storageUrl: null,
          mimeType: built.mimeType,
          sizeBytes: built.pdfBytes.byteLength,
          sha256: createHash("sha256").update(built.pdfBytes).digest("hex"),
          source: "demo",
          isSynthetic: true,
          processingStatus: "pending",
        });
        created.push(document);

        await repo.createAuditEvent({
          userId: ctx.user.id,
          documentId: document.id,
          eventType: "document_uploaded",
          actorType: "user",
          summary: `Synthetic demo document uploaded: "${built.filename}"`,
          metadata: { synthetic: true },
        });

        queueProcessing(document.id, ctx.user.id);
      }

      return { created: created.map(document => document.id) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
