import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import { createUser, makeContext } from "./helpers";

function createCaller(ctx: ReturnType<typeof makeContext>) {
  return appRouter.createCaller(ctx);
}

/**
 * Spec §9/§12: every procedure must enforce per-user ownership. A user who
 * guesses another user's IDs gets the same NOT_FOUND as if the row did not
 * exist — never a data leak.
 */
describe("ownership enforcement", () => {
  it("hides another user's document from documents.get", async () => {
    const repo = makeContext(null).repo;
    const alice = await createUser(repo, "alice-own@example.com", "Alice");
    const mallory = await createUser(repo, "mallory-own@example.com", "Mallory");

    const aliceDocument = await repo.createDocument({
      userId: alice.id,
      originalFilename: "alice-secret.pdf",
      storageKey: `users/${alice.id}/alice-secret.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "aa",
    });

    const malloryCaller = createCaller(makeContext(mallory));
    await expect(
      malloryCaller.documents.get({ id: aliceDocument.id }),
    ).rejects.toThrow(/not found/i);

    const aliceCaller = createCaller(makeContext(alice));
    const visible = await aliceCaller.documents.get({ id: aliceDocument.id });
    expect(visible.document.id).toBe(aliceDocument.id);
  });

  it("keeps documents.list scoped to the caller", async () => {
    const repo = makeContext(null).repo;
    const alice = await createUser(repo,alice_email(), "Alice");
    const bob = await createUser(repo, bob_email(), "Bob");

    await repo.createDocument({
      userId: alice.id,
      originalFilename: "a.pdf",
      storageKey: `users/${alice.id}/a.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a1",
    });
    await repo.createDocument({
      userId: bob.id,
      originalFilename: "b.pdf",
      storageKey: `users/${bob.id}/b.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "b1",
    });

    const aliceCaller = createCaller(makeContext(alice));
    const documents = await aliceCaller.documents.list({});
    expect(documents).toHaveLength(1);
    expect(documents[0]!.originalFilename).toBe("a.pdf");
  });

  it("keeps queue items scoped to the caller", async () => {
    const repo = makeContext(null).repo;
    const alice = await createUser(repo, alice_email(2), "Alice");
    const bob = await createUser(repo, bob_email(2), "Bob");

    const document = await repo.createDocument({
      userId: alice.id,
      originalFilename: "a.pdf",
      storageKey: `users/${alice.id}/a.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a2",
    });
    await repo.createObligation({
      documentId: document.id,
      userId: alice.id,
      title: "Alice's task",
    });

    const bobCaller = createCaller(makeContext(bob));
    expect(await bobCaller.queue.list()).toHaveLength(0);

    const aliceCaller = createCaller(makeContext(alice));
    expect(await aliceCaller.queue.list()).toHaveLength(1);
  });

  it("keeps audit events scoped to the caller", async () => {
    const repo = makeContext(null).repo;
    const alice = await createUser(repo, alice_email(3), "Alice");
    const bob = await createUser(repo, bob_email(3), "Bob");

    await repo.createAuditEvent({
      userId: alice.id,
      eventType: "document_uploaded",
      actorType: "user",
      summary: "Alice uploaded something",
    });

    const bobCaller = createCaller(makeContext(bob));
    const bobEvents = await bobCaller.audit.list({});
    expect(bobEvents.every(event => event.userId === bob.id)).toBe(true);
    expect(bobEvents).toHaveLength(0);
  });

  it("refuses to touch another user's obligation or draft", async () => {
    const repo = makeContext(null).repo;
    const alice = await createUser(repo, alice_email(4), "Alice");
    const mallory = await createUser(repo, mallory_email(4), "Mallory");

    const document = await repo.createDocument({
      userId: alice.id,
      originalFilename: "a.pdf",
      storageKey: `users/${alice.id}/a.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a4",
    });
    const obligation = await repo.createObligation({
      documentId: document.id,
      userId: alice.id,
      title: "Alice's task",
    });
    const draft = await repo.createDraft({
      obligationId: obligation.id,
      userId: alice.id,
      channel: "email",
      subject: "s",
      body: "b",
      contentHash: "hash",
    });

    const malloryCaller = createCaller(makeContext(mallory));
    await expect(
      malloryCaller.queue.setStatus({
        obligationId: obligation.id,
        status: "handled",
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      malloryCaller.drafts.approve({ draftId: draft.id }),
    ).rejects.toThrow();
    await expect(
      malloryCaller.drafts.edit({
        draftId: draft.id,
        subject: "hijacked",
        body: "hijacked",
      }),
    ).rejects.toThrow();
  });

  it("refuses to delete another user's document", async () => {
    const repo = makeContext(null).repo;
    const alice = await createUser(repo, alice_email(5), "Alice");
    const mallory = await createUser(repo, mallory_email(5), "Mallory");

    const aliceDocument = await repo.createDocument({
      userId: alice.id,
      originalFilename: "a.pdf",
      storageKey: `users/${alice.id}/a.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a5",
    });

    const malloryCaller = createCaller(makeContext(mallory));
    await expect(
      malloryCaller.documents.delete({ id: aliceDocument.id }),
    ).rejects.toThrow(/not found/i);

    const stillThere = await repo.getDocument(aliceDocument.id, alice.id);
    expect(stillThere).toBeDefined();
  });
});

// Distinct emails per test keep the shared in-memory store isolated.
function alice_email(n?: number) {
  return `alice-own${n ?? 1}@example.com`;
}
function bob_email(n?: number) {
  return `bob-own${n ?? 1}@example.com`;
}
function mallory_email(n?: number) {
  return `mallory-own${n ?? 1}@example.com`;
}
