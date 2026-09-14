import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  agentRuns,
  approvals,
  auditEvents,
  documents,
  drafts,
  obligations,
  users,
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

const OPEN_STATUSES = ["needs_decision", "due_soon", "waiting_for_info", "in_progress"] as const;

/**
 * PostgreSQL implementation of TriageRepository via Drizzle.
 * Every query includes the owning userId predicate.
 */
export class DrizzleTriageRepository implements TriageRepository {
  constructor(private db: NodePgDatabase) {}

  // Users

  async getUserByOpenId(openId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);
    return rows[0];
  }

  async upsertUser(user: InsertUser) {
    const now = new Date();
    const values: InsertUser = { ...user };
    const updateSet: Partial<InsertUser> = {
      lastSignedIn: user.lastSignedIn ?? now,
      updatedAt: now,
    };
    if (user.name !== undefined) updateSet.name = user.name;
    if (user.email !== undefined) updateSet.email = user.email;
    if (user.loginMethod !== undefined) updateSet.loginMethod = user.loginMethod;
    if (user.role !== undefined) updateSet.role = user.role;

    const rows = await this.db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({ target: users.openId, set: updateSet })
      .returning();
    return rows[0]!;
  }

  // Documents

  async createDocument(document: InsertDocument) {
    const rows = await this.db.insert(documents).values(document).returning();
    return rows[0]!;
  }

  async getDocument(id: string, userId: number) {
    const rows = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async listDocuments(userId: number, limit = 50) {
    return this.db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt))
      .limit(limit);
  }

  async updateDocument(id: string, userId: number, patch: Partial<InsertDocument>) {
    const rows = await this.db
      .update(documents)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return rows[0];
  }

  async deleteDocument(id: string, userId: number) {
    // Foreign keys cascade to obligations, drafts, approvals, runs, events.
    const rows = await this.db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning({ id: documents.id });
    return rows.length > 0;
  }

  // Obligations

  async createObligation(obligation: InsertObligation) {
    const rows = await this.db.insert(obligations).values(obligation).returning();
    return rows[0]!;
  }

  async getObligation(id: string, userId: number) {
    const rows = await this.db
      .select()
      .from(obligations)
      .where(and(eq(obligations.id, id), eq(obligations.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async findObligationByTitle(documentId: string, userId: number, title: string) {
    const rows = await this.db
      .select()
      .from(obligations)
      .where(
        and(
          eq(obligations.documentId, documentId),
          eq(obligations.userId, userId),
          eq(obligations.title, title),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async updateObligation(id: string, userId: number, patch: Partial<InsertObligation>) {
    const rows = await this.db
      .update(obligations)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(obligations.id, id), eq(obligations.userId, userId)))
      .returning();
    return rows[0];
  }

  async listObligations(userId: number, filters: ObligationFilters = {}) {
    const { status, urgency, category, dueBefore, includeHandled = false } = filters;
    const conditions = [eq(obligations.userId, userId)];
    if (status && status.length > 0) {
      conditions.push(inArray(obligations.status, status));
    } else if (!includeHandled) {
      conditions.push(
        sql`${obligations.status} NOT IN ('handled', 'dismissed')`,
      );
    }
    if (urgency) conditions.push(eq(obligations.urgency, urgency));
    if (category) conditions.push(eq(obligations.category, category));
    if (dueBefore) {
      conditions.push(lt(obligations.dueAt, dueBefore));
    }
    return this.db
      .select()
      .from(obligations)
      .where(and(...conditions))
      .orderBy(sql`${obligations.dueAt} asc nulls last`);
  }

  async listObligationsByDocument(documentId: string, userId: number) {
    return this.db
      .select()
      .from(obligations)
      .where(
        and(eq(obligations.documentId, documentId), eq(obligations.userId, userId)),
      )
      .orderBy(obligations.createdAt);
  }

  // Drafts

  async createDraft(draft: InsertDraft) {
    const rows = await this.db.insert(drafts).values(draft).returning();
    return rows[0]!;
  }

  async getDraft(id: string, userId: number) {
    const rows = await this.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async findDraftByObligation(obligationId: string, userId: number) {
    const rows = await this.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.obligationId, obligationId), eq(drafts.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async updateDraft(id: string, userId: number, patch: Partial<InsertDraft>) {
    const rows = await this.db
      .update(drafts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
      .returning();
    return rows[0];
  }

  // Approvals

  async createApproval(approval: InsertApproval) {
    const rows = await this.db.insert(approvals).values(approval).returning();
    return rows[0]!;
  }

  async getApproval(id: string, userId: number) {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, id), eq(approvals.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async findActiveApprovalForDraft(draftId: string, userId: number) {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.draftId, draftId),
          eq(approvals.userId, userId),
          eq(approvals.status, "active"),
        ),
      )
      .orderBy(desc(approvals.approvedAt))
      .limit(1);
    return rows[0];
  }

  async updateApproval(id: string, userId: number, patch: Partial<InsertApproval>) {
    const rows = await this.db
      .update(approvals)
      .set(patch)
      .where(and(eq(approvals.id, id), eq(approvals.userId, userId)))
      .returning();
    return rows[0];
  }

  // Agent runs

  async createAgentRun(run: InsertAgentRun) {
    const rows = await this.db.insert(agentRuns).values(run).returning();
    return rows[0]!;
  }

  async updateAgentRun(id: string, userId: number, patch: Partial<InsertAgentRun>) {
    const rows = await this.db
      .update(agentRuns)
      .set(patch)
      .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
      .returning();
    return rows[0];
  }

  async listAgentRunsByDocument(documentId: string, userId: number) {
    return this.db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.documentId, documentId), eq(agentRuns.userId, userId)))
      .orderBy(desc(agentRuns.startedAt));
  }

  // Audit events

  async createAuditEvent(event: InsertAuditEvent) {
    const rows = await this.db.insert(auditEvents).values(event).returning();
    return rows[0]!;
  }

  async listAuditEvents(
    userId: number,
    opts: { limit?: number; before?: Date; documentId?: string } = {},
  ) {
    const { limit = 100, before, documentId } = opts;
    const conditions = [eq(auditEvents.userId, userId)];
    if (before) conditions.push(lt(auditEvents.createdAt, before));
    if (documentId) conditions.push(eq(auditEvents.documentId, documentId));
    return this.db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }

  // Dashboard

  async getMetrics(userId: number): Promise<QueueMetrics> {
    const rows = await this.db
      .select({
        status: obligations.status,
        dueAt: obligations.dueAt,
        minutesSaved: obligations.minutesSaved,
      })
      .from(obligations)
      .where(eq(obligations.userId, userId));

    const now = Date.now();
    const weekAhead = now + 7 * 24 * 60 * 60 * 1000;

    const open = rows.filter(row => (OPEN_STATUSES as readonly string[]).includes(row.status));
    const dueThisWeek = open.filter(
      row => row.dueAt !== null && row.dueAt.getTime() <= weekAhead,
    );
    const waiting = rows.filter(
      row => row.status === "needs_decision" || row.status === "waiting_for_info",
    );
    const saved = rows
      .filter(row => row.status === "handled")
      .reduce((total, row) => total + (row.minutesSaved ?? 0), 0);

    return {
      openItems: open.length,
      dueThisWeek: dueThisWeek.length,
      waitingOnYou: waiting.length,
      minutesSaved: saved,
    };
  }
}
