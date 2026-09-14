import DashboardLayout from "@/components/DashboardLayout";
import {
  StatusBadge,
  UrgencyBadge,
  draftStatusLabels,
  formatAmount,
  formatDue,
  formatTime,
  processingStatusTone,
} from "@/components/triage/kit";
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@/const";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  Pencil,
  RotateCw,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast, Toaster } from "sonner";

type AgentRun = {
  id: string;
  status: string;
  provider: string | null;
  modelId: string | null;
  error: string | null;
  startedAt: Date | string;
  structuredOutput: {
    agentExplanation?: string;
    documentType?: string;
  } | null;
  toolTrace: Array<{
    tool: string;
    startedAt: string;
    ok: boolean;
  }> | null;
};

export default function DocumentDetail({ documentId }: { documentId: string }) {
  const utils = trpc.useUtils();
  const detailQuery = trpc.documents.get.useQuery({ id: documentId }, {
    refetchInterval: 5000,
  });

  const retryProcessing = trpc.documents.retryProcessing.useMutation();
  const deleteDocument = trpc.documents.delete.useMutation();
  const approveDraft = trpc.drafts.approve.useMutation();
  const rejectDraft = trpc.drafts.reject.useMutation();
  const dismissDraft = trpc.drafts.dismiss.useMutation();
  const editDraft = trpc.drafts.edit.useMutation();

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  if (detailQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-[12px] text-[#9ba69f]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading document…
        </div>
      </DashboardLayout>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[700px] px-5 py-16 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-[#c45322]" />
          <h1 className="mt-3 text-[18px] font-semibold text-[#26352d]">
            Document not found
          </h1>
          <p className="mt-1.5 text-[12px] text-[#8a968e]">
            It may belong to another account, or it was deleted.
          </p>
          <a
            href="/documents"
            className="mt-5 inline-block rounded-[10px] bg-[#263f35] px-4 py-2.5 text-[12px] font-semibold text-white"
          >
            Back to documents
          </a>
        </div>
      </DashboardLayout>
    );
  }

  const { document, obligations, agentRuns, auditEvents } = detailQuery.data;
  const latestRun = agentRuns[0] as AgentRun | undefined;
  const completedRun = agentRuns.find(
    run => run.status === "completed",
  ) as AgentRun | undefined;

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
      toast.info("Draft rejected — the task stays open");
      await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection failed");
    }
  };

  const handleDismiss = async (draftId: string) => {
    try {
      await dismissDraft.mutateAsync({ draftId });
      toast.info("Action dismissed");
      await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dismissal failed");
    }
  };

  const startEdit = (draftId: string, subject: string | null, body: string) => {
    setEditingDraftId(draftId);
    setEditSubject(subject ?? "");
    setEditBody(body);
  };

  const saveEdit = async (draftId: string) => {
    try {
      const updated = await editDraft.mutateAsync({
        draftId,
        subject: editSubject.trim() || null,
        body: editBody,
      });
      if (updated.status === "awaiting_approval") {
        toast.info("Draft saved — approval needed again (content changed)");
      } else {
        toast.success("Draft saved");
      }
      setEditingDraftId(null);
      await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  };

  const handleRetry = async () => {
    try {
      await retryProcessing.mutateAsync({ id: documentId });
      toast.info("Retrying processing");
      await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete "${document.originalFilename}" and everything extracted from it? The original file is removed too. This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteDocument.mutateAsync({ id: documentId });
      toast.success("Document deleted");
      window.location.href = "/documents";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <DashboardLayout>
      <Toaster richColors position="top-center" />
      <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/80 px-5 backdrop-blur md:px-9">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-[#839089]">
          <a href="/documents" className="font-semibold text-[#34483e]">
            Documents
          </a>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{document.originalFilename}</span>
        </div>
        <div className="flex items-center gap-2">
          {document.processingStatus === "failed" && (
            <button
              onClick={() => void handleRetry()}
              disabled={retryProcessing.isPending}
              className="flex items-center gap-1.5 rounded-[9px] bg-[#263f35] px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-[#1e332b] disabled:opacity-60"
            >
              <RotateCw className="h-3.5 w-3.5" /> Retry processing
            </button>
          )}
          <a
            href={`/api/files/${document.storageKey}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-[9px] border border-[#e3e8e2] bg-white px-3 py-2 text-[11px] font-semibold text-[#69756f] shadow-sm transition hover:bg-[#f7f9f6]"
          >
            <Eye className="h-3.5 w-3.5" /> Original
          </a>
          <button
            onClick={() => void handleDelete()}
            disabled={deleteDocument.isPending}
            className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#e3e8e2] bg-white text-[#94a099] shadow-sm transition hover:text-[#b55f3f]"
            title="Delete document"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-5 py-7 md:px-9 md:py-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-[-0.035em] text-[#1c2a24]">
                {document.originalFilename}
              </h1>
              {document.isSynthetic && (
                <span className="rounded-full bg-[#eef1ee] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#89948d]">
                  synthetic demo
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#8a968e]">
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${processingStatusTone[document.processingStatus]}`}
              >
                {document.processingStatus}
              </span>
              <span>
                {document.documentType
                  ? document.documentType.replace(/_/g, " ")
                  : "type pending"}
              </span>
              <span>· {formatBytes(document.sizeBytes)}</span>
              <span>
                ·{" "}
                {new Date(document.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {document.ocrConfidence !== null && (
                <span>
                  · OCR {Math.round((document.ocrConfidence ?? 0) * 100)}%
                </span>
              )}
              {latestRun?.provider && <span>· via {latestRun.provider}</span>}
            </div>
          </div>
        </div>

        {document.processingStatus === "failed" && document.processingError && (
          <div className="mt-5 rounded-[12px] border border-[#f0d9cb] bg-[#fff0e8] p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[#c45322]">
              <AlertCircle className="h-4 w-4" /> Processing failed
            </div>
            <p className="mt-1.5 text-[12px] leading-5 text-[#a3543a]">
              {document.processingError}
            </p>
            <p className="mt-1 text-[11px] text-[#b98a75]">
              The original document is safe. You can retry once the cause is
              resolved.
            </p>
          </div>
        )}

        <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.75fr)]">
          <div className="space-y-6">
            {completedRun?.structuredOutput?.agentExplanation && (
              <section className="rounded-[16px] border border-[#e5eae4] bg-white p-5 shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#eaf3ec] text-[#4d855f]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-[14px] font-semibold text-[#33443b]">
                    What this document is
                  </h2>
                  <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-[#a9b3ac]">
                    agent interpretation
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-6 text-[#5c6a61]">
                  {completedRun.structuredOutput.agentExplanation}
                </p>
              </section>
            )}

            {obligations.length === 0 &&
              document.processingStatus === "completed" && (
                <div className="rounded-[16px] border border-dashed border-[#cfdcd2] bg-white/70 p-8 text-center text-[12px] text-[#9ba69f]">
                  No obligations were extracted from this document.
                </div>
              )}

            {obligations.map(({ obligation, draft, approval }) => (
              <section
                key={obligation.id}
                className="rounded-[16px] border border-[#e5eae4] bg-white p-5 shadow-[0_7px_20px_rgba(35,55,43,0.035)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#26372e]">
                      {obligation.title}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={obligation.status} />
                      <UrgencyBadge urgency={obligation.urgency} />
                      <span className="text-[11px] text-[#8a968e]">
                        {formatDue(obligation.dueAt?.toISOString() ?? null)}
                        {obligation.confidence !== null &&
                          ` · ${Math.round((obligation.confidence ?? 0) * 100)}% confidence`}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-[12px] leading-5 text-[#6e7b73]">
                  {obligation.description}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-3 rounded-[12px] bg-[#f8faf7] p-3.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a1aba4]">
                      Extracted facts
                    </div>
                    {[
                      ["Deadline", obligation.dueAt ? new Date(obligation.dueAt).toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "Not stated"],
                      ["Amount", formatAmount(obligation.amountCents, obligation.currency) ?? "None"],
                      ["Category", obligation.category ?? "—"],
                      ["Missing", obligation.missingInformation?.length ? obligation.missingInformation.join(", ") : "Nothing"],
                    ].map(([key, value]) => (
                      <div key={String(key)} className="flex gap-3 text-[11px]">
                        <span className="w-[80px] shrink-0 font-medium text-[#99a39d]">{key}</span>
                        <span className="font-medium text-[#4f5f55]">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3 rounded-[12px] bg-[#f8faf7] p-3.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a1aba4]">
                      Recommendation
                    </div>
                    <p className="text-[11px] font-medium leading-5 text-[#4f5f55]">
                      {obligation.recommendedNextStep ?? "No action suggested."}
                    </p>
                    {obligation.sourceQuote && (
                      <blockquote className="border-l-2 border-[#d5e5d9] pl-3 text-[11px] italic leading-5 text-[#8a968e]">
                        “{obligation.sourceQuote}”
                        <span className="mt-1 block not-italic text-[10px] text-[#a9b3ac]">
                          Source · page {obligation.sourcePage ?? 1}
                        </span>
                      </blockquote>
                    )}
                  </div>
                </div>

                {draft && (
                  <div className="mt-5 rounded-[14px] border border-[#ecefea] bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf0ec] px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#33443b]">
                        <Send className="h-3.5 w-3.5 text-[#7ca289]" />
                        Draft {draft.channel === "reminder" ? "reminder" : "reply"}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          draft.status === "awaiting_approval"
                            ? "bg-[#fff0e8] text-[#c45322]"
                            : draft.status === "executed_simulated"
                              ? "bg-[#e8f6ef] text-[#34855b]"
                              : draft.status === "rejected"
                                ? "bg-[#f9eae5] text-[#b55f3f]"
                                : "bg-[#eef1ee] text-[#89948d]"
                        }`}
                      >
                        {draftStatusLabels[draft.status] ?? draft.status}
                      </span>
                    </div>

                    {editingDraftId === draft.id ? (
                      <div className="space-y-3 p-4">
                        <input
                          value={editSubject}
                          onChange={event => setEditSubject(event.target.value)}
                          placeholder="Subject"
                          className="w-full rounded-[9px] border border-[#e3e8e2] bg-[#fbfcfa] px-3 py-2 text-[12px] font-semibold outline-none focus:border-[#9dbfa9]"
                        />
                        <textarea
                          value={editBody}
                          onChange={event => setEditBody(event.target.value)}
                          rows={10}
                          className="w-full rounded-[9px] border border-[#e3e8e2] bg-[#fbfcfa] px-3 py-2.5 text-[12px] leading-5 outline-none focus:border-[#9dbfa9]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void saveEdit(draft.id)}
                            disabled={editDraft.isPending || editBody.trim().length === 0}
                            className="flex items-center gap-2 rounded-[9px] bg-[#2f6d4d] px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-[#275d41] disabled:opacity-60"
                          >
                            {editDraft.isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            Save draft
                          </button>
                          <button
                            onClick={() => setEditingDraftId(null)}
                            className="rounded-[9px] border border-[#e4e9e3] px-3.5 py-2 text-[11px] font-semibold text-[#69756f]"
                          >
                            Cancel
                          </button>
                          <span className="ml-auto text-[10px] text-[#a9b3ac]">
                            Editing after approval invalidates the approval
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        {draft.subject && (
                          <div className="mb-2 text-[12px] font-semibold text-[#4f5f55]">
                            {draft.subject}
                          </div>
                        )}
                        <div className="whitespace-pre-line text-[12px] leading-6 text-[#637169]">
                          {draft.body}
                        </div>

                        {draft.status === "awaiting_approval" && (
                          <>
                            <div className="mt-4 flex items-start gap-2 rounded-[10px] bg-[#fff6dd] p-3 text-[11px] leading-5 text-[#8a6512]">
                              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                <strong>What happens after approval:</strong>{" "}
                                {draft.channel === "reminder"
                                  ? "a reminder is added to your queue (simulation — nothing leaves your account)."
                                  : "this draft is sent to the address in the document (v1 is a simulation — no real message is sent)."}
                                {approval && " Approval expires in 7 days if unused."}
                              </span>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                onClick={() => void handleApprove(draft.id)}
                                disabled={approveDraft.isPending}
                                className="flex items-center gap-2 rounded-[9px] bg-[#2f6d4d] px-4 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#275d41] active:scale-[0.98] disabled:opacity-60"
                              >
                                {approveDraft.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5" />
                                )}
                                Approve & run
                              </button>
                              <button
                                onClick={() =>
                                  startEdit(draft.id, draft.subject, draft.body)
                                }
                                className="flex items-center gap-1.5 rounded-[9px] border border-[#e4e9e3] px-3.5 py-2.5 text-[11px] font-semibold text-[#5b8065] transition hover:bg-[#f7f9f6]"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                onClick={() => void handleReject(draft.id)}
                                className="flex items-center gap-1.5 rounded-[9px] border border-[#e4e9e3] px-3.5 py-2.5 text-[11px] font-semibold text-[#a3543a] transition hover:bg-[#fdf6f3]"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                              <button
                                onClick={() => void handleDismiss(draft.id)}
                                className="rounded-[9px] border border-[#e4e9e3] px-3.5 py-2.5 text-[11px] font-semibold text-[#94a099] transition hover:bg-[#f7f9f6]"
                              >
                                Dismiss
                              </button>
                            </div>
                          </>
                        )}

                        {draft.status === "executed_simulated" && (
                          <div className="mt-4 rounded-[10px] bg-[#edf7ef] p-3">
                            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#3a8056]">
                              <CheckCircle2 className="h-4 w-4" /> Executed —
                              simulation only
                            </div>
                            <p className="mt-1.5 text-[11px] leading-5 text-[#75917d]">
                              {draft.sentAt &&
                                `At ${formatTime(draft.sentAt)} · `}
                              No real message was sent and no real account was
                              touched.
                            </p>
                          </div>
                        )}

                        {(draft.status === "rejected" || draft.status === "dismissed") && (
                          <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-[#f8faf7] p-3 text-[11px] text-[#8a968e]">
                            {draft.status === "rejected"
                              ? "You rejected this draft — the task stays open for manual handling."
                              : "You dismissed this action."}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="space-y-6">
            <section className="rounded-[16px] border border-[#e5eae4] bg-white p-5 shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-[#7ca289]" />
                <h2 className="text-[13px] font-semibold text-[#33443b]">
                  Agent tool trace
                </h2>
              </div>
              <p className="mt-1 text-[10px] text-[#a1aba4]">
                Every tool the agent invoked while processing this document.
              </p>
              <div className="mt-4 space-y-2">
                {(completedRun?.toolTrace ?? []).length === 0 && (
                  <div className="text-[11px] text-[#9ba69f]">
                    {latestRun?.status === "failed"
                      ? "No completed run yet."
                      : "No trace recorded yet."}
                  </div>
                )}
                {(completedRun?.toolTrace ?? []).map((entry, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2.5 rounded-[9px] bg-[#f8faf7] px-3 py-2"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.ok ? "bg-[#65a274]" : "bg-[#c45322]"}`}
                    />
                    <span className="font-mono text-[10.5px] text-[#5c6a61]">
                      {entry.tool}
                    </span>
                    <span className="ml-auto text-[10px] text-[#a9b3ac]">
                      {formatTime(entry.startedAt)}
                    </span>
                  </div>
                ))}
                {completedRun && (
                  <div className="pt-1 text-[10px] text-[#a9b3ac]">
                    engine {completedRun.provider ?? "—"}
                    {completedRun.modelId ? ` · ${completedRun.modelId}` : ""}
                  </div>
                )}
              </div>
            </section>

            {document.ocrText && (
              <section className="rounded-[16px] border border-[#e5eae4] bg-white p-5 shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
                <h2 className="text-[13px] font-semibold text-[#33443b]">
                  Extracted text (OCR)
                </h2>
                <p className="mt-1 text-[10px] text-[#a1aba4]">
                  {document.ocrConfidence !== null
                    ? `${Math.round((document.ocrConfidence ?? 0) * 100)}% confidence · ${(document.ocrPages ?? []).length} page(s)`
                    : "confidence unknown"}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-semibold text-[#5b8065]">
                    Show text
                  </summary>
                  <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#f8faf7] p-3 font-mono text-[10px] leading-5 text-[#637169]">
                    {document.ocrText}
                  </pre>
                </details>
              </section>
            )}

            <section className="rounded-[16px] border border-[#e5eae4] bg-white p-5 shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
              <h2 className="text-[13px] font-semibold text-[#33443b]">
                Document audit trail
              </h2>
              <div className="mt-4 space-y-3">
                {auditEvents.length === 0 && (
                  <div className="text-[11px] text-[#9ba69f]">No events yet.</div>
                )}
                {auditEvents.map(event => (
                  <div key={event.id} className="flex gap-3">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f1f4f0] text-[#8e9c92]">
                      <FileText className="h-3 w-3" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium leading-5 text-[#53635a]">
                        {event.summary}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#99a39d]">
                        {event.eventType} · {event.actorType} ·{" "}
                        {formatTime(event.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
