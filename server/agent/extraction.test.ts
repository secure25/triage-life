import { describe, expect, it } from "vitest";
import { buildSyntheticDocument } from "../demo/documents";
import {
  extractFromText,
  ExtractionUnavailableError,
  parseAmount,
} from "./extraction";

function ocrTextFor(id: string): string {
  const built = buildSyntheticDocument(id, new Date("2026-09-14T09:00:00Z"));
  if (!built) throw new Error(`unknown synthetic doc ${id}`);
  return built.ocrPages.map(page => page.text).join("\n\n");
}

describe("deterministic extraction", () => {
  it("extracts the insurance renewal: deadline, change amount, decision, draft", () => {
    const text = ocrTextFor("insurance-renewal");
    const result = extractFromText(text, 0.97);

    expect(result.documentType).toBe("insurance_renewal");
    expect(result.senderLabel).toBe("Northstar Health");
    expect(result.obligations).toHaveLength(1);

    const obligation = result.obligations[0]!;
    expect(obligation.category).toBe("insurance");
    expect(obligation.dueAt).not.toBeNull();
    // Deadline is 4 days after the generation date.
    expect(obligation.dueAt!.getTime()).toBeGreaterThan(
      new Date("2026-09-17T00:00:00Z").getTime(),
    );
    expect(obligation.amountCents).toBe(3420);
    expect(obligation.currency).toBe("EUR");
    expect(obligation.requiredUserDecision).toContain("plan");
    expect(obligation.missingInformation).toEqual([]);
    expect(obligation.approvalRequired).toBe(true);
    expect(obligation.sourceQuote).toContain("NEW PREMIUM");
    expect(obligation.sourcePage).toBe(1);
    expect(obligation.confidence).toBeGreaterThan(0.9);
    expect(obligation.draft?.channel).toBe("email");
    expect(obligation.draft?.subject).toContain("Family plan renewal");
    expect(obligation.draft?.body).toContain("alternatives");
    // Never invents: the draft only uses parsed values.
    expect(obligation.draft?.body).not.toContain("unknown");
  });

  it("extracts the school form with its missing information", () => {
    const text = ocrTextFor("school-form");
    const result = extractFromText(text, 0.96);

    expect(result.documentType).toBe("school_form");
    const obligation = result.obligations[0]!;
    expect(obligation.missingInformation).toEqual([
      "Secondary emergency contact (name and phone number)",
    ]);
    expect(obligation.approvalRequired).toBe(true);
    expect(obligation.amountCents).toBeNull();
    expect(obligation.draft?.body).toContain("secondary emergency contact");
  });

  it("extracts the appointment confirmation as informational", () => {
    const text = ocrTextFor("appointment-confirmation");
    const result = extractFromText(text, 0.98);

    expect(result.documentType).toBe("appointment_confirmation");
    const obligation = result.obligations[0]!;
    expect(obligation.title).toBe("Annual check-up — Dr. Mira Patel");
    expect(obligation.approvalRequired).toBe(false);
    expect(obligation.requiredUserDecision).toBeNull();
    expect(obligation.missingInformation).toEqual([]);
    expect(obligation.draft?.channel).toBe("reminder");
    // No external action suggested for an informational document.
    expect(obligation.recommendedNextStep).toContain("Nothing is sent");
  });

  it("throws for unrecognized documents instead of guessing", () => {
    expect(() =>
      extractFromText("Random letter about your garden shed.", 0.9),
    ).toThrow(ExtractionUnavailableError);
  });

  it("keeps missing values null when the deadline line is absent", () => {
    const text = ocrTextFor("insurance-renewal").replace(
      /^DEADLINE:.*$/m,
      "NO DEADLINE STATED",
    );
    const result = extractFromText(text, 0.9);
    const obligation = result.obligations[0]!;
    expect(obligation.dueAt).toBeNull();
    expect(obligation.recommendedNextStep).not.toContain("before");
  });

  it("scales confidence with OCR confidence", () => {
    const text = ocrTextFor("school-form");
    const confident = extractFromText(text, 0.98);
    const shaky = extractFromText(text, 0.6);
    expect(confident.obligations[0]!.confidence).toBeGreaterThan(
      shaky.obligations[0]!.confidence,
    );
  });
});

describe("parseAmount", () => {
  it("handles symbol and code forms", () => {
    expect(parseAmount("EUR 214.60")).toEqual({ cents: 21460, currency: "EUR" });
    expect(parseAmount("€34.20")).toEqual({ cents: 3420, currency: "EUR" });
    expect(parseAmount("$1,200.00")).toEqual({ cents: 120000, currency: "USD" });
    expect(parseAmount("£9.99")).toEqual({ cents: 999, currency: "GBP" });
  });

  it("returns null when no amount is present", () => {
    expect(parseAmount("no money here")).toBeNull();
  });
});
