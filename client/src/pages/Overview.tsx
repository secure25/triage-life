import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import {
  StatusBadge,
  UrgencyBadge,
  formatAmount,
  formatDue,
  formatTime,
} from "@/components/triage/kit";
import { trpc } from "@/lib/trpc";
import { formatMinutes } from "@/const";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  LockKeyhole,
  Plus,
  Send,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

export default function Overview() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const metricsQuery = trpc.metrics.dashboard.useQuery(undefined, {
    refetchInterval: 8000,
  });
  const queueQuery = trpc.queue.list.useQuery(undefined, { refetchInterval: 8000 });
  const documentsQuery = trpc.documents.list.useQuery({ limit: 20 }, {
    refetchInterval: 8000,
  });
  const auditQuery = trpc.audit.list.useQuery({ limit: 6 }, {
    refetchInterval: 8000,
  });

  const processPending = trpc.documents.processPending.useMutation();
  const approveDraft = trpc.drafts.approve.useMutation();
  const rejectDraft = trpc.drafts.reject.useMutation();
  const createDemo = trpc.demo.create.useMutation();

  const [selectedObligationId, setSelectedObligationId] = useState<string | null>(
    null,
  );

  const queueItems = queueQuery.data ?? [];
  const selected = useMemo(
    () =>
      queueItems.find(item => item.obligation.id === selectedObligationId) ??
      queueItems[0],
    [queueItems, selectedObligationId],
  );

  const hasDocuments = (documentsQuery.data?.length ?? 0) > 0;
  const metrics = metricsQuery.data?.metrics;
  const processingDocs = (documentsQuery.data ?? []).filter(
    doc =>
      doc.processingStatus === "processing" || doc.processingStatus === "pending",
  );

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const handleProcessInbox = async () => {
    const result = await processPending.mutateAsync();
    if (result.queued > 0) {
      toast.success(`Processing ${result.queued} document(s)`);
    } else {
      toast.info("Inbox is clear — nothing to process");
    }
    await utils.documents.list.invalidate();
    await utils.queue.list.invalidate();
  };

  const handleLoadDemo = async () => {
    const result = await createDemo.mutateAsync();
    toast.success(
      result.created.length > 0
        ? `Processing ${result.created.length} demo document(s)`
        : "Demo documents already loaded",
    );
    await utils.invalidate();
  };

  const handleApprove = async (draftId: string) => {
    try {
      const result = await approveDraft.mutateAsync({ draftId });
      toast.success("Approved — simulated execution complete");
      toast.info(result.execution.note);
      await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed");
    }
  };

  const handleReject = async (draftId: string) => {
    try {
      await rejectDraft.mutateAsync({ draftId });
      toast.info("Draft rejected — the task stays open for you");
      await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection failed");
    }
  };

  const firstName = (user?.name ?? user?.email ?? "there").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <DashboardLayout>
      <Toaster richColors position="top-center" />
      <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/80 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-2 text-[13px] text-[#839089]">
          <span className="font-semibold text-[#34483e]">Overview</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>{today}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleProcessInbox()}
            disabled={processPending.isPending}
            className="flex items-center gap-2 rounded-[9px] bg-[#263f35] px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(38,63,53,0.16)] transition hover:bg-[#1e332b] active:scale-[0.98] disabled:opacity-60"
          >
            {processPending.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Process inbox
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d9e9dd] text-[12px] font-semibold text-[#3c6750]">
            {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">
        <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#eaf3ec] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4f7e5e]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#65a274]" />
              Agent is on
            </div>
            <h1 className="text-[32px] font-semibold tracking-[-0.045em] text-[#1c2a24] md:text-[38px]">
              {greeting}, {firstName}
              <span className="text-[#b2c9b8]">.</span>
            </h1>
            <p className="mt-2 max-w-[540px] text-[14px] leading-6 text-[#77847c]">
              {metrics && metrics.waitingOnYou > 0
                ? `Your admin is under control. ${metrics.waitingOnYou} item${metrics.waitingOnYou > 1 ? "s" : ""} need${metrics.waitingOnYou > 1 ? "" : "s"} a human decision.`
                : "Your admin is under control. Nothing needs a human decision right now."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#829087]">
            <LockKeyhole className="h-3.5 w-3.5" />
            Nothing is sent without your approval
          </div>
        </section>

        {!hasDocuments && documentsQuery.isSuccess && (
          <section className="mt-7 rounded-[16px] border border-dashed border-[#cfdcd2] bg-white/70 p-6 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#e9f1eb] text-[#2b5845]">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="mt-3 text-[16px] font-semibold text-[#26352d]">
              Your desk is empty
            </h2>
            <p className="mx-auto mt-1.5 max-w-[420px] text-[12px] leading-5 text-[#8a968e]">
              Upload a document in the Inbox, or load the three synthetic demo
              documents to watch the full pipeline run end to end.
            </p>
            <button
              onClick={() => void handleLoadDemo()}
              disabled={createDemo.isPending}
              className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-[#2f6d4d] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#275d41] disabled:opacity-60"
            >
              {createDemo.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Load demo documents
            </button>
          </section>
        )}

        {/* Live agent activity strip — visible while any document processes */}
        {processingDocs.length > 0 && (
          <section className="mt-7 overflow-hidden rounded-[16px] border border-[#cfe3d3] bg-[#f2f8f3]">
            <div className="flex items-center gap-2.5 border-b border-[#dcebe0] bg-[#e9f3eb] px-5 py-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#65a274] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4f8762]" />
              </span>
              <span className="text-[12px] font-semibold text-[#2b5845]">
                Triage is working right now
              </span>
            </div>
            {processingDocs.map(doc => (
              <a
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="flex items-center gap-3 border-b border-[#e4efe6] px-5 py-3 transition last:border-0 hover:bg-[#eef5ef]"
              >
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#7ca289]" />
                <span className="truncate text-[12.5px] font-medium text-[#3f544a]">
                  {doc.processingStatus === "pending"
                    ? `Queued: ${doc.originalFilename}`
                    : `Reading ${doc.originalFilename}`}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10.5px] font-semibold text-[#5b8065]">
                  watch live <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </a>
            ))}
          </section>
        )}

        <section className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ["Open items", metrics?.openItems ?? "—", "across your documents", "#eaf3ec", "#3d7353"],
            ["Due this week", metrics?.dueThisWeek ?? "—", "deadlines approaching", "#fff6dd", "#a47720"],
            ["Waiting on you", metrics?.waitingOnYou ?? "—", "decisions only you can make", "#f9eae5", "#b55f3f"],
            ["Time reclaimed", metrics ? formatMinutes(metrics.minutesSaved) : "—", "estimated, this month", "#edf0f6", "#52627e"],
          ].map(([label, value, detail, bg, color]) => (
            <div
              key={label}
              className="rounded-[16px] border border-[#e6ebe5] bg-white p-4 shadow-[0_5px_16px_rgba(35,55,43,0.035)] md:p-5"
            >
              <div className="text-[11px] font-medium text-[#89958e]">{label}</div>
              <div className="mt-2 text-[26px] font-semibold tracking-[-0.04em]" style={{ color: String(color) }}>
                {value}
              </div>
              <div className="mt-1 text-[11px] text-[#9ba69f]">{detail}</div>
            </div>
          ))}
        </section>

        <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#26352d]">
                  Your decision queue
                </h2>
                <p className="mt-1 text-[12px] text-[#96a19b]">
                  The small number of things only you can decide.
                </p>
              </div>
              <a
                href="/queue"
                className="text-[11px] font-semibold text-[#5b8065] hover:text-[#2b5845]"
              >
                View all <ChevronRight className="ml-1 inline h-3.5 w-3.5" />
              </a>
            </div>

            <div className="overflow-hidden rounded-[16px] border border-[#e5eae4] bg-white shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
              {queueItems.length === 0 && (
                <div className="p-8 text-center text-[12px] text-[#9ba69f]">
                  {queueQuery.isLoading
                    ? "Loading your queue…"
                    : "Nothing needs a decision right now."}
                </div>
              )}
              {queueItems.slice(0, 6).map(item => (
                <button
                  key={item.obligation.id}
                  onClick={() => setSelectedObligationId(item.obligation.id)}
                  className={`flex w-full items-start gap-4 border-b border-[#edf0ec] p-4 text-left transition last:border-0 hover:bg-[#fbfcfa] md:p-5 ${
                    selected?.obligation.id === item.obligation.id ? "bg-[#fbfcfa]" : ""
                  }`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf3ec] text-[#43805c]">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#33443b]">
                        {item.obligation.title}
                      </span>
                      <StatusBadge status={item.obligation.status} />
                      <UrgencyBadge urgency={item.obligation.urgency} />
                    </div>
                    <div className="mt-1 text-[11px] text-[#919c95]">
                      {item.document?.isSynthetic ? "Synthetic demo · " : ""}
                      {item.obligation.category ?? "document"}
                    </div>
                    <p className="mt-2 max-w-[620px] text-[12px] leading-5 text-[#6e7b73]">
                      {item.obligation.description}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right md:block">
                    <div className="text-[11px] font-semibold text-[#65736a]">
                      {formatDue(item.obligation.dueAt?.toISOString() ?? null)}
                    </div>
                    <div className="mt-1 text-[10px] text-[#a0aaa4]">due date</div>
                  </div>
                  <ChevronRight
                    className={`mt-2 h-4 w-4 shrink-0 transition ${
                      selected?.obligation.id === item.obligation.id
                        ? "text-[#598067]"
                        : "text-[#c1cbc3]"
                    }`}
                  />
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[16px] border border-[#e5eae4] bg-white shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
            <div className="flex items-start justify-between border-b border-[#edf0ec] p-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#eaf3ec] text-[#4d855f]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-[14px] font-semibold text-[#33443b]">Agent brief</h2>
                </div>
                <p className="mt-2 text-[11px] text-[#9aa49e]">
                  What Triage found in this item
                </p>
              </div>
            </div>

            {!selected ? (
              <div className="p-8 text-center text-[12px] text-[#9ba69f]">
                Select a queue item to see the agent brief.
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[16px] font-semibold tracking-[-0.025em] text-[#26372e]">
                      {selected.obligation.title}
                    </div>
                    <div className="mt-1 text-[11px] text-[#8a968e]">
                      {formatDue(selected.obligation.dueAt?.toISOString() ?? null)}
                      {selected.obligation.confidence !== null &&
                        ` · ${Math.round((selected.obligation.confidence ?? 0) * 100)}% confidence`}
                    </div>
                  </div>
                  <StatusBadge status={selected.obligation.status} />
                </div>

                <div className="mt-5 space-y-3 rounded-[12px] bg-[#f8faf7] p-3.5">
                  {[
                    ["Category", selected.obligation.category],
                    [
                      "Deadline",
                      selected.obligation.dueAt
                        ? new Date(selected.obligation.dueAt).toLocaleString(undefined, {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Not stated",
                    ],
                    [
                      "Amount",
                      formatAmount(selected.obligation.amountCents, selected.obligation.currency) ??
                        "—",
                    ],
                    [
                      "Missing info",
                      selected.obligation.missingInformation?.length
                        ? selected.obligation.missingInformation.join(", ")
                        : "Nothing",
                    ],
                  ].map(([key, value]) => (
                    <div key={String(key)} className="flex gap-3 text-[11px]">
                      <span className="w-[92px] shrink-0 font-medium text-[#99a39d]">{key}</span>
                      <span className="font-medium text-[#4f5f55]">{value ?? "—"}</span>
                    </div>
                  ))}
                </div>

                {selected.obligation.sourceQuote && (
                  <blockquote className="mt-4 border-l-2 border-[#d5e5d9] pl-3 text-[11px] italic leading-5 text-[#8a968e]">
                    “{selected.obligation.sourceQuote}”
                    <span className="mt-1 block not-italic text-[10px] text-[#a9b3ac]">
                      Source · page {selected.obligation.sourcePage ?? 1}
                    </span>
                  </blockquote>
                )}

                {selected.draft && selected.draft.status === "awaiting_approval" && (
                  <>
                    <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-[#c05d36]">
                      <AlertCircle className="h-3.5 w-3.5" /> Your input is needed
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-[#738078]">
                      {selected.obligation.recommendedNextStep}
                    </p>
                    <div className="mt-4 rounded-[12px] border border-[#ecefea] bg-white p-3.5 text-[11px] leading-5 text-[#637169] shadow-inner">
                      <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a1aba4]">
                        <span>Draft reply</span>
                        <span>{selected.draft.subject}</span>
                      </div>
                      <div className="whitespace-pre-line">{selected.draft.body}</div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => void handleApprove(selected.draft!.id)}
                        disabled={approveDraft.isPending}
                        className="flex flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#2f6d4d] px-3 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#275d41] active:scale-[0.98] disabled:opacity-60"
                      >
                        {approveDraft.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Approve & run (simulated)
                      </button>
                      <button
                        onClick={() => void handleReject(selected.draft!.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#e4e9e3] text-[#94a099] transition hover:bg-[#f7f9f6]"
                        title="Reject this draft"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}

                {selected.draft && selected.draft.status === "executed_simulated" && (
                  <div className="mt-5 rounded-[12px] bg-[#edf7ef] p-3.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-[#3a8056]">
                      <CheckCircle2 className="h-4 w-4" /> Executed — simulation only
                    </div>
                    <p className="mt-1.5 text-[11px] leading-5 text-[#75917d]">
                      No real message was sent. This task is handled.
                    </p>
                  </div>
                )}

                <a
                  href={`/documents/${selected.obligation.documentId}`}
                  className="mt-5 flex items-center justify-center gap-2 rounded-[9px] border border-[#e4e9e3] px-3 py-2.5 text-[11px] font-semibold text-[#5b8065] transition hover:bg-[#f7f9f6]"
                >
                  Open full document <ChevronRight className="h-3.5 w-3.5" />
                </a>

                <div className="mt-5 flex items-center gap-2 border-t border-[#edf0ec] pt-4 text-[10px] text-[#98a39c]">
                  <LockKeyhole className="h-3 w-3" /> Approval required before any
                  external action
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
          <div className="rounded-[16px] border border-[#e5eae4] bg-white p-5 shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-[#33443b]">
                  Today’s timeline
                </h2>
                <p className="mt-1 text-[11px] text-[#9aa49e]">
                  A transparent record of work done on your behalf.
                </p>
              </div>
              <a
                href="/timeline"
                className="text-[11px] font-semibold text-[#5b8065]"
              >
                Open timeline
              </a>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(auditQuery.data ?? []).length === 0 && (
                <div className="text-[11px] text-[#9ba69f]">
                  No activity yet — upload or load demo documents to begin.
                </div>
              )}
              {(auditQuery.data ?? []).map(event => (
                <div key={event.id} className="flex gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f4f0] text-[#8e9c92]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-[#53635a]">
                      {event.summary}
                    </div>
                    <div className="mt-1 text-[10px] text-[#99a39d]">
                      {event.actorType} · {formatTime(event.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[16px] bg-[#263f35] p-5 text-[#f5faf5] shadow-[0_9px_22px_rgba(38,63,53,0.13)]">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/10">
                <Clock3 className="h-4 w-4 text-[#b3d1b9]" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91b09a]">
                Your week
              </span>
            </div>
            <div className="mt-7 text-[27px] font-semibold tracking-[-0.04em]">
              {metrics ? formatMinutes(metrics.minutesSaved) : "—"}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-[#b9ccc0]">
              estimated time Triage has reclaimed this month
            </p>
            <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#9fc6a5]"
                style={{
                  width: `${Math.min(100, ((metrics?.minutesSaved ?? 0) / 300) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-[#94b09c]">
              <span>{metrics?.openItems ?? 0} open tasks</span>
              <span>goal · 5h / month</span>
            </div>
          </div>
        </section>

        <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-[#e4e9e3] pt-5 text-[10px] text-[#9aa59e] md:flex-row">
          <span>triage v1.0 · built for the Agents for Humans hackathon</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-[#6aa477]" /> Synthetic demo data
            clearly labeled · no real messages sent
          </span>
        </footer>
      </div>
    </DashboardLayout>
  );
}
