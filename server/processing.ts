import type { Document, ToolTraceEntry } from "../drizzle/schema";
import { getOcrProvider, OcrUnavailableError } from "./ocr";
import { getExtractionEngine, type AgentEngine } from "./agent/engine";
import { writeAuditEvent, type ToolContext } from "./agent/tools";
import { getRepository, type TriageRepository } from "./repository";

/**
 * Document processing pipeline (spec §1 end-to-end flow):
 * upload → OCR → agent stage → audit. The agent stage (extraction → priority
 * → task upsert → draft → approval gate) is run by the configured engine —
 * deterministic sequence or Strands agent loop — over the same audited tool
 * layer. Idempotent: re-running updates existing obligations and drafts
 * instead of duplicating them.
 */

const inFlight = new Map<string, Promise<void>>();

/**
 * Serial processing queue: one document at a time. LLM-backed agent runs are
 * multi-call and easy to throttle at provider rate limits (especially on
 * fresh accounts with low initial quotas) — serializing keeps the pipeline
 * inside them and still processes a demo batch in a couple of minutes.
 */
let queueTail: Promise<void> = Promise.resolve();

/** Fire-and-forget processing with a per-document in-flight guard. */
export function queueProcessing(documentId: string, userId: number, isRetry = false): void {
  if (inFlight.has(documentId)) return;

  const task = queueTail
    .catch(() => {})
    .then(() => processDocument(documentId, userId, isRetry))
    .catch(error => {
      console.error(`[Processing] Unexpected failure for ${documentId}:`, error);
    })
    .finally(() => {
      inFlight.delete(documentId);
    });

  queueTail = task;
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
  const engine: AgentEngine = await getExtractionEngine();

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

    const extractionResult = await engine.runAgentStage(ctx, repo, processed);

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
      metadata: { engine: engine.name, modelId: engine.modelId },
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
