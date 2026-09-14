import DashboardLayout from "@/components/DashboardLayout";
import {
  formatBytes,
  isAllowedMimeType,
  MAX_UPLOAD_BYTES,
} from "@/const";
import { processingStatusTone } from "@/components/triage/kit";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  RotateCw,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast, Toaster } from "sonner";

type UploadState = {
  id: string;
  filename: string;
  progress: number;
  status: "uploading" | "stored" | "error";
  error?: string;
  documentId?: string;
};

type RecentDocument = {
  id: string;
  originalFilename: string;
  processingStatus: string;
  processingError: string | null;
  isSynthetic: boolean;
  sizeBytes: number;
  createdAt: Date | string;
};

function mimeTypeForFile(file: File): string {
  // Trust the browser's type when present; fall back to extension mapping
  // because Windows often reports empty types for PDFs.
  if (file.type && isAllowedMimeType(file.type)) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return file.type || "unknown";
  }
}

export default function Inbox() {
  const utils = trpc.useUtils();
  const createIntent = trpc.documents.createUploadIntent.useMutation();
  const retryProcessing = trpc.documents.retryProcessing.useMutation();
  const createDemo = trpc.demo.create.useMutation();

  const [dragActive, setDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(new Map<string, () => void>());

  const documentsQuery = trpc.documents.list.useQuery({ limit: 25 }, {
    refetchInterval: 6000,
  });

  const uploadFile = async (file: File) => {
    const uploadId = crypto.randomUUID();
    const mimeType = mimeTypeForFile(file);

    setUploads(previous => [
      {
        id: uploadId,
        filename: file.name,
        progress: 0,
        status: "uploading",
      },
      ...previous,
    ]);

    try {
      const intent = await createIntent.mutateAsync({
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        abortRef.current.set(uploadId, () => xhr.abort());

        xhr.upload.addEventListener("progress", event => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploads(previous =>
              previous.map(upload =>
                upload.id === uploadId ? { ...upload, progress } : upload,
              ),
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 201) {
            const response = JSON.parse(xhr.responseText) as { documentId: string };
            setUploads(previous =>
              previous.map(upload =>
                upload.id === uploadId
                  ? { ...upload, status: "stored", progress: 100, documentId: response.documentId }
                  : upload,
              ),
            );
            resolve();
          } else {
            let message = "Upload failed — try again.";
            try {
              message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
            } catch {
              // keep default message
            }
            setUploads(previous =>
              previous.map(upload =>
                upload.id === uploadId ? { ...upload, status: "error", error: message } : upload,
              ),
            );
            reject(new Error(message));
          }
        });

        xhr.addEventListener("error", () => {
          setUploads(previous =>
            previous.map(upload =>
              upload.id === uploadId
                ? { ...upload, status: "error", error: "Network error during upload." }
                : upload,
            ),
          );
          reject(new Error("Network error during upload."));
        });

        xhr.addEventListener("abort", () => {
          setUploads(previous => previous.filter(upload => upload.id !== uploadId));
          resolve();
        });

        xhr.open("PUT", intent.uploadUrl);
        xhr.setRequestHeader("Content-Type", mimeType);
        xhr.send(file);
      });

      toast.success(`Uploaded "${file.name}" — processing started`);
      await utils.documents.list.invalidate();
    } catch (error) {
      if (error instanceof Error && error.message !== "canceled") {
        toast.error(error.message);
        setUploads(previous =>
          previous.map(upload =>
            upload.id === uploadId && upload.status === "uploading"
              ? { ...upload, status: "error", error: error.message }
              : upload,
          ),
        );
      }
    } finally {
      abortRef.current.delete(uploadId);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(
          `"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
        );
        return;
      }
      if (!isAllowedMimeType(mimeTypeForFile(file))) {
        toast.error(`"${file.name}" is not a PDF, PNG, JPG, or DOCX file.`);
        return;
      }
      void uploadFile(file);
    });
  };

  const cancelUpload = (uploadId: string) => {
    abortRef.current.get(uploadId)?.();
  };

  const handleRetry = async (documentId: string) => {
    try {
      await retryProcessing.mutateAsync({ id: documentId });
      toast.info("Retrying processing");
      await utils.documents.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    }
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

  return (
    <DashboardLayout>
      <Toaster richColors position="top-center" />
      <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#fbfcfa]/80 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-2 text-[13px] text-[#839089]">
          <span className="font-semibold text-[#34483e]">Inbox</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Upload documents</span>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-5 py-7 md:px-9 md:py-9">
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#1c2a24]">
          Upload inbox
        </h1>
        <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-[#77847c]">
          Drop a document and Triage takes it from there: OCR, obligation
          extraction, deadline detection, and a drafted response — stopping at
          the approval gate. PDF, PNG, JPG, or DOCX up to{" "}
          {formatBytes(MAX_UPLOAD_BYTES)}.
        </p>

        <div
          onDragOver={event => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => {
            setDragActive(false);
          }}
          onDrop={event => {
            event.preventDefault();
            setDragActive(false);
            handleFiles(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`mt-7 cursor-pointer rounded-[16px] border-2 border-dashed p-10 text-center transition ${
            dragActive
              ? "border-[#2f6d4d] bg-[#eef5ef]"
              : "border-[#cfdcd2] bg-white/70 hover:border-[#9dbfa9] hover:bg-[#fbfdfb]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.docx"
            className="hidden"
            onChange={event => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#e9f1eb] text-[#2b5845]">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="mt-4 text-[14px] font-semibold text-[#33443b]">
            Drag documents here, or click to browse
          </div>
          <div className="mt-1 text-[11px] text-[#9aa49e]">
            The original file is stored securely outside the database. OCR runs
            server-side.
          </div>
        </div>

        {uploads.length > 0 && (
          <section className="mt-6 space-y-2">
            {uploads.map(upload => (
              <div
                key={upload.id}
                className="flex items-center gap-3 rounded-[12px] border border-[#e5eae4] bg-white p-3.5 shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf3ec] text-[#43805c]">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[12px] font-semibold text-[#33443b]">
                      {upload.filename}
                    </span>
                    {upload.status === "uploading" && (
                      <button
                        onClick={() => cancelUpload(upload.id)}
                        className="text-[#9ca9a1] transition hover:text-[#b55f3f]"
                        title="Cancel upload"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {upload.status === "uploading" && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef1ee]">
                      <div
                        className="h-full rounded-full bg-[#2f6d4d] transition-all"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  )}
                  {upload.status === "stored" && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#34855b]">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Stored — processing
                      started
                    </div>
                  )}
                  {upload.status === "error" && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#c45322]">
                      <AlertCircle className="h-3.5 w-3.5" /> {upload.error}
                    </div>
                  )}
                </div>
                {upload.status === "uploading" && (
                  <span className="text-[11px] text-[#89958e]">{upload.progress}%</span>
                )}
              </div>
            ))}
          </section>
        )}

        <section className="mt-9">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#26352d]">
              Recent documents
            </h2>
            <button
              onClick={() => void handleLoadDemo()}
              disabled={createDemo.isPending}
              className="flex items-center gap-2 rounded-[9px] border border-[#dce5dd] bg-[#f4f9f5] px-3 py-1.5 text-[11px] font-semibold text-[#2b5845] transition hover:bg-[#eaf3ec] disabled:opacity-60"
            >
              {createDemo.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Load demo documents
            </button>
          </div>

          <div className="overflow-hidden rounded-[16px] border border-[#e5eae4] bg-white shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
            {documentsQuery.isLoading && (
              <div className="p-6 text-center text-[12px] text-[#9ba69f]">Loading…</div>
            )}
            {documentsQuery.isSuccess && documentsQuery.data.length === 0 && (
              <div className="p-8 text-center text-[12px] text-[#9ba69f]">
                Nothing uploaded yet.
              </div>
            )}
            {(documentsQuery.data ?? []).map((document: RecentDocument) => (
              <a
                key={document.id}
                href={`/documents/${document.id}`}
                className="flex items-center gap-4 border-b border-[#edf0ec] p-4 transition last:border-0 hover:bg-[#fbfcfa]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf3ec] text-[#43805c]">
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
                    {formatBytes(document.sizeBytes)} ·{" "}
                    {new Date(document.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {document.processingStatus === "failed" && document.processingError && (
                    <div className="mt-1.5 text-[11px] leading-5 text-[#c45322]">
                      {document.processingError}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${processingStatusTone[document.processingStatus] ?? processingStatusTone.pending}`}
                  >
                    {document.processingStatus === "processing" && (
                      <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    )}
                    {document.processingStatus}
                  </span>
                  {document.processingStatus === "failed" && (
                    <button
                      onClick={event => {
                        event.preventDefault();
                        void handleRetry(document.id);
                      }}
                      className="flex items-center gap-1 rounded-[8px] border border-[#e4e9e3] px-2 py-1 text-[10px] font-semibold text-[#5b8065] transition hover:bg-[#f7f9f6]"
                    >
                      <RotateCw className="h-3 w-3" /> Retry
                    </button>
                  )}
                  <ChevronRight className="h-4 w-4 text-[#c1cbc3]" />
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
