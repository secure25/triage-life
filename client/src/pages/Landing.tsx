import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  ListChecks,
  LockKeyhole,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Zap,
} from "lucide-react";

/**
 * Public landing page (judges' first impression). The app itself lives at
 * /app; sign-in stays at /signin.
 */

const fadeUp = `
@keyframes landing-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: none; }
}
.landing-fade { animation: landing-fade-up 0.7s cubic-bezier(0.2, 0.6, 0.2, 1) both; }
.landing-d1 { animation-delay: 0.06s; }
.landing-d2 { animation-delay: 0.14s; }
.landing-d3 { animation-delay: 0.22s; }
.landing-d4 { animation-delay: 0.30s; }
`;

function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <a href="/" className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#263f35] text-[#f7f8f5] shadow-[0_6px_14px_rgba(38,63,53,0.18)]">
        <Sparkles className="h-[18px] w-[18px]" />
      </div>
      <div>
        <div
          className={`text-[15px] font-semibold tracking-[-0.02em] ${
            dark ? "text-white" : "text-[#1c2a24]"
          }`}
        >
          triage
        </div>
        <div
          className={`text-[10px] font-medium uppercase tracking-[0.14em] ${
            dark ? "text-[#91b09a]" : "text-[#8a9690]"
          }`}
        >
          life admin, reduced
        </div>
      </div>
    </a>
  );
}

/** Static, honest preview of the real decision queue (mirrors the demo set). */
function QueuePreview() {
  const items = [
    {
      title: "Submit emergency contact form — Maya Rivera (Grade 3B)",
      meta: "school · Riverside Primary",
      due: "Sep 16 · tomorrow",
      status: "Waiting for you",
      statusTone: "bg-[#f9eae5] text-[#b55f3f]",
      urgency: "high",
      urgencyTone: "bg-[#fff0e8] text-[#c45322]",
    },
    {
      title: "Respond to NorthStar plan renewal (NH-FAM-40218)",
      meta: "insurance · EUR 214.60 / month",
      due: "Sep 18 · 4 days",
      status: "Needs decision",
      statusTone: "bg-[#fff0e8] text-[#c45322]",
      urgency: "medium",
      urgencyTone: "bg-[#fff8de] text-[#9b7311]",
    },
    {
      title: "Annual check-up with Dr. Mira Patel",
      meta: "health · Westside Clinic",
      due: "Sep 22 · 8 days",
      status: "In progress",
      statusTone: "bg-[#eaf3ec] text-[#3d7353]",
      urgency: "medium",
      urgencyTone: "bg-[#fff8de] text-[#9b7311]",
    },
  ];

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#e5eae4] bg-white shadow-[0_18px_50px_rgba(35,55,43,0.10)]">
      <div className="flex items-center justify-between border-b border-[#edf0ec] bg-[#fbfcfa] px-5 py-3.5">
        <div className="text-[12px] font-semibold text-[#33443b]">
          Your decision queue
        </div>
        <div className="flex items-center gap-2 rounded-full bg-[#eaf3ec] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#4f7e5e]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#65a274]" />
          Agent is on
        </div>
      </div>

      {items.map(item => (
        <div
          key={item.title}
          className="flex items-start gap-3.5 border-b border-[#edf0ec] p-4 last:border-0"
        >
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf3ec] text-[#43805c]">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-[#33443b]">
                {item.title}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${item.statusTone}`}
              >
                {item.status}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${item.urgencyTone}`}
              >
                {item.urgency}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#919c95]">
              {item.meta} · {item.due}
            </div>
          </div>
          <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-[#c1cbc3]" />
        </div>
      ))}

      <div className="bg-[#f8faf7] px-5 py-3.5">
        <div className="flex items-start gap-2 text-[11px] leading-5 text-[#75807a]">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7ca289]" />
          <span>
            Each task has a drafted response, source quotes, and a page
            reference — waiting at the approval gate. Nothing is sent until you
            approve it.
          </span>
        </div>
      </div>
    </div>
  );
}

const steps = [
  {
    icon: UploadCloud,
    title: "Drop the document",
    body: "PDF, PNG, JPG, or DOCX up to 15 MB. The original goes to encrypted object storage — file bytes never touch the database.",
  },
  {
    icon: FileText,
    title: "Triage reads it",
    body: "Text is extracted page by page with confidence scores. Obligations, deadlines, amounts, and missing info each carry a source quote and page number.",
  },
  {
    icon: ListChecks,
    title: "You decide",
    body: "One clean queue, ordered by what only you can do: needs decision, waiting for you, due soon. No re-reading, no searching inboxes.",
  },
  {
    icon: Send,
    title: "Approve or edit",
    body: "A draft response is ready for every actionable item. Approve to execute (simulated in v1). Edit after approval and the approval is invalidated.",
  },
];

const gateFeatures = [
  {
    title: "Payload snapshots",
    body: "An approval records the exact subject and body you approved — not a reference to it.",
  },
  {
    title: "Content-hash locking",
    body: "Any edit changes the draft's hash and voids the approval automatically. Re-approval is required.",
  },
  {
    title: "Enforced in code",
    body: "The gate is not a prompt rule. A reconciliation pass enforces it even if the model misbehaves — covered by the test suite.",
  },
];

const techChips = [
  "Strands Agents SDK",
  "Claude Sonnet 4.6 · Amazon Bedrock",
  "PostgreSQL · Neon",
  "Amazon S3",
  "React 19 + tRPC",
  "Drizzle ORM",
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-[#192521]">
      <style>{fadeUp}</style>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-[#e9eee8] bg-[#f7f8f5]/85 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1160px] items-center justify-between px-5 md:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-7 text-[12.5px] font-medium text-[#69756f] md:flex">
            <a href="#how" className="transition hover:text-[#263f35]">
              How it works
            </a>
            <a href="#gate" className="transition hover:text-[#263f35]">
              The approval gate
            </a>
            <a href="#demo" className="transition hover:text-[#263f35]">
              Demo
            </a>
            <a href="#stack" className="transition hover:text-[#263f35]">
              Under the hood
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            {user ? (
              <a
                href="/app"
                className="flex items-center gap-2 rounded-[10px] bg-[#263f35] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(38,63,53,0.16)] transition hover:bg-[#1e332b]"
              >
                Open your desk <ArrowRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <>
                <a
                  href="/signin"
                  className="hidden rounded-[10px] px-3.5 py-2.5 text-[12px] font-semibold text-[#5b8065] transition hover:bg-[#eaf3ec] sm:block"
                >
                  Sign in
                </a>
                <a
                  href="/signin"
                  className="flex items-center gap-2 rounded-[10px] bg-[#263f35] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(38,63,53,0.16)] transition hover:bg-[#1e332b]"
                >
                  Try the demo <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1160px] px-5 pb-10 pt-14 md:px-8 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div>
            <div className="landing-fade inline-flex items-center gap-2 rounded-full bg-[#eaf3ec] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4f7e5e]">
              <Sparkles className="h-3 w-3" />
              Built for the Agents for Humans hackathon
            </div>
            <h1 className="landing-fade landing-d1 mt-5 text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#1c2a24] md:text-[58px]">
              Life admin,
              <br />
              reduced to decisions
              <span className="text-[#b2c9b8]">.</span>
            </h1>
            <p className="landing-fade landing-d2 mt-5 max-w-[520px] text-[15px] leading-7 text-[#6e7b73]">
              Triage reads the paperwork you'd rather not — insurance renewals,
              school forms, appointment letters — and puts exactly one thing in
              front of you:{" "}
              <span className="font-semibold text-[#33443b]">
                the decision the paperwork requires.
              </span>{" "}
              Everything else — OCR, extraction, drafting — happens quietly in
              the background.
            </p>
            <div className="landing-fade landing-d3 mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/signin"
                className="flex items-center gap-2 rounded-[11px] bg-[#263f35] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(38,63,53,0.22)] transition hover:bg-[#1e332b] active:scale-[0.98]"
              >
                Try the live demo <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#how"
                className="flex items-center gap-2 rounded-[11px] border border-[#dce5dd] bg-white px-5 py-3 text-[13px] font-semibold text-[#2b5845] transition hover:bg-[#f4f9f5]"
              >
                How it works
              </a>
            </div>
            <div className="landing-fade landing-d4 mt-5 flex items-center gap-2 text-[11.5px] text-[#8a968e]">
              <LockKeyhole className="h-3.5 w-3.5 text-[#7ca289]" />
              No password — any email works. Nothing is ever sent without your
              explicit approval.
            </div>
          </div>

          <div className="landing-fade landing-d2">
            <QueuePreview />
          </div>
        </div>

        {/* Stat strip */}
        <div className="landing-fade landing-d4 mt-14 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["3 documents → 3 decisions", "one clean item each, never duplicates"],
            ["0 messages sent", "without explicit human approval"],
            ["100% of agent actions", "traced in an auditable timeline"],
            ["~1 minute", "from upload to decision queue"],
          ].map(([stat, detail]) => (
            <div
              key={stat}
              className="rounded-[14px] border border-[#e6ebe5] bg-white p-4 shadow-[0_5px_16px_rgba(35,55,43,0.035)]"
            >
              <div className="text-[13px] font-semibold tracking-[-0.01em] text-[#2b5845]">
                {stat}
              </div>
              <div className="mt-1 text-[11px] leading-5 text-[#9ba69f]">
                {detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 border-t border-[#e9eee8] bg-[#fbfcfa] py-16 md:py-20">
        <div className="mx-auto max-w-[1160px] px-5 md:px-8">
          <div className="mb-10 max-w-[560px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">
              How it works
            </div>
            <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.035em] text-[#1c2a24] md:text-[34px]">
              From paperwork to a decision, in four steps
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-[16px] border border-[#e6ebe5] bg-white p-5 shadow-[0_5px_16px_rgba(35,55,43,0.035)]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#e9f1eb] text-[#2b5845]">
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#c6d2c8]">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.015em] text-[#26352d]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[12px] leading-5 text-[#77847c]">
                    {step.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Approval gate */}
      <section id="gate" className="scroll-mt-24 py-16 md:py-20">
        <div className="mx-auto max-w-[1160px] px-5 md:px-8">
          <div className="overflow-hidden rounded-[20px] bg-[#263f35] px-6 py-10 text-[#f5faf5] shadow-[0_18px_44px_rgba(38,63,53,0.22)] md:px-12 md:py-14">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b3d1b9]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Human in the loop
                </div>
                <h2 className="mt-5 text-[28px] font-semibold leading-[1.15] tracking-[-0.035em] md:text-[34px]">
                  The approval gate is not a confirmation dialog.
                </h2>
                <p className="mt-4 max-w-[480px] text-[13.5px] leading-7 text-[#b9ccc0]">
                  Triage can read, classify, and draft — but it cannot act.
                  Every consequential action stops at a first-class approval
                  record. The agent cannot talk the system past the gate, no
                  matter what the model says: it is enforced in code, and the
                  test suite proves it.
                </p>
                <div className="mt-7 inline-flex items-center gap-2.5 rounded-[12px] bg-white/10 px-4 py-3 text-[11.5px] font-medium text-[#d8e7da]">
                  <Clock3 className="h-4 w-4 text-[#9fc6a5]" />
                  Approvals expire after 7 days if unused
                </div>
              </div>
              <div className="space-y-3">
                {gateFeatures.map(feature => (
                  <div
                    key={feature.title}
                    className="rounded-[14px] border border-white/10 bg-white/[0.06] p-5"
                  >
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-[#eef6ee]">
                      <CheckCircle2 className="h-4 w-4 text-[#9fc6a5]" />
                      {feature.title}
                    </div>
                    <p className="mt-1.5 pl-6 text-[12px] leading-5 text-[#a9c2ad]">
                      {feature.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="scroll-mt-24 border-t border-[#e9eee8] bg-[#fbfcfa] py-16 md:py-20">
        <div className="mx-auto max-w-[1160px] px-5 md:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">
                Live demo
              </div>
              <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.035em] text-[#1c2a24] md:text-[34px]">
                See the full pipeline in 60 seconds
              </h2>
              <p className="mt-4 max-w-[520px] text-[13.5px] leading-7 text-[#6e7b73]">
                Sign in with any email, press{" "}
                <span className="font-semibold text-[#33443b]">
                  Load demo documents
                </span>
                , and watch three synthetic documents run the{" "}
                <span className="font-semibold text-[#33443b]">real</span>{" "}
                pipeline — real PDFs in object storage, real text extraction,
                a real Claude agent run on Amazon Bedrock — ending in your
                decision queue with drafts waiting at the approval gate.
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  "Insurance plan renewal — a decision with a deadline and a premium change",
                  "School emergency form — missing information only you can supply",
                  "Appointment confirmation — informational, with a reminder draft",
                ].map(line => (
                  <li key={line} className="flex items-start gap-2.5 text-[12.5px] leading-5 text-[#5c6a61]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#65a274]" />
                    {line}
                  </li>
                ))}
              </ul>
              <a
                href="/signin"
                className="mt-8 inline-flex items-center gap-2 rounded-[11px] bg-[#2f6d4d] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(47,109,77,0.25)] transition hover:bg-[#275d41] active:scale-[0.98]"
              >
                <Zap className="h-4 w-4" />
                Run the demo now
              </a>
            </div>
            <div className="rounded-[18px] border border-[#e6ebe5] bg-white p-6 shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">
                What judges should notice
              </div>
              <div className="mt-4 space-y-4">
                {[
                  [
                    "The audit timeline",
                    "Every step — upload, OCR, extraction, task creation, drafts, approvals, execution — is recorded with its actor (user / agent / system) and shown on the timeline page.",
                  ],
                  [
                    "The tool trace",
                    "Each document page shows the exact tools the agent invoked while processing it. No black box.",
                  ],
                  [
                    "Facts with receipts",
                    "Every extracted deadline and amount carries a verbatim source quote and page number. Unstated values stay null — the agent never invents.",
                  ],
                  [
                    "Honest simulation",
                    "v1 executions are clearly labeled simulations. The approval record is the integration point for real sending later.",
                  ],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-[12px] bg-[#f8faf7] p-4">
                    <div className="text-[12.5px] font-semibold text-[#33443b]">
                      {title}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-5 text-[#77847c]">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech */}
      <section id="stack" className="scroll-mt-24 py-16 md:py-20">
        <div className="mx-auto max-w-[1160px] px-5 md:px-8">
          <div className="mb-8 max-w-[600px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a0aaa4]">
              Under the hood
            </div>
            <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.035em] text-[#1c2a24] md:text-[34px]">
              A real agent, on a short leash
            </h2>
            <p className="mt-4 text-[13.5px] leading-7 text-[#6e7b73]">
              The Strands agent runs a genuine tool loop — seven narrow,
              audited tools — with Claude Sonnet on Amazon Bedrock. The model
              decides <em>what to extract and how to phrase drafts</em>. Code
              decides <em>what is allowed</em>: dates and amounts are
              normalized server-side, priority classification is deterministic,
              drafts never send, and a reconciliation pass enforces the queue
              and the approval gate no matter what the model does.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {techChips.map(chip => (
              <span
                key={chip}
                className="rounded-full border border-[#dce5dd] bg-white px-4 py-2 text-[12px] font-semibold text-[#2b5845] shadow-[0_3px_10px_rgba(35,55,43,0.04)]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e9eee8] bg-[#fbfcfa] py-8">
        <div className="mx-auto flex max-w-[1160px] flex-col items-start justify-between gap-4 px-5 md:flex-row md:items-center md:px-8">
          <BrandMark />
          <div className="text-[11px] leading-5 text-[#9aa59e]">
            Built for the Agents for Humans hackathon · v1 executions are
            simulations — no real messages are ever sent · Triage never provides
            medical, legal, tax, or financial advice
          </div>
        </div>
      </footer>
    </div>
  );
}
