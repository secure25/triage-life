import type { Obligation } from "../../drizzle/schema";

export type PriorityInput = {
  dueAt: Date | null;
  amountCents: number | null;
  requiredUserDecision: string | null;
  approvalRequired: boolean;
  missingInformation: string[];
  confidence: number | null;
  now?: Date;
};

export type PriorityResult = {
  urgency: Obligation["urgency"];
  status: Obligation["status"];
  reason: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Classify urgency and queue status from extraction facts.
 * Pure function — no I/O — so it is trivially testable and explainable.
 *
 * Status precedence:
 *  1. waiting_for_info — the document is missing data only the user has.
 *  2. needs_decision   — an action is drafted and waiting at the approval gate.
 *  3. due_soon         — actionable without approval, deadline approaching.
 */
export function calculatePriority(input: PriorityInput): PriorityResult {
  const now = input.now ?? new Date();
  const daysUntilDue =
    input.dueAt === null ? null : (input.dueAt.getTime() - now.getTime()) / DAY_MS;

  let urgency: PriorityResult["urgency"];
  let urgencyReason: string;

  if (daysUntilDue !== null && daysUntilDue <= 3) {
    urgency = "high";
    urgencyReason = `due in ${Math.max(0, Math.ceil(daysUntilDue))} day(s)`;
  } else if (daysUntilDue !== null && daysUntilDue <= 14) {
    urgency = "medium";
    urgencyReason = `due in ${Math.ceil(daysUntilDue)} days`;
  } else if (input.approvalRequired || input.requiredUserDecision) {
    urgency = "medium";
    urgencyReason = "a decision is waiting on you";
  } else {
    urgency = "low";
    urgencyReason = "no pressing deadline";
  }

  if (input.missingInformation.length > 0) {
    return {
      urgency,
      status: "waiting_for_info",
      reason: `${urgencyReason}; missing ${input.missingInformation.length} piece(s) of information`,
    };
  }
  if (input.approvalRequired || input.requiredUserDecision) {
    return {
      urgency,
      status: "needs_decision",
      reason: `${urgencyReason}; your approval is required before Triage acts`,
    };
  }
  if (daysUntilDue !== null && daysUntilDue <= 7) {
    return {
      urgency,
      status: "due_soon",
      reason: `${urgencyReason}; no approval needed, act before the deadline`,
    };
  }

  return {
    urgency,
    status: "in_progress",
    reason: urgencyReason,
  };
}
