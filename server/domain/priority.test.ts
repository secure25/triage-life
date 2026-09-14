import { describe, expect, it } from "vitest";
import { calculatePriority } from "./priority";

const now = new Date("2026-09-14T12:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("calculatePriority", () => {
  it("marks items due within 3 days as high urgency", () => {
    const result = calculatePriority({
      dueAt: daysFromNow(2),
      amountCents: null,
      requiredUserDecision: null,
      approvalRequired: false,
      missingInformation: [],
      confidence: 0.95,
      now,
    });
    expect(result.urgency).toBe("high");
  });

  it("marks items due within 14 days as medium urgency", () => {
    const result = calculatePriority({
      dueAt: daysFromNow(10),
      amountCents: null,
      requiredUserDecision: null,
      approvalRequired: false,
      missingInformation: [],
      confidence: 0.9,
      now,
    });
    expect(result.urgency).toBe("medium");
  });

  it("marks items with no deadline and no decision as low urgency", () => {
    const result = calculatePriority({
      dueAt: null,
      amountCents: null,
      requiredUserDecision: null,
      approvalRequired: false,
      missingInformation: [],
      confidence: null,
      now,
    });
    expect(result.urgency).toBe("low");
    expect(result.status).toBe("in_progress");
  });

  it("waiting_for_info outranks other statuses when info is missing", () => {
    const result = calculatePriority({
      dueAt: daysFromNow(2),
      amountCents: null,
      requiredUserDecision: "Confirm the plan",
      approvalRequired: true,
      missingInformation: ["Secondary contact"],
      confidence: 0.9,
      now,
    });
    expect(result.status).toBe("waiting_for_info");
    expect(result.reason).toContain("missing 1 piece");
  });

  it("needs_decision when approval is required and nothing is missing", () => {
    const result = calculatePriority({
      dueAt: daysFromNow(4),
      amountCents: 3420,
      requiredUserDecision: "Keep plan or switch",
      approvalRequired: true,
      missingInformation: [],
      confidence: 0.95,
      now,
    });
    expect(result.status).toBe("needs_decision");
    expect(result.urgency).toBe("medium");
  });

  it("due_soon when actionable within a week without approval", () => {
    const result = calculatePriority({
      dueAt: daysFromNow(6),
      amountCents: null,
      requiredUserDecision: null,
      approvalRequired: false,
      missingInformation: [],
      confidence: 0.9,
      now,
    });
    expect(result.status).toBe("due_soon");
  });

  it("always includes a human-readable reason", () => {
    const result = calculatePriority({
      dueAt: daysFromNow(1),
      amountCents: null,
      requiredUserDecision: null,
      approvalRequired: false,
      missingInformation: [],
      confidence: null,
      now,
    });
    expect(result.reason).toMatch(/due in \d+ day/);
  });
});
