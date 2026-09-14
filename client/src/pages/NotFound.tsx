import { AlertCircle, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8f5] px-4 text-[#192521]">
      <div className="w-full max-w-[440px] rounded-[18px] border border-[#e6ebe5] bg-white p-8 text-center shadow-[0_7px_20px_rgba(35,55,43,0.035)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f9eae5] text-[#b55f3f]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.035em] text-[#1c2a24]">
          Page not found
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[#77847c]">
          The page you are looking for doesn't exist or may have been moved.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-[11px] bg-[#263f35] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_5px_12px_rgba(38,63,53,0.16)] transition hover:bg-[#1e332b]"
        >
          Back to the landing page <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
