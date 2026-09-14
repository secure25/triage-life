import type { Obligation } from "@shared/types";
import { cn } from "@/lib/utils";

export const toneByUrgency: Record<string, string> = {
  high: "bg-[#fff0e8] text-[#c45322]",
  medium: "bg-[#fff8de] text-[#9b7311]",
  low: "bg-[#e8f6ef] text-[#34855b]",
};

export const statusLabels: Record<Obligation["status"], string> = {
  needs_decision: "Needs decision",
  due_soon: "Due soon",
  waiting_for_info: "Waiting for you",
  in_progress: "In progress",
  handled: "Handled",
  dismissed: "Dismissed",
};

export const statusTone: Record<Obligation["status"], string> = {
  needs_decision: "bg-[#fff0e8] text-[#c45322]",
  due_soon: "bg-[#fff6dd] text-[#a47720]",
  waiting_for_info: "bg-[#f9eae5] text-[#b55f3f]",
  in_progress: "bg-[#eaf3ec] text-[#3d7353]",
  handled: "bg-[#e8f6ef] text-[#34855b]",
  dismissed: "bg-[#eef1ee] text-[#89948d]",
};

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]",
        toneByUrgency[urgency] ?? toneByUrgency.low,
      )}
    >
      {urgency}
    </span>
  );
}

export function StatusBadge({ status }: { status: Obligation["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-semibold",
        statusTone[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

export function formatDue(dueAt: string | null | undefined): string {
  if (!dueAt) return "No date";
  const date = new Date(dueAt);
  const now = new Date();
  const days = Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const label = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (days < 0) return `${label} · overdue`;
  if (days === 0) return `${label} · today`;
  if (days === 1) return `${label} · tomorrow`;
  return `${label} · ${days}d`;
}

export function formatTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatAmount(
  amountCents: number | null,
  currency: string | null,
): string | null {
  if (amountCents === null) return null;
  const amount = (amountCents / 100).toFixed(2);
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : "";
  return `${symbol}${amount}${currency && !symbol ? ` ${currency}` : ""}`;
}

export const processingStatusTone: Record<string, string> = {
  pending: "bg-[#eef1ee] text-[#89948d]",
  processing: "bg-[#eaf3ec] text-[#3d7353]",
  completed: "bg-[#e8f6ef] text-[#34855b]",
  failed: "bg-[#fff0e8] text-[#c45322]",
};

export const draftStatusLabels: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting your approval",
  approved: "Approved",
  rejected: "Rejected",
  executed_simulated: "Executed (simulated)",
  dismissed: "Dismissed",
};
