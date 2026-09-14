import { randomUUID } from "node:crypto";
import type {
  AgentRun,
  Approval,
  AuditEvent,
  Document,
  Draft,
  Obligation,
  User,
} from "../../drizzle/schema";
import type {
  InsertAgentRun,
  InsertApproval,
  InsertAuditEvent,
  InsertDocument,
  InsertDraft,
  InsertObligation,
  InsertUser,
} from "../../drizzle/schema";
import type {
  ObligationFilters,
  QueueMetrics,
  TriageRepository,
} from "./types";

/**
 * In-memory TriageRepository. Used by the test suite (no database required)
 * and as the fallback store when DATABASE_URL is not configured, so the
 * project stays runnable for local demos. Data does not survive restarts.
 */

const OPEN_STATUSES: Obligation["status"][] = [
  "needs_decision",
  "due_soon",
  "waiting_for_info",
  "in_progress",
];

export class MemoryTriageRepository implements TriageRepository {
  private users: User[] = [];
  private documents: Document[] = [];
  private obligations: Obligation[] = [];
  private drafts: Draft[] = [];
  private approvals: Approval[] = [];
  private agentRuns: AgentRun[] = [];
  private auditEvents: AuditEvent[] = [];
  private nextUserId = 1;

  // Users

  async getUserByOpenId(openId: string): Promise<User | undefined> {
    return this.users.find(user => user.openId === openId);
  }

  async upsertUser(user: InsertUser): Promise<User> {
    const now = new Date();
    const existing = this.users.find(row => row.openId === user.openId);
    if (existing) {
      const updated: User = {
        ...existing,
        name: user.name !== undefined ? user.name : existing.name,
        email: user.email !== undefined ? user.email : existing.email,
        loginMethod:
          user.loginMethod !== undefined ? user.loginMethod : existing.loginMethod,
        role: user.role !== undefined ? user.role : existing.role,
        lastSignedIn: user.lastSignedIn ?? now,
        updatedAt: now,
      };
      this.users = this.users.map(row => (row.id === existing.id ? updated : row));
      return updated;
    }

    const created: User = {
      id: this.nextUserId++,
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.role ?? "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now,
    };
    this.users.push(created);
    return created;
  }

  // Documents

  async createDocument(document: InsertDocument): Promise<Document> {
    const now = new Date();
    const created: Document = {
      id: document.id ?? randomUUID(),
      userId: document.userId,
      originalFilename: document.originalFilename,
      storageKey: document.storageKey,
      storageUrl: document.storageUrl ?? null,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      sha256: document.sha256,
      documentType: document.documentType ?? null,
      uploadStatus: document.uploadStatus ?? "uploaded",
      processingStatus: document.processingStatus ?? "pending",
      processingError: document.processingError ?? null,
      ocrText: document.ocrText ?? null,
      ocrConfidence: document.ocrConfidence ?? null,
      ocrPages: document.ocrPages ?? null,
      source: document.source ?? "upload",
      isSynthetic: document.isSynthetic ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.push(created);
    return created;
  }

  async getDocument(id: string, userId: number): Promise<Document | undefined> {
    return this.documents.find(
      document => document.id === id && document.userId === userId,
    );
  }

  async listDocuments(userId: number, limit = 50): Promise<Document[]> {
    return this.documents
      .filter(document => document.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateDocument(
    id: string,
    userId: number,
    patch: Partial<InsertDocument>,
  ): Promise<Document | undefined> {
    const existing = this.documents.find(
      document => document.id === id && document.userId === userId,
    );
    if (!existing) return undefined;
    const updated: Document = { ...existing, ...patch, updatedAt: new Date() };
    this.documents = this.documents.map(document =>
      document.id === id ? updated : document,
    );
    return updated;
  }

  async deleteDocument(id: string, userId: number): Promise<boolean> {
    const existing = this.documents.find(
      document => document.id === id && document.userId === userId,
    );
    if (!existing) return false;
    this.documents = this.documents.filter(
      document => document.id !== id || document.userId !== userId,
    );
    // Cascade dependents, mirroring the database foreign keys.
    const obligationIds = new Set(
      this.obligations
        .filter(obligation => obligation.documentId === id)
        .map(obligation => obligation.id),
    );
    this.obligations = this.obligations.filter(
      obligation => !obligationIds.has(obligation.id),
    );
    const draftIds = new Set(
      this.drafts
        .filter(draft => obligationIds.has(draft.obligationId))
        .map(draft => draft.id),
    );
    this.drafts = this.drafts.filter(draft => !draftIds.has(draft.id));
    this.approvals = this.approvals.filter(
      approval => !draftIds.has(approval.draftId),
    );
    this.agentRuns = this.agentRuns.filter(run => run.documentId !== id);
    this.auditEvents = this.auditEvents.filter(
      event => event.documentId !== id || event.userId !== userId,
    );
    return true;
  }

  // Obligations

  async createObligation(obligation: InsertObligation): Promise<Obligation> {
    const now = new Date();
    const created: Obligation = {
      id: obligation.id ?? randomUUID(),
      documentId: obligation.documentId,
      userId: obligation.userId,
      title: obligation.title,
      description: obligation.description ?? null,
      category: obligation.category ?? null,
      urgency: obligation.urgency ?? "medium",
      status: obligation.status ?? "needs_decision",
      dueAt: obligation.dueAt ?? null,
      amountCents: obligation.amountCents ?? null,
      currency: obligation.currency ?? null,
      requiredUserDecision: obligation.requiredUserDecision ?? null,
      missingInformation: obligation.missingInformation ?? null,
      confidence: obligation.confidence ?? null,
      sourceQuote: obligation.sourceQuote ?? null,
      sourcePage: obligation.sourcePage ?? null,
      recommendedNextStep: obligation.recommendedNextStep ?? null,
      approvalRequired: obligation.approvalRequired ?? false,
      minutesSaved: obligation.minutesSaved ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.obligations.push(created);
    return created;
  }

  async getObligation(id: string, userId: number): Promise<Obligation | undefined> {
    return this.obligations.find(
      obligation => obligation.id === id && obligation.userId === userId,
    );
  }

  async findObligationByTitle(
    documentId: string,
    userId: number,
    title: string,
  ): Promise<Obligation | undefined> {
    return this.obligations.find(
      obligation =>
        obligation.documentId === documentId &&
        obligation.userId === userId &&
        obligation.title === title,
    );
  }

  async updateObligation(
    id: string,
    userId: number,
    patch: Partial<InsertObligation>,
  ): Promise<Obligation | undefined> {
    const existing = this.obligations.find(
      obligation => obligation.id === id && obligation.userId === userId,
    );
    if (!existing) return undefined;
    const updated: Obligation = { ...existing, ...patch, updatedAt: new Date() };
    this.obligations = this.obligations.map(obligation =>
      obligation.id === id ? updated : obligation,
    );
    return updated;
  }

  async listObligations(
    userId: number,
    filters: ObligationFilters = {},
  ): Promise<Obligation[]> {
    const { status, urgency, category, dueBefore, includeHandled = false } = filters;
    return this.obligations
      .filter(obligation => obligation.userId === userId)
      .filter(obligation => {
        if (status && !status.includes(obligation.status)) return false;
        if (!status && !includeHandled) {
          if (obligation.status === "handled" || obligation.status === "dismissed") {
            return false;
          }
        }
        if (urgency && obligation.urgency !== urgency) return false;
        if (category && obligation.category !== category) return false;
        if (dueBefore) {
          if (!obligation.dueAt || obligation.dueAt > dueBefore) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Soonest due first; undated items last.
        if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  async listObligationsByDocument(
    documentId: string,
    userId: number,
  ): Promise<Obligation[]> {
    return this.obligations
      .filter(
        obligation =>
          obligation.documentId === documentId && obligation.userId === userId,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Drafts

  async createDraft(draft: InsertDraft): Promise<Draft> {
    const now = new Date();
    const created: Draft = {
      id: draft.id ?? randomUUID(),
      obligationId: draft.obligationId,
      userId: draft.userId,
      channel: draft.channel ?? "email",
      subject: draft.subject ?? null,
      body: draft.body,
      status: draft.status ?? "draft",
      createdBy: draft.createdBy ?? "agent",
      contentHash: draft.contentHash,
      approvedAt: draft.approvedAt ?? null,
      sentAt: draft.sentAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.drafts.push(created);
    return created;
  }

  async getDraft(id: string, userId: number): Promise<Draft | undefined> {
    return this.drafts.find(draft => draft.id === id && draft.userId === userId);
  }

  async findDraftByObligation(
    obligationId: string,
    userId: number,
  ): Promise<Draft | undefined> {
    return this.drafts.find(
      draft =>
        draft.obligationId === obligationId && draft.userId === userId,
    );
  }

  async updateDraft(
    id: string,
    userId: number,
    patch: Partial<InsertDraft>,
  ): Promise<Draft | undefined> {
    const existing = this.drafts.find(
      draft => draft.id === id && draft.userId === userId,
    );
    if (!existing) return undefined;
    const updated: Draft = { ...existing, ...patch, updatedAt: new Date() };
    this.drafts = this.drafts.map(draft => (draft.id === id ? updated : draft));
    return updated;
  }

  // Approvals

  async createApproval(approval: InsertApproval): Promise<Approval> {
    const created: Approval = {
      id: approval.id ?? randomUUID(),
      draftId: approval.draftId,
      userId: approval.userId,
      actionSummary: approval.actionSummary,
      channel: approval.channel ?? "email",
      payloadSnapshot: approval.payloadSnapshot,
      approvedContentHash: approval.approvedContentHash,
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt ?? new Date(),
      expiresAt: approval.expiresAt,
      status: approval.status ?? "active",
      invalidatedAt: approval.invalidatedAt ?? null,
      invalidationReason: approval.invalidationReason ?? null,
      executionStatus: approval.executionStatus ?? "not_executed",
      executedAt: approval.executedAt ?? null,
      executionResult: approval.executionResult ?? null,
      createdAt: new Date(),
    };
    this.approvals.push(created);
    return created;
  }

  async getApproval(id: string, userId: number): Promise<Approval | undefined> {
    return this.approvals.find(
      approval => approval.id === id && approval.userId === userId,
    );
  }

  async findActiveApprovalForDraft(
    draftId: string,
    userId: number,
  ): Promise<Approval | undefined> {
    return this.approvals.find(
      approval =>
        approval.draftId === draftId &&
        approval.userId === userId &&
        approval.status === "active",
    );
  }

  async updateApproval(
    id: string,
    userId: number,
    patch: Partial<InsertApproval>,
  ): Promise<Approval | undefined> {
    const existing = this.approvals.find(
      approval => approval.id === id && approval.userId === userId,
    );
    if (!existing) return undefined;
    const updated: Approval = { ...existing, ...patch };
    this.approvals = this.approvals.map(approval =>
      approval.id === id ? updated : approval,
    );
    return updated;
  }

  // Agent runs

  async createAgentRun(run: InsertAgentRun): Promise<AgentRun> {
    const created: AgentRun = {
      id: run.id ?? randomUUID(),
      documentId: run.documentId,
      userId: run.userId,
      runType: run.runType,
      status: run.status ?? "running",
      provider: run.provider ?? null,
      modelId: run.modelId ?? null,
      startedAt: run.startedAt ?? new Date(),
      completedAt: run.completedAt ?? null,
      error: run.error ?? null,
      structuredOutput: run.structuredOutput ?? null,
      toolTrace: run.toolTrace ?? null,
      createdAt: new Date(),
    };
    this.agentRuns.push(created);
    return created;
  }

  async updateAgentRun(
    id: string,
    userId: number,
    patch: Partial<InsertAgentRun>,
  ): Promise<AgentRun | undefined> {
    const existing = this.agentRuns.find(
      run => run.id === id && run.userId === userId,
    );
    if (!existing) return undefined;
    const updated: AgentRun = { ...existing, ...patch };
    this.agentRuns = this.agentRuns.map(run => (run.id === id ? updated : run));
    return updated;
  }

  async listAgentRunsByDocument(
    documentId: string,
    userId: number,
  ): Promise<AgentRun[]> {
    return this.agentRuns
      .filter(run => run.documentId === documentId && run.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  // Audit events

  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const created: AuditEvent = {
      id: event.id ?? randomUUID(),
      userId: event.userId,
      documentId: event.documentId ?? null,
      obligationId: event.obligationId ?? null,
      draftId: event.draftId ?? null,
      eventType: event.eventType,
      actorType: event.actorType ?? "system",
      summary: event.summary,
      metadata: event.metadata ?? null,
      createdAt: new Date(),
    };
    this.auditEvents.push(created);
    return created;
  }

  async listAuditEvents(
    userId: number,
    opts: { limit?: number; before?: Date; documentId?: string } = {},
  ): Promise<AuditEvent[]> {
    const { limit = 100, before, documentId } = opts;
    return this.auditEvents
      .filter(event => event.userId === userId)
      .filter(event => (before ? event.createdAt < before : true))
      .filter(event => (documentId ? event.documentId === documentId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Dashboard

  async getMetrics(userId: number): Promise<QueueMetrics> {
    const rows = this.obligations.filter(
      obligation => obligation.userId === userId,
    );
    const now = Date.now();
    const weekAhead = now + 7 * 24 * 60 * 60 * 1000;

    const open = rows.filter(obligation => OPEN_STATUSES.includes(obligation.status));
    const dueThisWeek = open.filter(
      obligation =>
        obligation.dueAt !== null &&
        obligation.dueAt.getTime() <= weekAhead,
    );
    const waiting = rows.filter(
      obligation =>
        obligation.status === "needs_decision" ||
        obligation.status === "waiting_for_info",
    );
    const saved = rows
      .filter(obligation => obligation.status === "handled")
      .reduce(
        (total, obligation) => total + (obligation.minutesSaved ?? 0),
        0,
      );

    return {
      openItems: open.length,
      dueThisWeek: dueThisWeek.length,
      waitingOnYou: waiting.length,
      minutesSaved: saved,
    };
  }
}
