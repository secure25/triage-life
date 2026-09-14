import DashboardLayout from "@/components/DashboardLayout";
import { processingStatusTone } from "@/components/triage/kit";
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@/const";
import { ChevronRight, FileText, Loader2 } from "lucide-react";

export default function Documents() {
  const documentsQuery = trpc.documents.list.useQuery({ limit: 100 }, {
    refetchInterval: 8000,
  });

  const documents = documentsQuery.data ?? [];

  return (
    <DashboardLayout>
      <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/80 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-2 text-[13px] text-[#839089]">
          <span className="font-semibold text-[#34483e]">Documents</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>All uploads</span>
        </div>
        <a
          href="/inbox"
          className="rounded-[9px] bg-[#263f35] px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(38,63,53,0.16)] transition hover:bg-[#1e332b]"
        >
          Upload
        </a>
      </header>

      <div className="mx-auto max-w-[1000px] px-5 py-7 md:px-9 md:py-9">
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#1c2a24]">
          Documents
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[#77847c]">
          Every document you uploaded, its processing state, and what Triage
          extracted from it.
        </p>

        <div className="mt-6 overflow-hidden rounded-[16px] border border-[#e5eae4] bg-white shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
          {documentsQuery.isLoading && (
            <div className="flex items-center justify-center p-10 text-[12px] text-[#9ba69f]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {documentsQuery.isSuccess && documents.length === 0 && (
            <div className="p-10 text-center text-[12px] text-[#9ba69f]">
              No documents yet — upload one in the Inbox.
            </div>
          )}
          {documents.map(document => (
            <a
              key={document.id}
              href={`/documents/${document.id}`}
              className="flex items-center gap-4 border-b border-[#edf0ec] p-4 transition last:border-0 hover:bg-[#fbfcfa] md:p-5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#eaf3ec] text-[#43805c]">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-[#33443b]">
                    {document.originalFilename}
                  </span>
                  {document.isSynthetic && (
                    <span className="rounded-full bg-[#eef1ee] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#89948d]">
                      synthetic
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-[#919c95]">
                  {document.documentType
                    ? document.documentType.replace(/_/g, " ")
                    : "unprocessed"}{" "}
                  · {formatBytes(document.sizeBytes)} ·{" "}
                  {new Date(document.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${processingStatusTone[document.processingStatus] ?? processingStatusTone.pending}`}
              >
                {document.processingStatus === "processing" && (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                )}
                {document.processingStatus}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#c1cbc3]" />
            </a>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
