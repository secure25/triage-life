import type { Document } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import type { TriageRepository } from "../repository";
import type { ToolContext } from "./tools";
import {
  calculatePriorityTool,
  createOrUpdateTask,
  draftResponse,
  extractObligations,
  getDocumentText,
  recordAuditEvent,
  requestUserApproval,
} from "./tools";
import { extractFromText, type ExtractionResult } from "./extraction";

/**
 * Agent engine boundary (spec §7).
 *
 * An engine runs the full agent stage for one document: read the text,
 * extract obligations, classify priority, upsert queue tasks, draft
 * responses, and stop at the approval gate. Two implementations:
 *
 * - DeterministicEngine: fixed, audited tool sequence over the labeled
 *   synthetic demo documents. No external model. This is the default and
 *   what the test suite exercises.
 * - StrandsEngine (server/agent/strands.ts): the Strands Agents SDK drives
 *   the same tools through a real agent loop with a configured model
 *   provider, for real documents.
 */

export interface AgentEngine {
  readonly name: string;
  readonly modelId: string | null;
  runAgentStage(
    ctx: ToolContext,
    repo: TriageRepository,
    document: Document,
  ): Promise<ExtractionResult>;
}

export class DeterministicEngine implements AgentEngine {
  readonly name = "deterministic";
  readonly modelId = null;

  async extract(text: string, ocrConfidence: number | null): Promise<ExtractionResult> {
    return extractFromText(text, ocrConfidence);
  }

  async runAgentStage(
    ctx: ToolContext,
    repo: TriageRepository,
    document: Document,
  ): Promise<ExtractionResult> {
    const textResult = await getDocumentText(ctx, document.id, document.userId);

    const extraction = await extractObligations(
      ctx,
      {
        documentId: document.id,
        text: textResult.text,
        ocrConfidence: textResult.confidence,
      },
      this,
    );

    await recordAuditEvent(ctx, {
      userId: document.userId,
      documentId: document.id,
      eventType: "obligations_extracted",
      actorType: "agent",
      summary: `Agent extracted ${extraction.obligations.length} obligation(s) from "${document.originalFilename}"`,
      metadata: { engine: this.name },
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
}

let _enginePromise: Promise<AgentEngine> | null = null;

export function getExtractionEngine(): Promise<AgentEngine> {
  if (_enginePromise) return _enginePromise;

  if (ENV.agentProvider === "strands") {
    // Loaded lazily so the app still boots without the Strands SDK path
    // configured (no model credentials) — the fallback is deterministic.
    _enginePromise = import("./strands")
      .then(({ StrandsEngine }) => new StrandsEngine() as AgentEngine)
      .catch(error => {
        console.warn(
          "[Agent] AGENT_PROVIDER=strands but the Strands engine is unavailable " +
            `(${error instanceof Error ? error.message : String(error)}). ` +
            "Falling back to the deterministic engine.",
        );
        return new DeterministicEngine() as AgentEngine;
      });
  } else {
    _enginePromise = Promise.resolve(new DeterministicEngine());
  }
  return _enginePromise;
}

/** Test seam. */
export function setExtractionEngine(engine: AgentEngine | null): void {
  _enginePromise = engine ? Promise.resolve(engine) : null;
}

export type { ExtractionResult };
