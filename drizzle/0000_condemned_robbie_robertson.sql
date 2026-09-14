CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_run_type" AS ENUM('ocr', 'extraction', 'pipeline', 'retry');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('active', 'invalidated', 'expired');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('upload', 'demo');--> statement-breakpoint
CREATE TYPE "public"."draft_channel" AS ENUM('email', 'form', 'portal', 'reminder', 'none');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('draft', 'awaiting_approval', 'approved', 'rejected', 'executed_simulated', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('not_executed', 'executed_simulated');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('needs_decision', 'due_soon', 'waiting_for_info', 'in_progress', 'handled', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('uploaded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."urgency_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"run_type" "agent_run_type" NOT NULL,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"provider" varchar(32),
	"model_id" varchar(128),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	"structured_output" jsonb,
	"tool_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"action_summary" text NOT NULL,
	"channel" "draft_channel" DEFAULT 'email' NOT NULL,
	"payload_snapshot" jsonb NOT NULL,
	"approved_content_hash" varchar(64) NOT NULL,
	"approved_by" integer NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "approval_status" DEFAULT 'active' NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"execution_status" "execution_status" DEFAULT 'not_executed' NOT NULL,
	"executed_at" timestamp with time zone,
	"execution_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"document_id" uuid,
	"obligation_id" uuid,
	"draft_id" uuid,
	"event_type" varchar(64) NOT NULL,
	"actor_type" "actor_type" DEFAULT 'system' NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"storage_url" text,
	"mime_type" varchar(127) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"document_type" varchar(64),
	"upload_status" "upload_status" DEFAULT 'uploaded' NOT NULL,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"ocr_text" text,
	"ocr_confidence" real,
	"ocr_pages" jsonb,
	"source" "document_source" DEFAULT 'upload' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obligation_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"channel" "draft_channel" DEFAULT 'email' NOT NULL,
	"subject" varchar(255),
	"body" text NOT NULL,
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"created_by" varchar(16) DEFAULT 'agent' NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(64),
	"urgency" "urgency_level" DEFAULT 'medium' NOT NULL,
	"status" "obligation_status" DEFAULT 'needs_decision' NOT NULL,
	"due_at" timestamp with time zone,
	"amount_cents" integer,
	"currency" varchar(3),
	"required_user_decision" text,
	"missing_information" jsonb,
	"confidence" real,
	"source_quote" text,
	"source_page" integer,
	"recommended_next_step" text,
	"approval_required" boolean DEFAULT false NOT NULL,
	"minutes_saved" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(255) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_signed_in" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_document_idx" ON "agent_runs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "approvals_draft_idx" ON "approvals" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "audit_events_user_created_idx" ON "audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_user_created_idx" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_user_processing_idx" ON "documents" USING btree ("user_id","processing_status");--> statement-breakpoint
CREATE INDEX "drafts_obligation_idx" ON "drafts" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "drafts_user_status_idx" ON "drafts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "obligations_user_status_idx" ON "obligations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "obligations_document_idx" ON "obligations" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "obligations_user_due_idx" ON "obligations" USING btree ("user_id","due_at");