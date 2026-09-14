import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Triage-Life schema (PostgreSQL).
 *
 * Conventions:
 * - UTC timestamps everywhere (`timestamptz`); the UI converts to local time.
 * - Domain rows carry a denormalized `userId` so per-user ownership can be
 *   enforced with a single-table predicate on every query.
 * - Monetary amounts are stored as integer cents to avoid float drift.
 */

export const userRole = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  /** Surrogate primary key. Use for relations between tables. */
  id: serial("id").primaryKey(),
  /** Stable provider identity. For built-in email login: `email:<normalized>`. */
  openId: varchar("open_id", { length: 255 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull(),
});

export const uploadStatus = pgEnum("upload_status", ["uploaded", "failed"]);

export const processingStatus = pgEnum("processing_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

/** Where a document came from. Demo documents are synthetic and clearly labeled. */
export const documentSource = pgEnum("document_source", ["upload", "demo"]);

export type OcrPage = {
  pageNumber: number;
  text: string;
  confidence?: number;
};

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    /** Object-storage key. Raw bytes never live in the database. */
    storageKey: varchar("storage_key", { length: 512 }).notNull().unique(),
    storageUrl: text("storage_url"),
    mimeType: varchar("mime_type", { length: 127 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    /** Agent-classified type, e.g. insurance_renewal. Null until extraction runs. */
    documentType: varchar("document_type", { length: 64 }),
    uploadStatus: uploadStatus("upload_status").default("uploaded").notNull(),
    processingStatus: processingStatus("processing_status").default("pending").notNull(),
    processingError: text("processing_error"),
    ocrText: text("ocr_text"),
    ocrConfidence: real("ocr_confidence"),
    ocrPages: jsonb("ocr_pages").$type<OcrPage[]>(),
    source: documentSource("source").default("upload").notNull(),
    /** True when the document is a synthetic demo artifact. */
    isSynthetic: boolean("is_synthetic").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("documents_user_created_idx").on(table.userId, table.createdAt),
    index("documents_user_processing_idx").on(table.userId, table.processingStatus),
  ],
);

export const urgencyLevel = pgEnum("urgency_level", ["high", "medium", "low"]);

/** Queue states from the product spec. */
export const obligationStatus = pgEnum("obligation_status", [
  "needs_decision",
  "due_soon",
  "waiting_for_info",
  "in_progress",
  "handled",
  "dismissed",
]);

export const obligations = pgTable(
  "obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 64 }),
    urgency: urgencyLevel("urgency").default("medium").notNull(),
    status: obligationStatus("status").default("needs_decision").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    amountCents: integer("amount_cents"),
    currency: varchar("currency", { length: 3 }),
    requiredUserDecision: text("required_user_decision"),
    missingInformation: jsonb("missing_information").$type<string[]>(),
    /** Extraction confidence 0..1 for this obligation. */
    confidence: real("confidence"),
    sourceQuote: text("source_quote"),
    sourcePage: integer("source_page"),
    recommendedNextStep: text("recommended_next_step"),
    approvalRequired: boolean("approval_required").default(false).notNull(),
    /** Estimated minutes of life-admin work this item saves once handled. */
    minutesSaved: integer("minutes_saved"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("obligations_user_status_idx").on(table.userId, table.status),
    index("obligations_document_idx").on(table.documentId),
    index("obligations_user_due_idx").on(table.userId, table.dueAt),
  ],
);

export const draftChannel = pgEnum("draft_channel", [
  "email",
  "form",
  "portal",
  "reminder",
  "none",
]);

export const draftStatus = pgEnum("draft_status", [
  "draft",
  "awaiting_approval",
  "approved",
  "rejected",
  "executed_simulated",
  "dismissed",
]);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: draftChannel("channel").default("email").notNull(),
    subject: varchar("subject", { length: 255 }),
    body: text("body").notNull(),
    status: draftStatus("status").default("draft").notNull(),
    createdBy: varchar("created_by", { length: 16 }).default("agent").notNull(),
    /** sha256 of canonical (subject, body). Any edit changes the hash and invalidates approvals. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("drafts_obligation_idx").on(table.obligationId),
    index("drafts_user_status_idx").on(table.userId, table.status),
  ],
);

export const approvalStatus = pgEnum("approval_status", [
  "active",
  "invalidated",
  "expired",
]);

export const executionStatus = pgEnum("execution_status", [
  "not_executed",
  "executed_simulated",
]);

/**
 * Approval records are first-class: they snapshot the exact approved payload.
 * Execution (simulated in v1) is only allowed while an active approval exists
 * and the draft's content hash still matches the approved hash.
 */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actionSummary: text("action_summary").notNull(),
    channel: draftChannel("channel").default("email").notNull(),
    payloadSnapshot: jsonb("payload_snapshot").$type<{
      subject: string | null;
      body: string;
    }>().notNull(),
    approvedContentHash: varchar("approved_content_hash", { length: 64 }).notNull(),
    approvedBy: integer("approved_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: approvalStatus("status").default("active").notNull(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidationReason: text("invalidation_reason"),
    executionStatus: executionStatus("execution_status").default("not_executed").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    executionResult: jsonb("execution_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("approvals_draft_idx").on(table.draftId)],
);

export const agentRunType = pgEnum("agent_run_type", [
  "ocr",
  "extraction",
  "pipeline",
  "retry",
]);

export const agentRunStatus = pgEnum("agent_run_status", [
  "running",
  "completed",
  "failed",
]);

/** One step of the agent's tool trace, shown in the activity panel. */
export type ToolTraceEntry = {
  tool: string;
  input: unknown;
  output: unknown;
  startedAt: string;
  completedAt: string;
  ok: boolean;
};

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runType: agentRunType("run_type").notNull(),
    status: agentRunStatus("status").default("running").notNull(),
    provider: varchar("provider", { length: 32 }),
    modelId: varchar("model_id", { length: 128 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    structuredOutput: jsonb("structured_output"),
    toolTrace: jsonb("tool_trace").$type<ToolTraceEntry[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("agent_runs_document_idx").on(table.documentId)],
);

export const actorType = pgEnum("actor_type", ["user", "agent", "system"]);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    obligationId: uuid("obligation_id").references(() => obligations.id, {
      onDelete: "cascade",
    }),
    draftId: uuid("draft_id").references(() => drafts.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    actorType: actorType("actor_type").default("system").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("audit_events_user_created_idx").on(table.userId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type Obligation = typeof obligations.$inferSelect;
export type InsertObligation = typeof obligations.$inferInsert;
export type Draft = typeof drafts.$inferSelect;
export type InsertDraft = typeof drafts.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = typeof approvals.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;
