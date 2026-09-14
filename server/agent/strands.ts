import { Agent, tool, type Model } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { z } from "zod";
import type { Document } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import type { TriageRepository } from "../repository";
import type { ExtractionResult, ExtractedObligation } from "./extraction";
import type { AgentEngine } from "./engine";
import {
  RawObligationSchema,
  StructuredExtractionSchema,
  normalizeRawObligation,
  normalizeStructuredExtraction,
} from "./normalize";
import {
  calculatePriorityTool,
  createOrUpdateTask,
  draftResponse,
  getDocumentText,
  recordAuditEvent,
  requestUserApproval,
  traced,
  type ToolContext,
} from "./tools";

/**
 * Strands Agents SDK engine (spec §7) — a real orchestration layer.
 *
 * The agent receives the same seven narrow tools the deterministic pipeline
 * uses (get_document_text, extract_obligations, calculate_priority,
 * create_or_update_task, draft_response, request_user_approval,
 * record_audit_event). The model decides how to read the document and what
 * to draft; the tools enforce every safety invariant:
 *
 * - dates/amounts are normalized server-side, never trusted raw,
 * - priority classification is deterministic code, not model judgment,
 * - draft_response only ever creates a draft,
 * - request_user_approval stops the workflow at the approval gate,
 * - every tool call is recorded in the audited tool trace.
 *
 * After the agent finishes, a reconciliation pass re-checks its work: any
 * obligation the model extracted but failed to persist is created
 * deterministically, and the approval gate is enforced even if the model
 * skipped it. The agent can never talk the system past the gate.
 */

const SYSTEM_PROMPT = `You are Triage, a life-admin agent that reduces paperwork to decisions.

Rules you must follow without exception:
1. Never invent a deadline, amount, policy term, or contact. If a value is not stated in the document, use null and say it is missing.
2. Quote or reference the source text for every important fact (sourceQuote + sourcePage).
3. Separate extraction (facts) from recommendation (your suggested next step).
4. Never send anything. draft_response only creates a draft for human review.
5. For any action that would have an external effect, you must call request_user_approval — then you are done with that obligation. Approval is the only way anything ever executes.
6. Call record_audit_event after each meaningful step.
7. If OCR confidence is low, say so and flag the item for review.
8. Do not provide medical, legal, tax, or financial advice.
9. If the document is a synthetic demo document, say so plainly in the explanation.

Workflow for the document you are given:
1. Call get_document_text.
2. Analyze the text and register what you found with extract_obligations (raw values; the tool normalizes them).
3. For EACH obligation returned by extract_obligations: call calculate_priority, then create_or_update_task, then record_audit_event. If a response is warranted, call draft_response. If the obligation requires approval, call request_user_approval last.
4. Finish by returning the structured extraction result for the whole document.`;

function awsCredentialsLikelyPresent(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_PROFILE ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,
  );
}

function resolveModel(): { model: Model | string; modelId: string } {
  if (ENV.strandsModelProvider === "openai") {
    if (!ENV.openaiBaseUrl || !ENV.openaiApiKey || !ENV.modelId) {
      throw new Error(
        "STRANDS_MODEL_PROVIDER=openai requires OPENAI_BASE_URL, OPENAI_API_KEY, " +
          "and MODEL_ID (any OpenAI-compatible endpoint works, including local ones).",
      );
    }
    return {
      model: new OpenAIModel({
        api: "chat",
        apiKey: ENV.openaiApiKey,
        clientConfig: { baseURL: ENV.openaiBaseUrl },
        modelId: ENV.modelId,
      }),
      modelId: ENV.modelId,
    };
  }

  if (!awsCredentialsLikelyPresent()) {
    throw new Error(
      "STRANDS_MODEL_PROVIDER=bedrock requires AWS credentials in the standard " +
        "chain (or set STRANDS_MODEL_PROVIDER=openai with OPENAI_BASE_URL/" +
        "OPENAI_API_KEY/MODEL_ID for any OpenAI-compatible endpoint).",
    );
  }
  const modelId = ENV.modelId || "global.anthropic.claude-sonnet-4-6";
  return { model: ENV.modelId || modelId, modelId };
}

// ---------------------------------------------------------------------------
// Tool input schemas (normalized shape — what extract_obligations returns)
// ---------------------------------------------------------------------------

const NormalizedObligationSchema = RawObligationSchema.extend({
  dueAt: z.string().nullable(),
  amountCents: z.number().int().nullable(),
  currency: z.string().nullable(),
});

const PrioritySchema = z.object({
  urgency: z.enum(["high", "medium", "low"]),
  status: z.enum([
    "needs_decision",
    "due_soon",
    "waiting_for_info",
    "in_progress",
    "handled",
    "dismissed",
  ]),
  reason: z.string(),
});

type NormalizedObligation = z.infer<typeof NormalizedObligationSchema>;

function reviveObligation(normalized: NormalizedObligation): ExtractedObligation {
  return {
    title: normalized.title,
    description: normalized.description,
    category: normalized.category,
    dueAt: normalized.dueAt ? new Date(normalized.dueAt) : null,
    amountCents: normalized.amountCents,
    currency: normalized.currency,
    requiredUserDecision: normalized.requiredUserDecision,
    missingInformation: normalized.missingInformation,
    confidence: normalized.confidence,
    sourceQuote: normalized.sourceQuote,
    sourcePage: normalized.sourcePage,
    recommendedNextStep: normalized.recommendedNextStep,
    approvalRequired: normalized.approvalRequired,
    actionTarget: normalized.actionTarget,
    draft: normalized.draft,
    minutesSavedEstimate: normalized.minutesSavedEstimate,
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class StrandsEngine implements AgentEngine {
  readonly name = "strands";
  readonly modelId: string;
  private readonly model: Model | string;

  constructor() {
    const resolved = resolveModel();
    this.model = resolved.model;
    this.modelId = resolved.modelId;
  }

  async runAgentStage(
    ctx: ToolContext,
    repo: TriageRepository,
    document: Document,
  ): Promise<ExtractionResult> {
    const agent = new Agent({
      model: this.model,
      tools: buildTriageTools(ctx, repo, document),
      systemPrompt: SYSTEM_PROMPT,
      structuredOutputSchema: StructuredExtractionSchema,
      printer: false,
    });

    const prompt =
      `Process document ${document.id} ("${document.originalFilename}"). ` +
      `Follow your workflow: read it, register every obligation with extract_obligations, ` +
      `and for each one calculate priority, create or update the task, record an audit ` +
      `event, draft a response when appropriate, and call request_user_approval when ` +
      `approval is required. Then return the structured extraction result.`;

    const result = await agent.invoke(prompt);

    // Re-validate defensively: never trust the shape further down the pipeline.
    const structured = StructuredExtractionSchema.parse(result.structuredOutput);
    const extraction = normalizeStructuredExtraction(structured);

    await recordAuditEvent(ctx, {
      userId: document.userId,
      documentId: document.id,
      eventType: "obligations_extracted",
      actorType: "agent",
      summary: `Agent extracted ${extraction.obligations.length} obligation(s) from "${document.originalFilename}"`,
      metadata: { engine: this.name, modelId: this.modelId },
    });

    // Reconciliation: the model may skip or mangle tool calls. The queue and
    // the approval gate are enforced by code, not by model discretion.
    for (const extracted of extraction.obligations) {
      await ensureObligationPersisted(ctx, repo, document, extracted);
    }

    return extraction;
  }
}

// ---------------------------------------------------------------------------
// The seven tools (spec §7), wrapping the shared audited implementations
// ---------------------------------------------------------------------------

function buildTriageTools(
  ctx: ToolContext,
  repo: TriageRepository,
  document: Document,
) {
  const userId = document.userId;

  const requireThisDocument = (documentId: string) => {
    if (documentId !== document.id) {
      throw new Error(
        `This run processes "${document.originalFilename}" (${document.id}) only.`,
      );
    }
  };

  const getDocumentTextTool = tool({
    name: "get_document_text",
    description:
      "Return the OCR text, page-level detail, and OCR confidence for the document being processed.",
    inputSchema: z.object({
      documentId: z.string().describe("Id of the document being processed"),
    }),
    callback: async ({ documentId }) => {
      requireThisDocument(documentId);
      return getDocumentText(ctx, documentId, userId);
    },
  });

  const extractObligationsTool = tool({
    name: "extract_obligations",
    description:
      "Register the obligations you found in the document. State dates and amounts " +
      "exactly as the document does — the tool normalizes them. Use null for anything " +
      "not stated. Every obligation needs a verbatim sourceQuote and its sourcePage.",
    inputSchema: z.object({
      documentId: z.string(),
      obligations: z.array(RawObligationSchema),
    }),
    callback: async ({ documentId, obligations }) => {
      requireThisDocument(documentId);
      return traced(
        ctx,
        "extract_obligations",
        { documentId, count: obligations.length },
        async () => ({
          obligations: obligations.map(normalizeRawObligation),
        }),
      );
    },
  });

  const calculatePriorityToolWrapped = tool({
    name: "calculate_priority",
    description:
      "Classify urgency and queue status for one obligation. Deterministic: based on " +
      "due date, required decision, and missing information — pass the normalized " +
      "obligation exactly as extract_obligations returned it.",
    inputSchema: NormalizedObligationSchema,
    callback: async obligation => {
      return calculatePriorityTool(ctx, reviveObligation(obligation));
    },
  });

  const createOrUpdateTaskTool = tool({
    name: "create_or_update_task",
    description:
      "Persist an obligation as a task in the decision queue (idempotent upsert). " +
      "Pass the normalized obligation and the priority result you received from " +
      "calculate_priority. Returns the task id.",
    inputSchema: z.object({
      obligation: NormalizedObligationSchema,
      priority: PrioritySchema,
    }),
    callback: async ({ obligation, priority }) => {
      const revived = reviveObligation(obligation);
      const result = await createOrUpdateTask(ctx, document, revived, priority);
      return {
        obligationId: result.obligation.id,
        title: result.obligation.title,
        status: result.obligation.status,
        created: result.created,
      };
    },
  });

  const draftResponseTool = tool({
    name: "draft_response",
    description:
      "Create a draft response for a task. This NEVER sends anything — it only " +
      "prepares the draft for human approval.",
    inputSchema: z.object({
      obligationId: z.string().uuid(),
      channel: z.enum(["email", "form", "portal", "reminder", "none"]),
      subject: z.string(),
      body: z.string(),
    }),
    callback: async ({ obligationId, channel, subject, body }) => {
      const obligation = await repo.getObligation(obligationId, userId);
      if (!obligation) {
        throw new Error(
          "Unknown obligationId — call create_or_update_task first.",
        );
      }
      const result = await draftResponse(ctx, obligation, {
        channel,
        subject,
        body,
      });
      return { draftId: result.draft.id, status: result.draft.status };
    },
  });

  const requestUserApprovalTool = tool({
    name: "request_user_approval",
    description:
      "Stop the workflow at the approval gate: marks the draft as awaiting human " +
      "approval. Call this for every action that would have an external effect. " +
      "Nothing executes until the human approves in the UI.",
    inputSchema: z.object({
      draftId: z.string().uuid(),
      actionTarget: z
        .string()
        .nullable()
        .describe("Where the approved action would go, e.g. 'renewals@insurer.example (email)'"),
    }),
    callback: async ({ draftId, actionTarget }) => {
      const draft = await repo.getDraft(draftId, userId);
      if (!draft) {
        throw new Error("Unknown draftId — call draft_response first.");
      }
      const obligation = await repo.getObligation(draft.obligationId, userId);
      if (!obligation) throw new Error("Draft has no obligation");
      return requestUserApproval(ctx, obligation, draft, actionTarget);
    },
  });

  const recordAuditEventTool = tool({
    name: "record_audit_event",
    description: "Write an immutable audit event recording a step you completed.",
    inputSchema: z.object({
      eventType: z
        .string()
        .regex(/^[a-z_]+$/)
        .describe("Snake_case event type, e.g. 'task_created'"),
      summary: z.string().min(3).max(500),
      obligationId: z.string().uuid().nullable(),
    }),
    callback: async ({ eventType, summary, obligationId }) => {
      return recordAuditEvent(ctx, {
        userId,
        documentId: document.id,
        obligationId,
        eventType,
        actorType: "agent",
        summary,
      });
    },
  });

  return [
    getDocumentTextTool,
    extractObligationsTool,
    calculatePriorityToolWrapped,
    createOrUpdateTaskTool,
    draftResponseTool,
    requestUserApprovalTool,
    recordAuditEventTool,
  ];
}

// ---------------------------------------------------------------------------
// Reconciliation safety net
// ---------------------------------------------------------------------------

async function ensureObligationPersisted(
  ctx: ToolContext,
  repo: TriageRepository,
  document: Document,
  extracted: ExtractedObligation,
): Promise<void> {
  const userId = document.userId;

  let obligation = await repo.findObligationByTitle(
    document.id,
    userId,
    extracted.title,
  );

  if (!obligation) {
    // The model skipped create_or_update_task — create it deterministically.
    const priority = await calculatePriorityTool(ctx, extracted);
    const result = await createOrUpdateTask(ctx, document, extracted, priority);
    obligation = result.obligation;
    await recordAuditEvent(ctx, {
      userId,
      documentId: document.id,
      obligationId: obligation.id,
      eventType: "task_created",
      actorType: "agent",
      summary: `Task "${obligation.title}" created (${priority.urgency} urgency — ${priority.reason})`,
      metadata: { reconciled: true },
    });
  }

  if (!extracted.draft) return;

  let draft = await repo.findDraftByObligation(obligation.id, userId);
  if (!draft) {
    const result = await draftResponse(ctx, obligation, extracted.draft);
    draft = result.draft;
    await recordAuditEvent(ctx, {
      userId,
      documentId: document.id,
      obligationId: obligation.id,
      draftId: draft.id,
      eventType: "draft_created",
      actorType: "agent",
      summary: `Draft prepared for "${obligation.title}" — nothing is sent without your approval`,
      metadata: { reconciled: true },
    });
  }

  // The approval gate is enforced even if the model never called the tool.
  if (extracted.approvalRequired && draft.status === "draft") {
    await requestUserApproval(ctx, obligation, draft, extracted.actionTarget);
    await recordAuditEvent(ctx, {
      userId,
      documentId: document.id,
      obligationId: obligation.id,
      draftId: draft.id,
      eventType: "approval_required",
      actorType: "agent",
      summary: `Approval required: "${obligation.title}" — Triage stopped at the approval gate`,
      metadata: { reconciled: true },
    });
  }
}
