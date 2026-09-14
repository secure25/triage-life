import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import { createUser, makeContext, waitFor } from "./helpers";

function createCaller(ctx: ReturnType<typeof makeContext>) {
  return appRouter.createCaller(ctx);
}

/**
 * End-to-end (spec §11):
 * upload synthetic document → OCR → structured extraction → task creation →
 * draft creation → approval required → user approves → simulated execution →
 * audit event.
 */
describe("end-to-end document pipeline", () => {
  it("runs a demo document through the full approval-gated flow", async () => {
    const repo = makeContext(null).repo;
    const user = await createUser(repo, "e2e@example.com", "E2E Runner");
    const caller = createCaller(makeContext(user));

    // 1. Upload (synthetic demo documents enter through the same pipeline).
    const demo = await caller.demo.create();
    expect(demo.created).toHaveLength(3);

    const insuranceId = demo.created[0]!;
    await waitFor(async () => {
      const detail = await caller.documents.get({ id: insuranceId });
      return detail.document.processingStatus === "completed";
    });

    // 2. OCR + extraction happened, with visible confidence and pages.
    const detail = await caller.documents.get({ id: insuranceId });
    expect(detail.document.ocrText).toContain("NORTHSTAR HEALTH INSURANCE");
    expect(detail.document.ocrConfidence).not.toBeNull();
    expect(detail.document.documentType).toBe("insurance_renewal");
    expect(detail.document.isSynthetic).toBe(true);

    // 3. Structured obligation became a queue task…
    expect(detail.obligations).toHaveLength(1);
    const { obligation, draft, approval } = detail.obligations[0]!;
    expect(obligation.title).toBe("Confirm Northstar plan renewal");
    expect(obligation.amountCents).toBe(3420);
    expect(obligation.dueAt).not.toBeNull();
    expect(obligation.approvalRequired).toBe(true);

    // …and appears in the queue.
    const queue = await caller.queue.list();
    const queued = queue.find(item => item.obligation.id === obligation.id);
    expect(queued).toBeDefined();
    expect(queued?.obligation.status).toBe("needs_decision");

    // 4. A draft was created — and the workflow stopped at the approval gate.
    expect(draft).toBeDefined();
    expect(draft!.status).toBe("awaiting_approval");
    expect(draft!.body).toContain("alternatives");
    expect(approval).toBeNull(); // not approved yet

    // 5. The user approves — Triage runs the simulation immediately.
    const approved = await caller.drafts.approve({ draftId: draft!.id });
    expect(approved.execution.simulated).toBe(true);
    expect(approved.execution.note).toContain("Simulation only");
    expect(approved.draft.status).toBe("executed_simulated");

    // The obligation is handled and the approval record captured the payload.
    const afterApprove = await caller.documents.get({ id: insuranceId });
    const approvedRow = afterApprove.obligations[0]!;
    expect(approvedRow.obligation.status).toBe("handled");
    expect(approvedRow.approval).not.toBeNull();
    expect(approvedRow.approval!.executionStatus).toBe("executed_simulated");
    expect(approvedRow.approval!.payloadSnapshot).toEqual({
      subject: draft!.subject,
      body: draft!.body,
    });

    // 6. The audit trail covers the whole story.
    const events = await caller.audit.list({ limit: 200 });
    const types = events.map(event => event.eventType);
    for (const expected of [
      "document_uploaded",
      "ocr_started",
      "ocr_completed",
      "task_created",
      "deadline_detected",
      "draft_created",
      "approval_required",
      "action_approved",
      "action_executed",
    ]) {
      expect(types).toContain(expected);
    }
    const executed = events.find(event => event.eventType === "action_executed");
    expect(executed?.metadata).toMatchObject({ simulated: true });

    // 7. Metrics reflect the handled work.
    const metrics = await caller.metrics.dashboard();
    expect(metrics.metrics.minutesSaved).toBeGreaterThan(0);
  }, 30_000);

  it("marks the school form as waiting for information, not decidable", async () => {
    const repo = makeContext(null).repo;
    const user = await createUser(repo, "e2e-school@example.com", "E2E School");
    const caller = createCaller(makeContext(user));

    const demo = await caller.demo.create();
    const schoolId = demo.created[1]!;

    await waitFor(async () => {
      const detail = await caller.documents.get({ id: schoolId });
      return detail.document.processingStatus === "completed";
    });

    const detail = await caller.documents.get({ id: schoolId });
    const { obligation } = detail.obligations[0]!;
    expect(obligation.status).toBe("waiting_for_info");
    expect(obligation.missingInformation).toContain(
      "Secondary emergency contact (name and phone number)",
    );
    expect(obligation.urgency).toBe("high"); // due in 2 days
  }, 30_000);

  it("is idempotent: reprocessing updates tasks instead of duplicating them", async () => {
    const repo = makeContext(null).repo;
    const user = await createUser(repo, "e2e-retry@example.com", "E2E Retry");
    const caller = createCaller(makeContext(user));

    const demo = await caller.demo.create();
    const insuranceId = demo.created[0]!;
    await waitFor(async () => {
      const detail = await caller.documents.get({ id: insuranceId });
      return detail.document.processingStatus === "completed";
    });

    const before = await caller.documents.get({ id: insuranceId });
    const obligationBefore = before.obligations[0]!;

    // Force a retry path: reset to failed, then retry.
    await repo.updateDocument(insuranceId, user.id, {
      processingStatus: "failed",
      processingError: "forced for test",
    });
    await caller.documents.retryProcessing({ id: insuranceId });

    await waitFor(async () => {
      const detail = await caller.documents.get({ id: insuranceId });
      return detail.document.processingStatus === "completed";
    });

    const after = await caller.documents.get({ id: insuranceId });
    expect(after.obligations).toHaveLength(1); // no duplicate tasks
    expect(after.obligations[0]!.obligation.id).toBe(
      obligationBefore.obligation.id,
    );
    expect(after.obligations[0]!.draft!.id).toBe(obligationBefore.draft!.id);
  }, 30_000);
});
