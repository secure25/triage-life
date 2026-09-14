import type {
  AgentRun,
  Approval,
  AuditEvent,
  Document,
  Draft,
  InsertAgentRun,
  InsertApproval,
  InsertAuditEvent,
  InsertDocument,
  InsertDraft,
  InsertObligation,
  InsertUser,
  Obligation,
  User,
} from "../../drizzle/schema";

/**
 * Data-access boundary for Triage-Life.
 *
 * Every method that reads or writes a domain row takes the owning `userId`
 * and enforces it, so a caller can never touch another user's data even by
 * guessing IDs. Tests run against the in-memory implementation; production
 * uses Drizzle/PostgreSQL.
 */

export type ObligationFilters = {
  status?: Obligation["status"][];
  urgency?: Obligation["urgency"];
  category?: string;
  dueBefore?: Date;
  includeHandled?: boolean;
};

export type QueueMetrics = {
  openItems: number;
  dueThisWeek: number;
  waitingOnYou: number;
  minutesSaved: number;
};

export interface TriageRepository {
  // Users
  getUserByOpenId(openId: string): Promise<User | undefined>;
  upsertUser(user: InsertUser): Promise<User>;

  // Documents
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: string, userId: number): Promise<Document | undefined>;
  listDocuments(userId: number, limit?: number): Promise<Document[]>;
  updateDocument(
    id: string,
    userId: number,
    patch: Partial<InsertDocument>,
  ): Promise<Document | undefined>;
  /** Delete the row (cascades obligations/drafts/approvals/runs/events). */
  deleteDocument(id: string, userId: number): Promise<boolean>;

  // Obligations
  createObligation(obligation: InsertObligation): Promise<Obligation>;
  getObligation(id: string, userId: number): Promise<Obligation | undefined>;
  /** Idempotency anchor: reprocessing a document updates the same row. */
  findObligationByTitle(
    documentId: string,
    userId: number,
    title: string,
  ): Promise<Obligation | undefined>;
  updateObligation(
    id: string,
    userId: number,
    patch: Partial<InsertObligation>,
  ): Promise<Obligation | undefined>;
  listObligations(userId: number, filters?: ObligationFilters): Promise<Obligation[]>;
  listObligationsByDocument(
    documentId: string,
    userId: number,
  ): Promise<Obligation[]>;

  // Drafts
  createDraft(draft: InsertDraft): Promise<Draft>;
  getDraft(id: string, userId: number): Promise<Draft | undefined>;
  findDraftByObligation(
    obligationId: string,
    userId: number,
  ): Promise<Draft | undefined>;
  updateDraft(
    id: string,
    userId: number,
    patch: Partial<InsertDraft>,
  ): Promise<Draft | undefined>;

  // Approvals
  createApproval(approval: InsertApproval): Promise<Approval>;
  getApproval(id: string, userId: number): Promise<Approval | undefined>;
  findActiveApprovalForDraft(
    draftId: string,
    userId: number,
  ): Promise<Approval | undefined>;
  updateApproval(
    id: string,
    userId: number,
    patch: Partial<InsertApproval>,
  ): Promise<Approval | undefined>;

  // Agent runs
  createAgentRun(run: InsertAgentRun): Promise<AgentRun>;
  updateAgentRun(
    id: string,
    userId: number,
    patch: Partial<InsertAgentRun>,
  ): Promise<AgentRun | undefined>;
  listAgentRunsByDocument(
    documentId: string,
    userId: number,
  ): Promise<AgentRun[]>;

  // Audit events
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  listAuditEvents(
    userId: number,
    opts?: { limit?: number; before?: Date; documentId?: string },
  ): Promise<AuditEvent[]>;

  // Dashboard
  getMetrics(userId: number): Promise<QueueMetrics>;
}
