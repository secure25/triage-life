# Triage — Life Admin, Reduced to Decisions

Triage is an autonomous, approval-gated life-admin agent. It receives real user
documents, extracts obligations and deadlines, turns them into prioritized
tasks, drafts responses — and asks for **explicit human approval** before any
consequential action.

> Triage never asks you to read the paperwork again. It asks only for the
> decision the paperwork requires.

Built for the [Agents for Humans](https://agentsforhumans.devpost.com/) hackathon.

---

## What it does

1. You upload a document (PDF, PNG, JPG, DOCX — up to 15 MB).
2. The original file is stored in object storage; only metadata lives in the
   database.
3. OCR extracts the text (page-level, with confidence).
4. The agent identifies obligations, deadlines, entities, amounts, requested
   actions, missing information — each fact with a source quote and page.
5. Priority classification sorts work into the decision queue
   (needs decision / waiting for you / due soon / in progress).
6. Triage drafts a response when appropriate. **It never sends anything.**
7. You approve, edit, reject, or dismiss. Editing a draft after approval
   invalidates the approval.
8. Every step is recorded in an append-only audit timeline.

**External actions are approval-gated, and v1 executions are simulations** —
the UI says so explicitly (`Simulation only — no real message was sent`).

## Demo mode

Three clearly-labeled synthetic documents (insurance renewal, school emergency
contact form, appointment confirmation) run through the *real* pipeline —
upload, OCR, extraction, queue, draft, approval gate, simulated execution,
audit. Sign in, then click **Load demo documents** on the Overview or Inbox
page. The synthetic documents use the reserved `.example` TLD, so the demo can
never contact a real third party. Demo document dates are generated relative
to today, so the demo never goes stale.

---

## Architecture

```
┌────────────┐     ┌───────────────────────────── Server (Express + tRPC) ─────────────────────────────┐
│  Browser    │     │                                                                                      │
│  React 19   │────▶│  tRPC API ──▶ Processing pipeline ──▶ OCR provider (demo | Textract)               │
│  Vite       │PUT  │      │             │  (upload → OCR → extract → prioritize →                        │
│  Tailwind 4 │────▶│  Upload     Agent tool layer      │   upsert task → draft → approval gate)          │
└────────────┘     │  route           │                 │                                                │
                   │      │           ▼                 ▼                                                │
                   │      ▼      Deterministic /        Repository (Drizzle ORM ⇄ PostgreSQL             │
                   │  Document    Strands engine          |          or in-memory fallback)              │
                   │  store      (narrow tools,           ▼                                             │
                   │  (local FS  audited trace)      Audit events                                       │
                   │   or S3)                                                                        │
                   └──────────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend** — React 19, TypeScript, Vite, Tailwind CSS 4, tRPC (typed
  end-to-end), wouter. No chat window: the primary experience is a decision
  queue, document detail panels, and a transparent activity timeline.
- **API** — tRPC over Express. Every procedure enforces per-user ownership.
- **Database** — PostgreSQL via Drizzle ORM (`users`, `documents`,
  `obligations`, `drafts`, `approvals`, `agent_runs`, `audit_events`). UTC
  timestamps throughout; the UI converts to local time.
- **Object storage** — pluggable `DocumentStore`: local filesystem (default)
  or any S3-compatible bucket. File bytes never live in the database.
- **OCR** — pluggable `OcrProvider`: deterministic demo provider (synthetic
  documents) or Amazon Textract (images synchronously; PDFs as async S3 jobs).
- **Agent** — a narrow tool boundary (`get_document_text`,
  `extract_obligations`, `calculate_priority`, `create_or_update_task`,
  `draft_response`, `request_user_approval`, `record_audit_event`). The
  deterministic engine runs these tools in a fixed, audited pipeline;
  `AGENT_PROVIDER=strands` swaps in the Strands Agents SDK engine (see
  [Agent setup](#agent-setup-strands)). Every tool call is recorded in a
  tool trace shown in the UI.
- **Approval model** — approvals are first-class records that snapshot the
  exact approved payload, expire after 7 days, and are invalidated when the
  draft changes. Execution (simulated in v1) is only possible while an active,
  matching approval exists. See `server/domain/approval.ts` — the invariants
  live in one place and are covered by tests.

## Getting started

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env        # DATABASE_URL optional for a quick start
pnpm db:push                # create tables (needs DATABASE_URL)
pnpm dev                    # http://localhost:3000
```

Without `DATABASE_URL` the app runs on an in-memory store — everything works,
but data resets on restart. Sign in with any email (there is no password; this
is an MVP identity boundary, not production auth — put real authentication in
front if you deploy this), then **Load demo documents**.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string. Absent → in-memory store. |
| `JWT_SECRET` | dev fallback | Signs sessions and upload tokens. **Required in production.** |
| `PORT` | `3000` | HTTP port. |
| `STORAGE_DRIVER` | `local` | `local` (filesystem) or `s3`. |
| `STORAGE_DIR` | `storage` | Local storage directory. |
| `S3_BUCKET` / `S3_REGION` / `S3_PREFIX` | — | S3 storage configuration. |
| `OCR_PROVIDER` | `auto` | `auto`, `demo`, or `textract`. |
| `AGENT_PROVIDER` | `deterministic` | `deterministic` or `strands`. |
| `MODEL_ID` | — | Model id for the Strands engine. |

### Database migrations

```bash
pnpm db:push        # generate + apply migrations via drizzle-kit
```

### OCR setup

- **Local text extraction (default via `OCR_PROVIDER=auto`)** — reads the
  embedded text directly out of PDFs (via pdfjs-dist) and DOCX files (via
  mammoth): instant, free, and exact for the majority of real-world
  documents, which are portal downloads with text layers. Scanned PDFs
  (no text layer) and images are delegated to the scan fallback when
  configured; otherwise they fail with a clear, actionable error — the app
  never fakes text it cannot read.
- **Demo provider (`OCR_PROVIDER=demo`)** — recognizes the three synthetic
  demo documents by their embedded marker and returns realistic page-level
  text with imperfections.
- **Amazon Textract** — set `OCR_PROVIDER=textract` (or rely on `auto`'s
  scan fallback) with AWS credentials from the standard chain. Images are
  processed synchronously; PDFs run as async Textract jobs, which require
  `STORAGE_DRIVER=s3` (Textract reads PDFs from S3). Polling is bounded
  (~90 s) and sync calls retry with backoff on throttling. Note: Textract
  requires a one-time activation on some AWS account plans.

### Agent setup (Strands)

Triage uses the [Strands Agents SDK](https://strandsagents.com)
(`@strands-agents/sdk`, TypeScript — requires Node 22+) as its agent
orchestration layer. Two engines implement the same boundary:

- **Deterministic engine (default, zero-config)** — runs the seven narrow
  tools (`get_document_text`, `extract_obligations`, `calculate_priority`,
  `create_or_update_task`, `draft_response`, `request_user_approval`,
  `record_audit_event`) in a fixed, audited sequence over the synthetic demo
  documents. This is what the test suite and the no-credentials demo use.
- **Strands engine** (`AGENT_PROVIDER=strands`) — a real agent loop: the
  model reads the document via `get_document_text`, registers what it found
  with `extract_obligations`, then calls the priority/task/draft/approval
  tools itself and returns Zod-validated structured output. Model providers:
  - `STRANDS_MODEL_PROVIDER=bedrock` (default) — AWS credential chain;
    `MODEL_ID` optional (defaults to Claude Sonnet 4.6 on Bedrock).
  - `STRANDS_MODEL_PROVIDER=bedrock-mantle` — Bedrock's OpenAI-compatible
    [Mantle endpoint](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html)
    (`https://bedrock-mantle.<region>.api.aws`). Uses the same AWS credential
    chain — the SDK mints short-term bearer tokens automatically via
    `@aws/bedrock-token-generator`, so no manually created API key is needed.
    Requires `MODEL_ID` with a **Mantle** model id (they differ from
    bedrock-runtime ids, e.g. `anthropic.claude-opus-4-8`); set
    `BEDROCK_MANTLE_REGION` or `AWS_REGION` for the region.
  - `STRANDS_MODEL_PROVIDER=openai` — any OpenAI-compatible endpoint,
    including local ones (Ollama/vLLM serve `/v1`): set `OPENAI_BASE_URL`,
    `OPENAI_API_KEY`, and `MODEL_ID`.

  The model decides what to extract and how to phrase drafts — never what is
  allowed. Dates and amounts are normalized server-side, priority
  classification is deterministic code, `draft_response` only ever creates a
  draft, and after the agent finishes a reconciliation pass re-checks its
  work: anything the model extracted but failed to persist is created
  deterministically, and the approval gate is enforced even if the model
  skipped it. The agent cannot talk the system past the gate.

If `AGENT_PROVIDER=strands` is set but no model provider is configured, the
app logs a warning and falls back to the deterministic engine, so the project
always runs. Every tool call — from either engine — lands in the audited
tool trace shown on each document's detail page.

---

## Tests

```bash
pnpm test
```

Covers: file validation (type spoofing, size, traversal-safe filenames),
ownership enforcement across every procedure, OCR provider selection and the
demo provider's refusal to fake OCR, structured extraction parsing
(deadlines, amounts, missing fields stay null), LLM-output date/amount
normalization, priority classification, Strands engine configuration and its
deterministic fallback, idempotent reprocessing, approval invalidation after
draft edits, approval expiry, rejection/dismissal, audit-event creation,
execution being blocked without approval, and a full end-to-end run
(upload → OCR → extraction → task → draft → approval gate → simulated
execution → audit).

## Security and privacy

- Model and storage credentials stay on the server; nothing sensitive is
  exposed to browser code.
- File type and size are validated server-side on both the intent and the
  actual bytes; filenames are sanitized and never used to build paths.
- Storage keys are server-generated UUIDs under `users/<id>/…`; reads are
  ownership-checked, and S3 reads use short-lived presigned URLs.
- Every document, task, draft, approval, and audit query is scoped by user.
- Uploads and processing routes are rate-limited; retries are bounded.
- Logs never contain document contents — only failure reasons.
- Triage is not a substitute for a professional and never provides medical,
  legal, tax, or financial advice.
- Deleting a document removes the original file and all derived rows.

## Known limitations

- v1 executions are **simulations**. There are no real email/calendar/form
  integrations yet; the approval record is the integration boundary for them.
- The deterministic extraction engine only understands the three synthetic
  demo documents; real documents need the Strands engine with a model.
- Email sign-in has no password. Use a real IdP before any real deployment.
- The in-memory store (no `DATABASE_URL`) is for demos only.
- Scanned PDFs and photos need the Textract scan fallback (S3-backed
  storage); text-layer PDFs and DOCX extract locally.

## License

MIT
