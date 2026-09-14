import { describe, expect, it } from "vitest";
import type { ExtractedObligation } from "./extraction";
import { dedupeObligations } from "./strands";

function obligation(overrides: Partial<ExtractedObligation>): ExtractedObligation {
  return {
    title: "Task",
    description: "Description",
    category: "other",
    dueAt: new Date(2026, 8, 18, 12, 0),
    amountCents: null,
    currency: null,
    requiredUserDecision: null,
    missingInformation: [],
    confidence: 0.9,
    sourceQuote: "quote",
    sourcePage: 1,
    recommendedNextStep: null,
    approvalRequired: false,
    actionTarget: null,
    draft: null,
    minutesSavedEstimate: 10,
    ...overrides,
  };
}

describe("dedupeObligations (deterministic model-output cleanup)", () => {
  it("merges near-identical titles with the same due date", () => {
    const result = dedupeObligations([
      obligation({
        title: "Confirm or decline health plan renewal (NH-FAM-40218)",
        description: "Decide whether to accept the new premium.",
      }),
      obligation({
        title: "Confirm or Decline Health Plan Renewal – NH-FAM-40218",
        description: "Decide whether to accept the new premium and reply.",
        draft: { channel: "email", subject: "Re: renewal", body: "Hello" },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.draft).not.toBeNull();
  });

  it("keeps the record with a draft even when it comes first", () => {
    const result = dedupeObligations([
      obligation({
        title: "Submit Emergency Contact Form for Maya Rivera (Grade 3B)",
        draft: { channel: "email", subject: "Form", body: "Hello" },
      }),
      obligation({
        title: "Submit Emergency Contact Form – Maya Rivera (Grade 3B)",
        description: "A longer description of the same task.",
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.draft).not.toBeNull();
  });

  it("merges missingInformation from the dropped duplicate", () => {
    const result = dedupeObligations([
      obligation({
        title: "Renewal decision",
        missingInformation: ["Policy number"],
      }),
      obligation({
        title: "Decision on renewal",
        missingInformation: ["Secondary contact"],
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.missingInformation).toEqual(
      expect.arrayContaining(["Policy number", "Secondary contact"]),
    );
  });

  it("keeps genuinely different tasks on the same date", () => {
    const result = dedupeObligations([
      obligation({ title: "Pay the electricity bill" }),
      obligation({ title: "Schedule the dentist appointment" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("keeps same-title items when due dates differ", () => {
    const result = dedupeObligations([
      obligation({
        title: "Submit form",
        dueAt: new Date(2026, 8, 16, 12, 0),
      }),
      obligation({
        title: "Submit form",
        dueAt: new Date(2026, 8, 22, 12, 0),
      }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("dedupes a realistic 9-item batch down to distinct tasks", () => {
    const batch = [
      obligation({ title: "Submit Emergency Contact Form for Maya Rivera (Grade 3B)", dueAt: new Date(2026, 8, 16, 12, 0) }),
      obligation({ title: "Submit Emergency Contact Form – Maya Rivera (Grade 3B)", dueAt: new Date(2026, 8, 16, 12, 0), draft: { channel: "email", subject: "s", body: "b" } }),
      obligation({ title: "Confirm or decline health plan renewal (NH-FAM-40218)", dueAt: new Date(2026, 8, 18, 12, 0) }),
      obligation({ title: "Confirm or Decline Health Plan Renewal – NH-FAM-40218", dueAt: new Date(2026, 8, 18, 12, 0) }),
      obligation({ title: "Note premium increase – EUR 34.20/month (NH-FAM-40218)", dueAt: new Date(2026, 8, 18, 12, 0) }),
      obligation({ title: "Attend Annual Check-Up with Dr. Mira Patel", dueAt: new Date(2026, 8, 22, 12, 0) }),
      obligation({ title: "Attend Annual Check-up with Dr. Mira Patel", dueAt: new Date(2026, 8, 22, 12, 0) }),
      obligation({ title: "Set Evening Reminder – September 21, 2026 (Day Before Appointment)", dueAt: new Date(2026, 8, 21, 12, 0) }),
      obligation({ title: "Set Evening Reminder Before Appointment (Sept 21)", dueAt: new Date(2026, 8, 21, 12, 0) }),
    ];
    const result = dedupeObligations(batch);
    // Title-variant duplicates merge (9 → 5). Semantically-related items
    // (the premium note vs the renewal decision, the reminder vs the
    // appointment) are the prompt's job to merge — the deterministic
    // safety net only catches near-identical titles.
    expect(result).toHaveLength(5);
  });
});
