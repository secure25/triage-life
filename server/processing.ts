import type { Document, ToolTraceEntry } from "../drizzle/schema";
import { getOcrProvider, OcrUnavailableError } from "./ocr";
import { getExtractionEngine } from "./agent/engine";
import {
  calculatePriorityTool,
  createOrUpdateTask,
  draftResponse,
  extractObligations,
  getDocumentText,
  recordAuditEvent,
  requestUserApproval,
  writeAuditEvent,
  type ToolContext,
} from "./agent/tools";
import { getRepository, type TriageRepository } from "./repository";

/**
 * Document processing pipeline (spec §1 end-to-end flow):
 * upload → OCR → structured extraction → priority → task upsert →
 * draft → approval gate → audit. Idempotent: re-running updates existing
 * obligations and drafts instead of duplicating them.
 *
 * The pipeline is the deterministic orchestration layer: it invokes the same
 * tools a Strands agent would (see server/agent/tools.ts) and records every
 * call for the activity panel.
 */

const inFlight = new Map<string, Promise<void>>();

/** Fire-and-forget processing with a per-document in-flight guard. */
export function queueProcessing(documentId: string, userId: number, isRetry = false): void {
  if (inFlight.has(documentId)) return;

  const task = processDocument(documentId, userId, isRetry)
    .catch(error => {
      console.error(`[Processing] Unexpected failure for ${documentId}:`, error);
    })
    .finally(() => {
      inFlight.delete(documentId);
    });

  inFlight.set(documentId, task);
}

export async function processDocument(
  documentId: string,
  userId: number,
  isRetry = false,
): Promise<void> {
  const repo = getRepository();
  const document = await repo.getDocument(documentId, userId);
  if (!document) return;

  await repo.updateDocument(documentId, userId, {
    processingStatus: "processing",
    processingError: null,
  });

  const ocrProvider = getOcrProvider();
  const engine = await getExtractionEngine();

  const run = await repo.createAgentRun({
    documentId,
    userId,
    runType: isRetry ? "retry" : "pipeline",
    status: "running",
    provider: ocrProvider.name,
    modelId: engine.modelId,
  });

  const ctx: ToolContext = { repo, trace: [] };

  try {
    await runOcrStage(repo, document, ocrProvider.name);
    const processed = await repo.getDocument(documentId, userId);
    if (!processed) return;

    const extractionResult = await runAgentStage(ctx, repo, processed, engine);

    await repo.updateDocument(documentId, userId, {
      processingStatus: "completed",
      documentType: extractionResult.documentType,
    });

    await repo.updateAgentRun(run.id, userId, {
      status: "completed",
      completedAt: new Date(),
      structuredOutput: {
        documentType: extractionResult.documentType,
        agentExplanation: extractionResult.agentExplanation,
        obligations: extractionResult.obligations,
      },
      toolTrace: ctx.trace,
    });

    await writeAuditEvent(repo, {
      userId,
      documentId,
      eventType: "processing_completed",
      actorType: "agent",
      summary: `Processing completed — ${extractionResult.obligations.length} obligation(s) extracted`,
    });
  } catch (error) {
    const message =
      error instanceof OcrUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    // Never log document contents — only the failure reason.
    console.warn(`[Processing] Document ${documentId} failed: ${message}`);

    await repo.updateDocument(documentId, userId, {
      processingStatus: "failed",
      processingError: message,
    });
    await repo.updateAgentRun(run.id, userId, {
      status: "failed",
      completedAt: new Date(),
      error: message,
      toolTrace: ctx.trace,
    });
    await writeAuditEvent(repo, {
      userId,
      documentId,
      eventType: "processing_failed",
      actorType: "system",
      summary: `Processing failed: ${message}`,
    });
  }
}

// ---------------------------------------------------------------------------

async function runOcrStage(
  repo: TriageRepository,
  document: Document,
  providerName: string,
): Promise<void> {
  await writeAuditEvent(repo, {
    userId: document.userId,
    documentId: document.id,
    eventType: "ocr_started",
    actorType: "system",
    summary: `OCR started for "${document.originalFilename}"`,
    metadata: { provider: providerName },
  });

  const result = await getOcrProvider().extractText({
    storageKey: document.storageKey,
    mimeType: document.mimeType,
    sha256: document.sha256,
  });

  await repo.updateDocument(document.id, document.userId, {
    ocrText: result.text,
    ocrPages: result.pages,
    ocrConfidence: result.confidence,
  });

  await writeAuditEvent(repo, {
    userId: document.userId,
    documentId: document.id,
    eventType: "ocr_completed",
    actorType: "system",
    summary:
      result.confidence !== null
        ? `OCR completed — ${Math.round(result.confidence * 100)}% confidence, ${result.pages.length} page(s)`
        : `OCR completed — ${result.pages.length} page(s)`,
    metadata: { provider: result.provider, confidence: result.confidence },
  });
}

async function runAgentStage(
  ctx: ToolContext,
  repo: TriageRepository,
  document: Document,
  engine: Awaited<ReturnType<typeof getExtractionEngine>>,
) {
  const textResult = await getDocumentText(ctx, document.id, document.userId);

  const extraction = await extractObligations(
    ctx,
    {
      documentId: document.id,
      text: textResult.text,
      ocrConfidence: textResult.confidence,
    },
    engine,
  );

  await recordAuditEvent(ctx, {
    userId: document.userId,
    documentId: document.id,
    eventType: "obligations_extracted",
    actorType: "agent",
    summary: `Agent extracted ${extraction.obligations.length} obligation(s) from "${document.originalFilename}"`,
    metadata: { engine: engine.name, modelId: engine.modelId },
  });

  for (const extracted of extraction.obligations) {
    const priority = await calculatePriorityTool(ctx, extracted);
    const { obligation, created } = await createOrUpdateTask(
      ctx,
      document,
      extracted,
      priority,
    );

    await recordAuditEvent(ctx, {
      userId: document.userId,
      documentId: document.id,
      obligationId: obligation.id,
      eventType: created ? "task_created" : "task_updated",
      actorType: "agent",
      summary: `${created ? "Created" : "Updated"} task "${obligation.title}" (${priority.urgency} urgency — ${priority.reason})`,
    });

    if (extracted.dueAt) {
      await recordAuditEvent(ctx, {
        userId: document.userId,
        documentId: document.id,
        obligationId: obligation.id,
        eventType: "deadline_detected",
        actorType: "agent",
        summary: `Deadline detected for "${obligation.title}"`,
        metadata: { dueAt: extracted.dueAt.toISOString() },
      });
    }

    if (extracted.draft) {
      const { draft, created: draftCreated } = await draftResponse(
        ctx,
        obligation,
        extracted.draft,
      );

      await recordAuditEvent(ctx, {
        userId: document.userId,
        documentId: document.id,
        obligationId: obligation.id,
        draftId: draft.id,
        eventType: draftCreated ? "draft_created" : "draft_updated",
        actorType: "agent",
        summary: `Draft prepared for "${obligation.title}" — nothing is sent without your approval`,
      });

      if (extracted.approvalRequired) {
        await requestUserApproval(ctx, obligation, draft, extracted.actionTarget);
        await recordAuditEvent(ctx, {
          userId: document.userId,
          documentId: document.id,
          obligationId: obligation.id,
          draftId: draft.id,
          eventType: "approval_required",
          actorType: "agent",
          summary: `Approval required: "${obligation.title}" — Triage stopped at the approval gate`,
        });
      }
    }
  }

  return extraction;
}

/**
 * Re-queue anything pending or failed (dashboard "Process inbox" action,
 * and recovery after a restart).
 */
export async function processPendingDocuments(userId: number): Promise<number> {
  const repo = getRepository();
  const documents = await repo.listDocuments(userId, 200);
  let queued = 0;
  for (const document of documents) {
    if (document.processingStatus === "pending" || document.processingStatus === "failed") {
      queueProcessing(document.id, userId, document.processingStatus === "failed");
      queued++;
    }
  }
  return queued;
}

/** Trace accessor for tests. */
export function currentInFlight(): string[] {
  return Array.from(inFlight.keys());
}

export type { ToolTraceEntry };
