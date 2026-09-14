import DashboardLayout from "@/components/DashboardLayout";
import { formatTime } from "@/components/triage/kit";
import { trpc } from "@/lib/trpc";
import { ChevronRight, Clock3, Loader2 } from "lucide-react";

const actorTone: Record<string, string> = {
  user: "bg-[#eaf3ec] text-[#43805c]",
  agent: "bg-[#fff6dd] text-[#a47720]",
  system: "bg-[#eef1ee] text-[#89948d]",
};

export default function Timeline() {
  const auditQuery = trpc.audit.list.useQuery({ limit: 200 }, {
    refetchInterval: 6000,
  });

  const events = auditQuery.data ?? [];

  return (
    <DashboardLayout>
      <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/80 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-2 text-[13px] text-[#839089]">
          <span className="font-semibold text-[#34483e]">Timeline</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Audit events</span>
        </div>
      </header>

      <div className="mx-auto max-w-[820px] px-5 py-7 md:px-9 md:py-9">
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#1c2a24]">
          Audit timeline
        </h1>
        <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-[#77847c]">
          A complete, append-only record of everything that happened — uploads,
          OCR runs, extractions, drafts, approvals, executions, and failures.
        </p>

        {auditQuery.isLoading && (
          <div className="mt-8 flex items-center justify-center rounded-[16px] border border-[#e5eae4] bg-white p-10 text-[12px] text-[#9ba69f]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading events…
          </div>
        )}

        {auditQuery.isSuccess && events.length === 0 && (
          <div className="mt-8 rounded-[16px] border border-dashed border-[#cfdcd2] bg-white/70 p-10 text-center text-[12px] text-[#9ba69f]">
            Nothing has happened yet. Upload or load demo documents to begin.
          </div>
        )}

        <div className="mt-8 space-y-1">
          {events.map((event, index) => (
            <div key={event.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${actorTone[event.actorType] ?? actorTone.system}`}
                >
                  <Clock3 className="h-3.5 w-3.5" />
                </div>
                {index < events.length - 1 && (
                  <div className="my-1 w-px flex-1 bg-[#e9eee9]" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-[#33443b]">
                    {event.summary}
                  </span>
                  <span className="rounded-full bg-[#f1f4f0] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#89948d]">
                    {event.eventType.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-[#99a39d]">
                  <span>{event.actorType}</span>
                  <span>·</span>
                  <span>
                    {new Date(event.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>· {formatTime(event.createdAt)}</span>
                  {event.documentId && (
                    <a
                      href={`/documents/${event.documentId}`}
                      className="font-semibold text-[#5b8065] hover:underline"
                    >
                      open document
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
