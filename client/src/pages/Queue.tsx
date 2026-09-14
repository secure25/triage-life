import DashboardLayout from "@/components/DashboardLayout";
import {
  StatusBadge,
  UrgencyBadge,
  formatAmount,
  formatDue,
} from "@/components/triage/kit";
import { trpc } from "@/lib/trpc";
import type { Obligation } from "@shared/types";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast, Toaster } from "sonner";

const statusFilters: Array<{ value: Obligation["status"] | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "needs_decision", label: "Needs decision" },
  { value: "waiting_for_info", label: "Waiting for you" },
  { value: "due_soon", label: "Due soon" },
  { value: "in_progress", label: "In progress" },
  { value: "handled", label: "Handled" },
  { value: "dismissed", label: "Dismissed" },
];

export default function Queue() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<
    Obligation["status"] | "all"
  >("all");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "high" | "medium" | "low">(
    "all",
  );

  const queueQuery = trpc.queue.list.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      urgency: urgencyFilter === "all" ? undefined : urgencyFilter,
      includeHandled:
        statusFilter === "handled" || statusFilter === "dismissed" || statusFilter === "all",
    },
    { refetchInterval: 8000 },
  );

  const setStatus = trpc.queue.setStatus.useMutation();

  const handleSetStatus = async (
    obligationId: string,
    next: "handled" | "dismissed",
  ) => {
    try {
      await setStatus.mutateAsync({ obligationId, status: next });
      toast.success(next === "handled" ? "Marked handled" : "Dismissed");
      await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const items = queueQuery.data ?? [];

  return (
    <DashboardLayout>
      <Toaster richColors position="top-center" />
      <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/80 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-2 text-[13px] text-[#839089]">
          <span className="font-semibold text-[#34483e]">Decisions</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Queue</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1000px] px-5 py-7 md:px-9 md:py-9">
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#1c2a24]">
          Decision queue
        </h1>
        <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-[#77847c]">
          Everything Triage extracted, ordered by what only you can decide.
          Approvals live inside each document.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {statusFilters.map(filter => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-[#263f35] text-white"
                  : "border border-[#e3e8e2] bg-white text-[#69756f] hover:bg-[#f0f4ef]"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <div className="mx-2 hidden h-5 w-px bg-[#e3e8e2] sm:block" />
          {(["all", "high", "medium", "low"] as const).map(urgency => (
            <button
              key={urgency}
              onClick={() => setUrgencyFilter(urgency)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition ${
                urgencyFilter === urgency
                  ? "bg-[#e9f1eb] text-[#2b5845]"
                  : "border border-[#e3e8e2] bg-white text-[#89948d] hover:bg-[#f0f4ef]"
              }`}
            >
              {urgency}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {queueQuery.isLoading && (
            <div className="flex items-center justify-center rounded-[16px] border border-[#e5eae4] bg-white p-10 text-[12px] text-[#9ba69f]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your queue…
            </div>
          )}
          {queueQuery.isSuccess && items.length === 0 && (
            <div className="rounded-[16px] border border-dashed border-[#cfdcd2] bg-white/70 p-10 text-center text-[12px] text-[#9ba69f]">
              Nothing here. Upload documents in the Inbox, or load the demo set.
            </div>
          )}
          {items.map(({ obligation, draft, document }) => (
            <div
              key={obligation.id}
              className="rounded-[16px] border border-[#e5eae4] bg-white p-4 shadow-[0_7px_20px_rgba(35,55,43,0.035)] transition hover:shadow-[0_9px_24px_rgba(35,55,43,0.05)] md:p-5"
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#eaf3ec] text-[#43805c]">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/documents/${obligation.documentId}`}
                      className="text-[14px] font-semibold text-[#33443b] hover:underline"
                    >
                      {obligation.title}
                    </a>
                    <StatusBadge status={obligation.status} />
                    <UrgencyBadge urgency={obligation.urgency} />
                    {document?.isSynthetic && (
                      <span className="rounded-full bg-[#eef1ee] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#89948d]">
                        synthetic
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-[#919c95]">
                    {obligation.category ?? "document"} ·{" "}
                    {formatDue(obligation.dueAt?.toISOString() ?? null)}
                    {obligation.amountCents !== null &&
                      ` · ${formatAmount(obligation.amountCents, obligation.currency)}`}
                    {obligation.confidence !== null &&
                      ` · ${Math.round((obligation.confidence ?? 0) * 100)}% confidence`}
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[#6e7b73]">
                    {obligation.description}
                  </p>

                  {obligation.requiredUserDecision && (
                    <div className="mt-3 rounded-[10px] bg-[#fff6dd] px-3 py-2 text-[11px] font-medium leading-5 text-[#8a6512]">
                      Needs your input: {obligation.requiredUserDecision}
                    </div>
                  )}
                  {obligation.missingInformation &&
                    obligation.missingInformation.length > 0 && (
                      <div className="mt-2 rounded-[10px] bg-[#f9eae5] px-3 py-2 text-[11px] font-medium leading-5 text-[#a3543a]">
                        Missing: {obligation.missingInformation.join(" · ")}
                      </div>
                    )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    {draft && draft.status === "awaiting_approval" && (
                      <a
                        href={`/documents/${obligation.documentId}`}
                        className="rounded-[8px] bg-[#2f6d4d] px-3 py-1.5 font-semibold text-white transition hover:bg-[#275d41]"
                      >
                        Review draft & approve
                      </a>
                    )}
                    {draft && draft.status === "executed_simulated" && (
                      <span className="flex items-center gap-1.5 rounded-[8px] bg-[#e8f6ef] px-3 py-1.5 font-semibold text-[#34855b]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Executed
                        (simulated)
                      </span>
                    )}
                    {obligation.status !== "handled" &&
                      obligation.status !== "dismissed" && (
                        <>
                          <button
                            onClick={() => void handleSetStatus(obligation.id, "handled")}
                            disabled={setStatus.isPending}
                            className="rounded-[8px] border border-[#e4e9e3] px-3 py-1.5 font-semibold text-[#5b8065] transition hover:bg-[#f7f9f6] disabled:opacity-60"
                          >
                            Mark handled
                          </button>
                          <button
                            onClick={() => void handleSetStatus(obligation.id, "dismissed")}
                            disabled={setStatus.isPending}
                            className="flex items-center gap-1 rounded-[8px] border border-[#e4e9e3] px-3 py-1.5 font-semibold text-[#94a099] transition hover:bg-[#f7f9f6] disabled:opacity-60"
                          >
                            <X className="h-3 w-3" /> Dismiss
                          </button>
                        </>
                      )}
                    <a
                      href={`/documents/${obligation.documentId}`}
                      className="ml-auto flex items-center gap-1 font-semibold text-[#5b8065] hover:text-[#2b5845]"
                    >
                      Open document <ChevronRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
