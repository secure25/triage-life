# Master Build Prompt: Triage — Life Admin, Reduced to Decisions


---

## Prompt

You are a senior full-stack engineer, product designer, and AI-agent architect. Build a fully functional web application called **Triage-Life**.

Triage-Life is an autonomous approval-gated life-admin agent. It receives real user documents, extracts obligations and deadlines, turns them into prioritized tasks, drafts responses, and asks for explicit human approval before performing any consequential external action.

The product must feel calm, trustworthy, and focused. It must not feel like a generic chatbot. The primary experience is a decision queue and transparent work log, not a conversation window.

## 1. Product principle

Build around this principle:

> Triage never asks the user to read the paperwork again. It asks only for the decision the paperwork requires.

The system should work autonomously in the background where possible, but it must stop at clear approval gates for sensitive or consequential actions.

The first version must support a complete end-to-end flow:

1. The user uploads a document.
2. The application stores the original securely.
3. OCR extracts text from the document.
4. The agent identifies obligations, deadlines, entities, amounts, requested actions, missing information, and confidence.
5. The agent classifies urgency and determines whether the item is informational, actionable, waiting on the user, or approval-required.
6. Triage creates or updates a task in the decision queue.
7. Triage drafts a response or next action when appropriate.
8. The user reviews the extracted facts and proposed action.
9. Triage pauses until the user explicitly approves, edits, rejects, or dismisses the action.
10. The application records a complete audit event.

Use synthetic demo documents by default. Clearly label them as synthetic. Never send a real message, make a payment, modify a real account, or submit a real form without explicit user approval and a separately configured integration.

## 2. Visual direction

Recreate the visual language of the existing Triage MVP while improving it for a real product.

Use the following design system:

- Background: warm off-white, approximately `#f7f8f5`.
- Primary dark green: approximately `#263f35`.
- Action green: approximately `#2f6d4d`.
- Pale green surfaces: approximately `#e9f1eb` and `#eef5ef`.
- Warning amber: approximately `#fff6dd` with dark amber text.
- Warning coral: approximately `#fff0e8` with dark coral text.
- Borders: soft gray-green, approximately `#e3e8e2`.
- Body typography: DM Sans or a similar humanist sans-serif.
- Optional display typography: Fraunces or a restrained editorial serif for selected headings only.
- Corners: rounded but not playful, approximately 10–16px.
- Shadows: soft, low contrast, and used sparingly.
- Motion: subtle transitions under 250ms. Respect `prefers-reduced-motion`.

The interface should have:

- A persistent desktop sidebar.
- A responsive mobile layout.
- An overview dashboard.
- A decision queue.
- A document detail and agent brief panel.
- An activity timeline.
- A visible approval gate.
- A persistent statement that no external action occurs without approval.

Do not use a generic centered chatbot layout. Do not fill the UI with unnecessary gradients, glassmorphism, avatars, or decorative AI imagery.

## 3. Primary screens

### Overview dashboard

Create a dashboard with the following areas:

- Header with date, search, process-inbox action, and user menu.
- Greeting and short status message.
- Agent status indicator such as `Agent is on`.
- Summary metrics:
  - Open items.
  - Due this week.
  - Waiting on you.
  - Time reclaimed.
- Decision queue with document cards.
- Agent brief panel for the selected item.
- Today’s timeline.
- Weekly time-reclaimed card.
- Quiet-mode explanation: the agent works in the background and interrupts only when a human decision is needed.

### Upload inbox

Implement a real upload flow with:

- Drag-and-drop zone.
- File picker.
- Upload progress.
- File type validation.
- File size validation.
- Clear error states.
- Upload cancellation if technically practical.
- Support for PDF, PNG, JPG, JPEG, and optionally DOCX.
- A secure server-side upload path.
- Storage of metadata separately from file bytes.
- A list of recently uploaded documents.

Do not store raw file bytes in database columns. Store the file in object storage and save only its storage key, URL, MIME type, size, checksum, and metadata in the database.

### Document detail

For each document, show:

- Filename and source.
- Upload time.
- Processing status.
- Document type.
- Extracted text preview.
- OCR confidence or quality indicator.
- Structured obligations.
- Important dates.
- Amounts and changes.
- Missing information.
- Agent explanation in plain language.
- Proposed next action.
- Draft reply, if applicable.
- Source references showing where extracted facts came from.
- Approve, edit, reject, dismiss, and retry-processing controls.

The user must be able to distinguish clearly between:

- Facts extracted from the document.
- The agent’s interpretation.
- The agent’s recommendation.
- The action that will happen after approval.

### Decision queue

Organize work into these states:

- Needs decision.
- Due soon.
- Waiting for information.
- In progress.
- Handled.
- Dismissed.

Each queue item should include:

- Title.
- Source.
- Due date.
- Urgency.
- Confidence.
- Short summary.
- Required user input.
- Current status.

Support filters for urgency, due date, category, and status.

### Audit timeline

Record every meaningful event:

- Document uploaded.
- OCR started.
- OCR completed.
- Obligation extracted.
- Deadline detected.
- Task created.
- Draft created.
- User edited draft.
- User approved action.
- Action executed or simulated.
- User rejected action.
- Processing failed.

Each event should show time, event type, short description, and relevant document or task.

## 4. Suggested architecture

Use a typed full-stack architecture with a React frontend, a server-side API, a relational database, object storage, and a background-capable processing pipeline.

Recommended components:

- React and TypeScript frontend.
- Tailwind CSS with reusable UI components.
- Node.js server or another typed backend.
- tRPC or a similarly typed API layer.
- MySQL, PostgreSQL, or another relational database.
- S3-compatible object storage for original documents and derived artifacts.
- A queue or durable processing-status model for OCR and agent work.
- Strands Agents SDK for orchestration.
- Amazon Bedrock or another configured model provider through a server-side secret.
- Optional Amazon Bedrock AgentCore deployment after the local or hosted MVP works.

The application must remain usable if OCR or LLM processing fails. Show a clear failed state, retain the original document, allow retry, and never create a misleading completed task.

## 5. Database model

Create database tables similar to the following.

### users

- id
- providerOpenId
- name
- email
- createdAt
- updatedAt

### documents

- id
- userId
- originalFilename
- storageKey
- storageUrl
- mimeType
- sizeBytes
- sha256
- documentType
- uploadStatus
- processingStatus
- processingError
- ocrTextStorageKey or ocrText
- ocrConfidence
- createdAt
- updatedAt

### obligations

- id
- documentId
- title
- description
- category
- urgency
- status
- dueAt
- amount
- currency
- requiredUserDecision
- missingInformation
- confidence
- sourceQuote
- sourcePage
- createdAt
- updatedAt

### drafts

- id
- obligationId
- channel
- subject
- body
- status
- createdBy
- approvedAt
- sentAt
- createdAt
- updatedAt

### agentRuns

- id
- documentId
- runType
- status
- modelId
- startedAt
- completedAt
- error
- structuredOutput

### auditEvents

- id
- userId
- documentId
- obligationId
- eventType
- actorType
- summary
- metadata
- createdAt

Use UTC timestamps in persistence. Convert to the user’s local timezone only in the UI.

## 6. OCR pipeline

Implement OCR as a replaceable service boundary.

Create an interface such as:

```ts
interface OcrProvider {
  extractText(input: {
    storageKey: string;
    mimeType: string;
  }): Promise<{
    text: string;
    pages?: Array<{
      pageNumber: number;
      text: string;
      confidence?: number;
    }>;
    confidence?: number;
  }>;
}
```

Provide at least:

1. A production provider using an AWS-compatible OCR service such as Amazon Textract, if credentials are configured.
2. A deterministic local or demo provider for development and judging.

The demo provider should recognize a small set of clearly labeled synthetic documents and return realistic text. The user must be able to run the project without production OCR credentials.

OCR requirements:

- Validate MIME type server-side.
- Validate file size server-side.
- Do not trust client-provided filenames.
- Generate unique storage keys.
- Avoid logging document contents or personal data.
- Store page-level text when available.
- Preserve page references for extracted facts.
- Make confidence visible to the user.
- Use retries with bounded attempts.
- Mark processing as failed rather than silently retrying forever.

## 7. Strands agent design

Use the Strands Agents SDK as a real orchestration layer, not as a decorative dependency.

Create a server-side agent with narrowly defined tools. The agent must be able to call tools, return structured results, and stop before consequential actions.

Suggested tools:

```python
@tool
def get_document_text(document_id: str) -> str:
    """Return OCR text and page references for a document."""

@tool
def extract_obligations(document_id: str, text: str) -> dict:
    """Extract deadlines, amounts, requested actions, missing information, and source references."""

@tool
def calculate_priority(obligation: dict) -> dict:
    """Classify urgency using due date, impact, confidence, and required user action."""

@tool
def create_or_update_task(obligation: dict) -> dict:
    """Persist an obligation as a task in the decision queue."""

@tool
def draft_response(obligation: dict, objective: str) -> dict:
    """Create a draft response. Never send it."""

@tool
def request_user_approval(action_summary: str) -> dict:
    """Create an approval-required state and stop the workflow."""

@tool
def record_audit_event(event_type: str, summary: str, metadata: dict) -> dict:
    """Write an immutable audit event."""
```

Use structured JSON output for extraction. Define a strict schema that includes:

- documentType
- obligations
- title
- summary
- category
- urgency
- dueDate
- amount
- currency
- requiredAction
- missingInformation
- confidence
- sourceQuote
- sourcePage
- recommendedNextStep
- approvalRequired

The agent must follow these rules:

- Never invent a deadline, amount, policy term, or contact.
- If a value is not present, return `null` and explain that it is missing.
- Treat low OCR confidence as a reason to request review.
- Quote or reference the source text for important facts.
- Separate extraction from recommendation.
- Do not provide medical, legal, tax, or financial advice.
- Do not autonomously send messages, make payments, submit forms, or change accounts.
- Ask for approval before any external or consequential action.
- Be explicit when the output is based on synthetic demo data.

Implement an idempotent processing flow. Re-running the agent for the same document should update the existing run or task rather than create duplicates.

## 8. Approval and safety model

Approval is a first-class state, not a button added at the end.

The system must use an approval record containing:

- Exact action to be taken.
- Target or channel.
- Final content or payload.
- User who approved it.
- Approval timestamp.
- Expiry or invalidation conditions.
- Execution result.

If the draft changes after approval, invalidate the approval and require approval again.

For the first version, external actions may be simulated. The UI must make this explicit by saying `Simulation only` or `No real message sent`.

Provide a clean integration boundary for future Gmail, calendar, Slack, or form-submission connectors. Do not hard-code provider-specific logic into the core agent.

## 9. API requirements

Expose typed procedures or endpoints for:

- Get the current user.
- Create an upload intent.
- Complete an upload.
- List documents.
- Get a document with OCR and extracted obligations.
- Start processing.
- Retry processing.
- List decision-queue items.
- Get a draft.
- Edit a draft.
- Approve a draft.
- Reject or dismiss an action.
- Get audit events.
- Get dashboard metrics.

All server procedures must enforce user ownership. Never accept a document ID and return the document without checking authorization.

Use explicit loading, empty, success, and failure states in the UI.

## 10. Demo mode

Include a polished demo mode so judges can experience the full product without credentials.

Demo mode should provide three synthetic documents:

1. Insurance renewal notice.
2. School emergency-contact form.
3. Appointment confirmation.

The demo should show:

- Upload or simulated upload.
- OCR processing status.
- Extracted facts.
- Source references.
- Decision queue creation.
- Draft reply.
- Human approval.
- Simulated execution.
- Audit timeline update.

Label demo data clearly and make it impossible for the demo to contact a real third party.

## 11. Testing requirements

Add automated tests for:

- File validation.
- Ownership authorization.
- OCR provider selection.
- Structured extraction parsing.
- Missing-field handling.
- Deadline normalization.
- Priority classification.
- Idempotent reprocessing.
- Approval invalidation after draft edits.
- Rejection and dismissal.
- Audit event creation.
- Prohibition of execution without approval.

Add at least one end-to-end test covering:

```text
upload synthetic document
→ OCR
→ structured extraction
→ task creation
→ draft creation
→ approval required
→ user approves
→ simulated execution
→ audit event
```

Run type checks, unit tests, production build, and a browser smoke test before considering the implementation complete.

## 12. Security and privacy requirements

Implement these safeguards:

- Keep model and storage credentials on the server.
- Never expose provider API keys in browser code.
- Use signed or platform-managed storage URLs.
- Validate file type and size on the server.
- Sanitize filenames.
- Prevent path traversal.
- Enforce per-user access on every document, task, draft, and audit query.
- Redact sensitive content from logs.
- Add rate limiting or bounded request behavior to expensive processing routes.
- Avoid unbounded retries.
- Use a maximum document size and page count.
- Show users what data is being processed.
- Provide a delete-data path if the storage provider supports it.
- Never claim that the system is a substitute for a professional.

## 13. Repository and deployment requirements

Create a public repository with:

- MIT or Apache 2.0 license.
- Complete README.
- Local setup instructions.
- Environment-variable reference.
- Database migration instructions.
- OCR setup instructions.
- Strands and model-provider setup instructions.
- Demo-mode instructions.
- Architecture diagram.
- Security and privacy notes.
- Known limitations.
- Screenshots or a short product walkthrough.

The README must explain that:

- The application uses synthetic demo documents by default.
- External actions are approval-gated.
- Production OCR and integrations require user-provided credentials.
- The demo does not send real messages.

Deploy a publicly accessible demo if possible. If deploying to Amazon Bedrock AgentCore, document the runtime, permissions, session behavior, and environment variables. Keep a local or hosted non-AgentCore mode available so the project remains easy to test.

## 14. Five-minute hackathon demo

Create a demo video no longer than five minutes with this structure:

### 0:00–0:35 — Problem

Show a messy folder of life-admin paperwork. Explain that the problem is not lack of information. The problem is the work required to turn information into decisions.

### 0:35–1:15 — Upload

Upload the synthetic insurance renewal notice. Show validation and upload progress.

### 1:15–2:00 — OCR and extraction

Show processing status and the extracted deadline, premium change, decision needed, confidence, and source quote.

### 2:00–2:45 — Agent workflow

Show the Strands tool trace or a user-friendly activity panel demonstrating extraction, priority calculation, task creation, and draft generation.

### 2:45–3:45 — Human approval

Show the draft reply. Explain that Triage has prepared the work but has not sent anything. Approve the draft and show the simulated execution result.

### 3:45–4:25 — Timeline

Show the audit event and updated decision queue.

### 4:25–5:00 — Why it matters

Close with:

> The future of personal AI is not another place to ask questions. It is a background system that removes the work between receiving information and making a decision.

## 15. Definition of done

The implementation is complete only when all of the following are true:

- A real document can be uploaded through the browser.
- The original file is stored outside the database.
- OCR text is generated or a clearly labeled demo provider is used.
- Strands Agents SDK is used in the server-side processing path.
- Structured obligations are persisted.
- The decision queue updates from agent output.
- A draft is created without being sent.
- Approval is required before execution.
- The system blocks execution without approval.
- Draft edits invalidate prior approval.
- Audit events are written.
- Failures are visible and retryable.
- User ownership is enforced.
- Tests pass.
- Production build passes.
- The UI remains usable on desktop and mobile.
- The repository contains all setup and deployment instructions.
- The public demo is safe to test and cannot contact real people.

Do not stop at a mockup. Do not implement a generic chat interface. Build the smallest credible product that demonstrates real document processing, real agent orchestration, real persistence, and a trustworthy human approval boundary.

---

## Recommended implementation order

1. Recreate the visual shell and seeded demo mode.
2. Add the database schema and typed API.
3. Add secure object-storage upload.
4. Add the demo OCR provider and processing state machine.
5. Add the real OCR provider behind the same interface.
6. Add Strands tools and structured extraction.
7. Add draft and approval persistence.
8. Add audit events and failure handling.
9. Add tests and browser smoke checks.
10. Deploy a public demo and record the five-minute walkthrough.

## References

[1]: https://strandsagents.com/docs/user-guide/concepts/tools/ "Strands Agents Tools Overview"
[2]: https://strandsagents.com/docs/user-guide/deploy/deploy_to_bedrock_agentcore/ "Deploying Strands Agents to Amazon Bedrock AgentCore Runtime"
[3]: https://agentsforhumans.devpost.com/rules "Agents for Humans Hackathon Rules"
[4]: https://docs.aws.amazon.com/textract/ "Amazon Textract Documentation"
