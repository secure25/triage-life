import { APPROVAL_TTL_MS } from "@shared/const";
import type { Approval, Draft, Obligation } from "../../drizzle/schema";
import type { TriageRepository } from "../repository";
import { draftContentHash } from "../agent/tools";

/**
 * Approval and execution model (spec §8). Approval is a first-class record,
 * not a button: it snapshots the exact approved payload, expires, and is
 * invalidated the moment the draft changes. Execution — simulated in v1 —
 * is only possible while a matching, active approval exists.
 *
 * These invariants are enforced here, in one place, so every caller
 * (tRPC mutations, tests, future integrations) inherits them.
 */

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

export type ApproveResult = {
  approval: Approval;
  draft: Draft;
  execution: ExecuteResult;
};

export async function approveDraft(
  repo: TriageRepository,
  input: { draftId: string; userId: number },
): Promise<{ approval: Approval; draft: Draft }> {
  const draft = await repo.getDraft(input.draftId, input.userId);
  if (!draft) throw new ApprovalError("Draft not found");
  if (draft.status === "executed_simulated") {
    throw new ApprovalError("This action was already executed");
  }
  if (draft.status === "rejected" || draft.status === "dismissed") {
    throw new ApprovalError("This draft is no longer active");
  }

  const existing = await repo.findActiveApprovalForDraft(draft.id, input.userId);
  if (existing) {
    throw new ApprovalError("This draft is already approved");
  }

  const obligation = await findObligationForDraft(repo, draft);
  const actionSummary = buildActionSummary(draft, obligation);

  const approval = await repo.createApproval({
    draftId: draft.id,
    userId: input.userId,
    actionSummary,
    channel: draft.channel,
    payloadSnapshot: { subject: draft.subject, body: draft.body },
    approvedContentHash: draft.contentHash,
    approvedBy: input.userId,
    approvedAt: new Date(),
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    status: "active",
  });

  const updatedDraft = await repo.updateDraft(draft.id, input.userId, {
    status: "approved",
    approvedAt: new Date(),
  });

  await repo.createAuditEvent({
    userId: input.userId,
    documentId: obligation?.documentId ?? null,
    obligationId: obligation?.id ?? null,
    draftId: draft.id,
    eventType: "action_approved",
    actorType: "user",
    summary: `You approved: ${actionSummary}`,
    metadata: { approvalId: approval.id },
  });

  return { approval, draft: updatedDraft ?? draft };
}

export type ExecuteResult = {
  simulated: true;
  note: string;
  actionSummary: string;
};

/**
 * The safety gate. Simulated execution happens only when:
 *  1. the draft status is 'approved',
 *  2. an active, unexpired approval exists, and
 *  3. the draft content still hashes to the approved content.
 * Anything else is refused — never a silent pass-through.
 */
export async function executeDraft(
  repo: TriageRepository,
  input: { draftId: string; userId: number },
): Promise<{ approval: Approval; draft: Draft; execution: ExecuteResult }> {
  const draft = await repo.getDraft(input.draftId, input.userId);
  if (!draft) throw new ApprovalError("Draft not found");
  if (draft.status !== "approved") {
    throw new ApprovalError(
      "Execution blocked: an explicit approval is required before anything runs.",
    );
  }

  const approval = await repo.findActiveApprovalForDraft(draft.id, input.userId);
  if (!approval) {
    throw new ApprovalError(
      "Execution blocked: no active approval for this draft.",
    );
  }
  if (approval.expiresAt.getTime() < Date.now()) {
    await repo.updateApproval(approval.id, input.userId, {
      status: "expired",
    });
    throw new ApprovalError("The approval has expired — approve again to execute.");
  }
  if (approval.approvedContentHash !== draft.contentHash) {
    throw new ApprovalError(
      "Execution blocked: the draft changed after approval. Approve again.",
    );
  }

  const obligation = await findObligationForDraft(repo, draft);
  const execution: ExecuteResult = {
    simulated: true,
    note:
      "Simulation only — no real message was sent, no real account was touched.",
    actionSummary: approval.actionSummary,
  };

  const updatedApproval = await repo.updateApproval(approval.id, input.userId, {
    executionStatus: "executed_simulated",
    executedAt: new Date(),
    executionResult: execution,
  });

  const updatedDraft = await repo.updateDraft(draft.id, input.userId, {
    status: "executed_simulated",
    sentAt: new Date(),
  });

  if (obligation) {
    await repo.updateObligation(obligation.id, input.userId, {
      status: "handled",
    });
  }

  await repo.createAuditEvent({
    userId: input.userId,
    documentId: obligation?.documentId ?? null,
    obligationId: obligation?.id ?? null,
    draftId: draft.id,
    eventType: "action_executed",
    actorType: "system",
    summary: `Simulated execution: ${approval.actionSummary}`,
    metadata: { simulated: true, approvalId: approval.id },
  });

  return {
    approval: updatedApproval ?? approval,
    draft: updatedDraft ?? draft,
    execution,
  };
}

/** Approve, then immediately run the (simulated) execution. */
export async function approveAndExecute(
  repo: TriageRepository,
  input: { draftId: string; userId: number },
): Promise<ApproveResult> {
  const { approval, draft } = await approveDraft(repo, input);
  const executed = await executeDraft(repo, input);
  return { approval, draft: executed.draft, execution: executed.execution };
}

/**
 * Edit a draft. Any content change invalidates existing approvals and
 * returns the draft to the approval gate (spec §8).
 */
export async function editDraft(
  repo: TriageRepository,
  input: {
    draftId: string;
    userId: number;
    subject: string | null;
    body: string;
  },
): Promise<Draft> {
  const draft = await repo.getDraft(input.draftId, input.userId);
  if (!draft) throw new ApprovalError("Draft not found");
  if (draft.status === "executed_simulated") {
    throw new ApprovalError("This action was already executed and cannot be edited");
  }

  const contentHash = draftContentHash(input.subject, input.body);
  const changed = contentHash !== draft.contentHash;

  const activeApproval = await repo.findActiveApprovalForDraft(draft.id, input.userId);
  let invalidated = false;
  if (changed && activeApproval) {
    await repo.updateApproval(activeApproval.id, input.userId, {
      status: "invalidated",
      invalidatedAt: new Date(),
      invalidationReason: "Draft was edited after approval",
    });
    invalidated = true;
  }

  const updated = await repo.updateDraft(draft.id, input.userId, {
    subject: input.subject,
    body: input.body,
    contentHash,
    status: draft.status === "approved" ? "awaiting_approval" : draft.status,
    approvedAt: null,
    createdBy: draft.createdBy === "agent" ? "user" : draft.createdBy,
  });

  const obligation = await findObligationForDraft(repo, draft);
  await repo.createAuditEvent({
    userId: input.userId,
    documentId: obligation?.documentId ?? null,
    obligationId: obligation?.id ?? null,
    draftId: draft.id,
    eventType: "draft_edited",
    actorType: "user",
    summary: changed ? "Draft edited" : "Draft saved without changes",
    metadata: { invalidatedApproval: invalidated },
  });
  if (invalidated) {
    await repo.createAuditEvent({
      userId: input.userId,
      documentId: obligation?.documentId ?? null,
      obligationId: obligation?.id ?? null,
      draftId: draft.id,
      eventType: "approval_invalidated",
      actorType: "system",
      summary: "Approval invalidated — the draft changed after approval",
    });
  }

  return updated ?? draft;
}

/** Reject the drafted action. The obligation stays open for manual handling. */
export async function rejectDraft(
  repo: TriageRepository,
  input: { draftId: string; userId: number; reason?: string },
): Promise<Draft> {
  const draft = await repo.getDraft(input.draftId, input.userId);
  if (!draft) throw new ApprovalError("Draft not found");
  if (draft.status === "executed_simulated") {
    throw new ApprovalError("This action was already executed");
  }

  const activeApproval = await repo.findActiveApprovalForDraft(draft.id, input.userId);
  if (activeApproval) {
    await repo.updateApproval(activeApproval.id, input.userId, {
      status: "invalidated",
      invalidatedAt: new Date(),
      invalidationReason: "User rejected the action",
    });
  }

  const updated = await repo.updateDraft(draft.id, input.userId, {
    status: "rejected",
  });

  const obligation = await findObligationForDraft(repo, draft);
  if (obligation && obligation.status !== "handled" && obligation.status !== "dismissed") {
    await repo.updateObligation(obligation.id, input.userId, {
      status: "in_progress",
    });
  }

  await repo.createAuditEvent({
    userId: input.userId,
    documentId: obligation?.documentId ?? null,
    obligationId: obligation?.id ?? null,
    draftId: draft.id,
    eventType: "action_rejected",
    actorType: "user",
    summary: `You rejected: ${buildActionSummary(draft, obligation)}`,
    metadata: input.reason ? { reason: input.reason } : undefined,
  });

  return updated ?? draft;
}

/** Dismiss a drafted action entirely (draft + obligation leave the queue). */
export async function dismissDraft(
  repo: TriageRepository,
  input: { draftId: string; userId: number },
): Promise<Draft> {
  const draft = await repo.getDraft(input.draftId, input.userId);
  if (!draft) throw new ApprovalError("Draft not found");
  if (draft.status === "executed_simulated") {
    throw new ApprovalError("This action was already executed");
  }

  const updated = await repo.updateDraft(draft.id, input.userId, {
    status: "dismissed",
  });

  const obligation = await findObligationForDraft(repo, draft);
  if (obligation) {
    await repo.updateObligation(obligation.id, input.userId, {
      status: "dismissed",
    });
  }

  await repo.createAuditEvent({
    userId: input.userId,
    documentId: obligation?.documentId ?? null,
    obligationId: obligation?.id ?? null,
    draftId: draft.id,
    eventType: "action_dismissed",
    actorType: "user",
    summary: "You dismissed this action",
  });

  return updated ?? draft;
}

// ---------------------------------------------------------------------------

async function findObligationForDraft(
  repo: TriageRepository,
  draft: Draft,
): Promise<Obligation | undefined> {
  return repo.getObligation(draft.obligationId, draft.userId);
}

function buildActionSummary(draft: Draft, obligation: Obligation | undefined): string {
  const verb =
    draft.channel === "reminder"
      ? "Add a local reminder"
      : draft.channel === "email"
        ? "Send an email"
        : "Submit";
  const subject = draft.subject ? ` "${draft.subject}"` : "";
  const task = obligation ? ` for "${obligation.title}"` : "";
  return `${verb}${subject}${task} (simulation — nothing real is sent)`;
}
