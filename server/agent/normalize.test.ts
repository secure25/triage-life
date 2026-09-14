import { describe, expect, it } from "vitest";
import {
  normalizeDueDate,
  normalizeRawObligation,
  RawObligationSchema,
} from "./normalize";

const NOW = new Date("2026-09-14T12:00:00");

describe("normalizeDueDate (deadline normalization)", () => {
  it("parses 'Month D, YYYY'", () => {
    expect(normalizeDueDate("September 18, 2026", null, NOW)).toEqual(
      new Date(2026, 8, 18, 12, 0),
    );
  });

  it("parses abbreviated and unpunctuated month forms", () => {
    expect(normalizeDueDate("Sep 18, 2026", null, NOW)).toEqual(
      new Date(2026, 8, 18, 12, 0),
    );
    expect(normalizeDueDate("October 1 2026", null, NOW)).toEqual(
      new Date(2026, 9, 1, 12, 0),
    );
  });

  it("parses day-first form", () => {
    expect(normalizeDueDate("18 September 2026", null, NOW)).toEqual(
      new Date(2026, 8, 18, 12, 0),
    );
  });

  it("parses ISO dates", () => {
    expect(normalizeDueDate("2026-09-18", null, NOW)).toEqual(
      new Date(2026, 8, 18, 12, 0),
    );
  });

  it("parses an explicit time with meridiem", () => {
    expect(normalizeDueDate("September 22, 2026", "10:30 AM", NOW)).toEqual(
      new Date(2026, 8, 22, 10, 30),
    );
    expect(normalizeDueDate("September 22, 2026 at 2:15 PM", null, NOW)).toEqual(
      new Date(2026, 8, 22, 14, 15),
    );
  });

  it("defaults to noon when no time is stated", () => {
    const date = normalizeDueDate("September 18, 2026", null, NOW);
    expect(date!.getHours()).toBe(12);
  });

  it("returns null for unparseable text — never invents a date", () => {
    expect(normalizeDueDate("before the new term", null, NOW)).toBeNull();
    expect(normalizeDueDate("soon", null, NOW)).toBeNull();
    expect(normalizeDueDate("", null, NOW)).toBeNull();
    expect(normalizeDueDate(null, null, NOW)).toBeNull();
  });

  it("rejects calendar-impossible dates rather than rolling over", () => {
    expect(normalizeDueDate("February 31, 2027", null, NOW)).toBeNull();
    expect(normalizeDueDate("September 99, 2026", null, NOW)).toBeNull();
  });

  it("rejects dates implausibly far from now", () => {
    expect(normalizeDueDate("January 1, 1990", null, NOW)).toBeNull();
    expect(normalizeDueDate("January 1, 2060", null, NOW)).toBeNull();
  });
});

describe("normalizeRawObligation", () => {
  const raw = {
    title: "Confirm renewal",
    description: "The insurer asks you to confirm.",
    category: "Insurance",
    dueDate: "September 18, 2026",
    dueTime: null,
    amount: "EUR 34.20",
    requiredUserDecision: "Keep plan or switch",
    missingInformation: [],
    confidence: 0.95,
    sourceQuote: "NEW PREMIUM: EUR 214.60 per month",
    sourcePage: 1,
    recommendedNextStep: "Reply before the deadline.",
    approvalRequired: true,
    actionTarget: "renewals@northstar-health.example (email)",
    draft: {
      channel: "email" as const,
      subject: "Re: renewal",
      body: "Hello,",
    },
    minutesSavedEstimate: 35,
  };

  it("normalizes dates, amounts, and category", () => {
    const normalized = normalizeRawObligation(raw);
    expect(normalized.dueAt).toEqual(new Date(2026, 8, 18, 12, 0));
    expect(normalized.amountCents).toBe(3420);
    expect(normalized.currency).toBe("EUR");
    expect(normalized.category).toBe("insurance");
    expect(normalized.title).toBe("Confirm renewal");
  });

  it("keeps missing values null — never guesses", () => {
    const normalized = normalizeRawObligation({
      ...raw,
      dueDate: "not clearly stated",
      amount: null,
      requiredUserDecision: null,
    });
    expect(normalized.dueAt).toBeNull();
    expect(normalized.amountCents).toBeNull();
    expect(normalized.currency).toBeNull();
    expect(normalized.requiredUserDecision).toBeNull();
  });

  it("clamps confidence into 0..1", () => {
    expect(normalizeRawObligation({ ...raw, confidence: 1.7 }).confidence).toBe(1);
    expect(normalizeRawObligation({ ...raw, confidence: -0.5 }).confidence).toBe(0);
  });

  it("passes drafts through unchanged", () => {
    const normalized = normalizeRawObligation(raw);
    expect(normalized.draft).toEqual(raw.draft);
    expect(normalizeRawObligation({ ...raw, draft: null }).draft).toBeNull();
  });
});

describe("RawObligationSchema validation", () => {
  it("rejects obligations without a source quote (anti-hallucination)", () => {
    const result = RawObligationSchema.safeParse({
      ...{
        title: "x".repeat(10),
        description: "d",
        category: "c",
        dueDate: null,
        dueTime: null,
        amount: null,
        requiredUserDecision: null,
        missingInformation: [],
        confidence: 0.9,
        sourceQuote: "",
        sourcePage: 1,
        recommendedNextStep: null,
        approvalRequired: false,
        actionTarget: null,
        draft: null,
        minutesSavedEstimate: 10,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range confidence and pages", () => {
    const base = {
      title: "Valid title",
      description: "d",
      category: "c",
      dueDate: null,
      dueTime: null,
      amount: null,
      requiredUserDecision: null,
      missingInformation: [],
      sourceQuote: "a quote",
      recommendedNextStep: null,
      approvalRequired: false,
      actionTarget: null,
      draft: null,
    };
    expect(
      RawObligationSchema.safeParse({ ...base, confidence: 2, sourcePage: 1, minutesSavedEstimate: 5 })
        .success,
    ).toBe(false);
    expect(
      RawObligationSchema.safeParse({ ...base, confidence: 0.5, sourcePage: 0, minutesSavedEstimate: 5 })
        .success,
    ).toBe(false);
  });
});
