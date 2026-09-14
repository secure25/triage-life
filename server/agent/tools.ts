import { createHash } from "node:crypto";
import type { Document, Draft, Obligation, ToolTraceEntry } from "../../drizzle/schema";
import type { TriageRepository } from "../repository";
import { calculatePriority, type PriorityResult } from "../domain/priority";
import type { ExtractedObligation, ExtractionResult } from "./extraction";

/**
 * Agent tools (spec §7). Narrow, auditable functions the orchestration layer
 * (deterministic pipeline or Strands agent) may call. Every call is recorded
 * in a tool trace that the UI shows in the activity panel.
 *
 * Safety rules encoded here:
 * - draft_response only ever creates a draft; nothing is ever sent.
 * - request_user_approval stops the workflow at the approval gate.
 */

export type ToolContext = {
  repo: TriageRepository;
  trace: ToolTraceEntry[];
  /**
   * Live-trace sink: called after every tool call so the running agent's
   * work streams to the UI while it happens (not only after completion).
   */
  onTrace?: (trace: ToolTraceEntry[]) => void;
};

export async function traced<T>(
  ctx: ToolContext,
  tool: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date().toISOString();
  try {
    const output = await fn();
    ctx.trace.push({
      tool,
      input,
      output,
      startedAt,
      completedAt: new Date().toISOString(),
      ok: true,
    });
    ctx.onTrace?.([...ctx.trace]);
    return output;
  } catch (error) {
    ctx.trace.push({
      tool,
      input,
      output: { error: error instanceof Error ? error.message : String(error) },
      startedAt,
      completedAt: new Date().toISOString(),
      ok: false,
    });
    ctx.onTrace?.([...ctx.trace]);
    throw error;
  }
}

// --- get_document_text -----------------------------------------------------

export async function getDocumentText(
  ctx: ToolContext,
  documentId: string,
  userId: number,
) {
  return traced(ctx, "get_document_text", { documentId }, async () => {
    const document = await ctx.repo.getDocument(documentId, userId);
    if (!document) throw new Error(`Document ${documentId} not found`);
    return {
      filename: document.originalFilename,
      text: document.ocrText ?? "",
      pages: document.ocrPages ?? [],
      confidence: document.ocrConfidence,
    };
  });
}

// --- extract_obligations ---------------------------------------------------

/** Runs the configured extraction engine over the OCR text. */
export async function extractObligations(
  ctx: ToolContext,
  input: { documentId: string; text: string; ocrConfidence: number | null },
  engine: {
    name: string;
    extract(text: string, ocrConfidence: number | null): Promise<ExtractionResult>;
  },
) {
  return traced(
    ctx,
    "extract_obligations",
    { documentId: input.documentId, textLength: input.text.length },
    () => engine.extract(input.text, input.ocrConfidence),
  );
}

// --- calculate_priority ----------------------------------------------------

export async function calculatePriorityTool(
  ctx: ToolContext,
  obligation: ExtractedObligation,
) {
  return traced(ctx, "calculate_priority", { title: obligation.title }, async () => {
    const result: PriorityResult = calculatePriority({
      dueAt: obligation.dueAt,
      amountCents: obligation.amountCents,
      requiredUserDecision: obligation.requiredUserDecision,
      approvalRequired: obligation.approvalRequired,
      missingInformation: obligation.missingInformation,
      confidence: obligation.confidence,
    });
    return result;
  });
}

// --- create_or_update_task (idempotent) -------------------------------------

export async function createOrUpdateTask(
  ctx: ToolContext,
  document: Document,
  extracted: ExtractedObligation,
  priority: PriorityResult,
) {
  return traced(ctx, "create_or_update_task", { title: extracted.title }, async () => {
    const existing = await ctx.repo.findObligationByTitle(
      document.id,
      document.userId,
      extracted.title,
    );

    const values = {
      documentId: document.id,
      userId: document.userId,
      title: extracted.title,
      description: extracted.description,
      category: extracted.category,
      urgency: priority.urgency,
      dueAt: extracted.dueAt,
      amountCents: extracted.amountCents,
      currency: extracted.currency,
      requiredUserDecision: extracted.requiredUserDecision,
      missingInformation: extracted.missingInformation,
      confidence: extracted.confidence,
      sourceQuote: extracted.sourceQuote,
      sourcePage: extracted.sourcePage,
      recommendedNextStep: extracted.recommendedNextStep,
      approvalRequired: extracted.approvalRequired,
      minutesSaved: extracted.minutesSavedEstimate,
    };

    if (existing) {
      // Idempotent reprocessing: update in place. Never resurrect a
      // terminal status (handled/dismissed) the user already chose.
      const status =
        existing.status === "handled" || existing.status === "dismissed"
          ? existing.status
          : priority.status;
      const updated = await ctx.repo.updateObligation(existing.id, document.userId, {
        ...values,
        status,
      });
      return { obligation: updated ?? existing, created: false };
    }

    const created = await ctx.repo.createObligation({
      ...values,
      status: priority.status,
    });
    return { obligation: created, created: true };
  });
}

// --- draft_response (never sends) -------------------------------------------

export function draftContentHash(subject: string | null, body: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ subject, body }))
    .digest("hex");
}

export async function draftResponse(
  ctx: ToolContext,
  obligation: Obligation,
  draft: { channel: "email" | "form" | "portal" | "reminder" | "none"; subject: string; body: string },
) {
  return traced(ctx, "draft_response", { obligationId: obligation.id }, async () => {
    const contentHash = draftContentHash(draft.subject, draft.body);
    const existing = await ctx.repo.findDraftByObligation(
      obligation.id,
      obligation.userId,
    );

    if (existing) {
      // A draft that was already approved/executed is never silently
      // replaced — that would invalidate a decision the user already made.
      if (existing.status === "executed_simulated") {
        return { draft: existing, created: false };
      }
      if (existing.contentHash === contentHash) {
        return { draft: existing, created: false };
      }
      const updated = await ctx.repo.updateDraft(existing.id, obligation.userId, {
        channel: draft.channel,
        subject: draft.subject,
        body: draft.body,
        contentHash,
        status: "draft",
        approvedAt: null,
        sentAt: null,
      });
      return { draft: updated ?? existing, created: false, changed: true };
    }

    const created = await ctx.repo.createDraft({
      obligationId: obligation.id,
      userId: obligation.userId,
      channel: draft.channel,
      subject: draft.subject,
      body: draft.body,
      contentHash,
      createdBy: "agent",
    });
    return { draft: created, created: true };
  });
}

// --- request_user_approval (stops the workflow) ------------------------------

export async function requestUserApproval(
  ctx: ToolContext,
  obligation: Obligation,
  draft: Draft,
  actionTarget: string | null,
) {
  return traced(ctx, "request_user_approval", { draftId: draft.id }, async () => {
    const updated = await ctx.repo.updateDraft(draft.id, obligation.userId, {
      status: "awaiting_approval",
    });
    return {
      draft: updated ?? draft,
      stopped: true,
      message:
        "Approval required: Triage has prepared this action and will not " +
        "execute it until you approve.",
      actionTarget,
    };
  });
}

// --- record_audit_event ------------------------------------------------------

export async function recordAuditEvent(
  ctx: ToolContext,
  event: {
    userId: number;
    documentId?: string | null;
    obligationId?: string | null;
    draftId?: string | null;
    eventType: string;
    actorType: "user" | "agent" | "system";
    summary: string;
    metadata?: Record<string, unknown>;
  },
) {
  return traced(ctx, "record_audit_event", { eventType: event.eventType }, async () => {
    const created = await ctx.repo.createAuditEvent(event);
    return { eventId: created.id };
  });
}

/** Convenience wrapper used outside tool tracing (uploads, user actions). */
export async function writeAuditEvent(
  repo: TriageRepository,
  event: Parameters<typeof recordAuditEvent>[1],
): Promise<void> {
  await repo.createAuditEvent(event);
}
