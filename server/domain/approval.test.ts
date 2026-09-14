import { describe, expect, it } from "vitest";
import type { Draft, Obligation, User } from "../../drizzle/schema";
import { draftContentHash } from "../agent/tools";
import { MemoryTriageRepository } from "../repository";
import {
  approveAndExecute,
  approveDraft,
  ApprovalError,
  dismissDraft,
  editDraft,
  executeDraft,
  rejectDraft,
} from "./approval";

async function seed(repo: MemoryTriageRepository) {
  const user: User = await repo.upsertUser({
    openId: "email:owner@example.com",
    email: "owner@example.com",
    name: "Owner",
  });
  const other: User = await repo.upsertUser({
    openId: "email:other@example.com",
    email: "other@example.com",
    name: "Other",
  });
  const document = await repo.createDocument({
    userId: user.id,
    originalFilename: "renewal.pdf",
    storageKey: `users/${user.id}/renewal.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 1200,
    sha256: "aa",
  });
  const obligation: Obligation = await repo.createObligation({
    documentId: document.id,
    userId: user.id,
    title: "Confirm renewal",
    status: "needs_decision",
    approvalRequired: true,
    recommendedNextStep: "Reply before the deadline",
  });
  const draft: Draft = await repo.createDraft({
    obligationId: obligation.id,
    userId: user.id,
    channel: "email",
    subject: "Re: renewal",
    body: "Hello,\n\nPlease send alternatives.\n\nBye",
    contentHash: draftContentHash("Re: renewal", "Hello,\n\nPlease send alternatives.\n\nBye"),
  });
  return { user, other, document, obligation, draft };
}

describe("approval and execution model", () => {
  it("refuses execution without an approval (the safety gate)", async () => {
    const repo = new MemoryTriageRepository();
    const { user, draft } = await seed(repo);

    await expect(
      executeDraft(repo, { draftId: draft.id, userId: user.id }),
    ).rejects.toThrow(/Execution blocked.*approval is required/);
  });

  it("refuses execution for another user's draft", async () => {
    const repo = new MemoryTriageRepository();
    const { other, draft } = await seed(repo);

    await expect(
      approveDraft(repo, { draftId: draft.id, userId: other.id }),
    ).rejects.toThrow(ApprovalError);
  });

  it("approves, then executes a simulation — and only once", async () => {
    const repo = new MemoryTriageRepository();
    const { user, obligation, draft } = await seed(repo);

    const { approval } = await approveDraft(repo, {
      draftId: draft.id,
      userId: user.id,
    });
    expect(approval.status).toBe("active");
    expect(approval.payloadSnapshot).toEqual({
      subject: "Re: renewal",
      body: "Hello,\n\nPlease send alternatives.\n\nBye",
    });
    expect(approval.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const executed = await executeDraft(repo, {
      draftId: draft.id,
      userId: user.id,
    });
    expect(executed.execution.simulated).toBe(true);
    expect(executed.execution.note).toContain("Simulation only");
    expect(executed.draft.status).toBe("executed_simulated");
    expect(executed.approval.executionStatus).toBe("executed_simulated");

    const handled = await repo.getObligation(obligation.id, user.id);
    expect(handled?.status).toBe("handled");

    // Second execution must be refused.
    await expect(
      executeDraft(repo, { draftId: draft.id, userId: user.id }),
    ).rejects.toThrow(ApprovalError);
  });

  it("invalidates the approval when the draft is edited after approval", async () => {
    const repo = new MemoryTriageRepository();
    const { user, draft } = await seed(repo);

    await approveDraft(repo, { draftId: draft.id, userId: user.id });

    const edited = await editDraft(repo, {
      draftId: draft.id,
      userId: user.id,
      subject: "Re: renewal (edited)",
      body: "Changed my mind — different body.",
    });
    expect(edited.status).toBe("awaiting_approval");

    const invalidEvents = await repo.listAuditEvents(user.id, { limit: 50 });
    expect(
      invalidEvents.some(event => event.eventType === "approval_invalidated"),
    ).toBe(true);

    // Execution after edit is blocked: hash no longer matches.
    await expect(
      executeDraft(repo, { draftId: draft.id, userId: user.id }),
    ).rejects.toThrow(/Execution blocked/);

    // Re-approval with the new content executes fine.
    const reapproved = await approveAndExecute(repo, {
      draftId: draft.id,
      userId: user.id,
    });
    expect(reapproved.draft.status).toBe("executed_simulated");
    expect(reapproved.execution.simulated).toBe(true);
  });

  it("blocks execution when the approval has expired", async () => {
    const repo = new MemoryTriageRepository();
    const { user, draft } = await seed(repo);

    // Approve, then age the approval past its expiry.
    const { approval } = await approveDraft(repo, {
      draftId: draft.id,
      userId: user.id,
    });
    await repo.updateApproval(approval.id, user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      executeDraft(repo, { draftId: draft.id, userId: user.id }),
    ).rejects.toThrow(/expired/i);
  });

  it("reject keeps the task open and invalidates any approval", async () => {
    const repo = new MemoryTriageRepository();
    const { user, obligation, draft } = await seed(repo);

    await approveDraft(repo, { draftId: draft.id, userId: user.id });
    const rejected = await rejectDraft(repo, {
      draftId: draft.id,
      userId: user.id,
      reason: "I'll call them instead",
    });
    expect(rejected.status).toBe("rejected");

    const stillOpen = await repo.getObligation(obligation.id, user.id);
    expect(stillOpen?.status).toBe("in_progress");

    await expect(
      executeDraft(repo, { draftId: draft.id, userId: user.id }),
    ).rejects.toThrow(/Execution blocked/);
  });

  it("dismiss removes the task from the queue", async () => {
    const repo = new MemoryTriageRepository();
    const { user, obligation, draft } = await seed(repo);

    const dismissed = await dismissDraft(repo, {
      draftId: draft.id,
      userId: user.id,
    });
    expect(dismissed.status).toBe("dismissed");

    const gone = await repo.getObligation(obligation.id, user.id);
    expect(gone?.status).toBe("dismissed");
  });

  it("refuses to edit an executed draft", async () => {
    const repo = new MemoryTriageRepository();
    const { user, draft } = await seed(repo);

    await approveAndExecute(repo, { draftId: draft.id, userId: user.id });

    await expect(
      editDraft(repo, {
        draftId: draft.id,
        userId: user.id,
        subject: "too late",
        body: "already sent",
      }),
    ).rejects.toThrow(/already executed/);
  });

  it("writes an audit event for every state change", async () => {
    const repo = new MemoryTriageRepository();
    const { user, draft } = await seed(repo);

    await approveAndExecute(repo, { draftId: draft.id, userId: user.id });
    const events = await repo.listAuditEvents(user.id, { limit: 50 });

    const types = events.map(event => event.eventType);
    expect(types).toContain("action_approved");
    expect(types).toContain("action_executed");
    const executed = events.find(event => event.eventType === "action_executed");
    expect(executed?.metadata).toMatchObject({ simulated: true });
  });
});
