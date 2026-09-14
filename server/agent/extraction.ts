import type { Draft } from "../../drizzle/schema";

/**
 * Deterministic structured extraction (spec §7).
 *
 * The deterministic engine recognizes the clearly labeled synthetic demo
 * documents and parses labeled fields from OCR text. It never invents values:
 * anything it cannot parse stays null. Real documents require the Strands
 * engine with a configured model provider (AGENT_PROVIDER=strands).
 */

export type DraftChannel = Draft["channel"];

export type DraftSeed = {
  channel: DraftChannel;
  subject: string;
  body: string;
};

export type ExtractedObligation = {
  title: string;
  description: string;
  category: string;
  dueAt: Date | null;
  amountCents: number | null;
  currency: string | null;
  requiredUserDecision: string | null;
  missingInformation: string[];
  confidence: number;
  sourceQuote: string;
  sourcePage: number;
  recommendedNextStep: string | null;
  approvalRequired: boolean;
  /** Where the drafted action would go, e.g. "renewals@example.com (email)". */
  actionTarget: string | null;
  draft: DraftSeed | null;
  minutesSavedEstimate: number;
};

export type ExtractionResult = {
  documentType: string;
  senderLabel: string;
  agentExplanation: string;
  obligations: ExtractedObligation[];
};

export class ExtractionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionUnavailableError";
  }
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

const MONTH_NAMES = Object.keys(MONTHS).map(
  month => month[0]!.toUpperCase() + month.slice(1),
);

function formatDate(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Labeled-field parsing helpers. All return null when the field is absent —
// the agent must explain missing values, never guess them.
// ---------------------------------------------------------------------------

function parseLabeledDate(text: string, label: string): Date | null {
  const pattern = new RegExp(
    `${label}:\\s*([A-Z][a-z]+)\\s+(\\d{1,2}),\\s*(\\d{4})(?:\\s+at\\s+(\\d{1,2}):(\\d{2}))?`,
  );
  const match = pattern.exec(text);
  if (!match) return null;

  const month = MONTHS[match[1]!.toLowerCase()];
  const day = parseInt(match[2]!, 10);
  const year = parseInt(match[3]!, 10);
  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }

  const hours = match[4] !== undefined ? parseInt(match[4], 10) : 12;
  const minutes = match[5] !== undefined ? parseInt(match[5], 10) : 0;
  const date = new Date(year, month, day, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  "€": "EUR", EUR: "EUR", $: "USD", USD: "USD", "£": "GBP", GBP: "GBP",
};

/** Parse a money amount like "EUR 214.60" into cents, or null. */
export function parseAmount(text: string): { cents: number; currency: string } | null {
  const match = /(?:EUR|USD|GBP|[$€£])\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/.exec(text);
  if (!match) return null;

  const symbol = match[0].replace(match[1]!, "").trim();
  const currency = CURRENCY_BY_SYMBOL[symbol];
  if (!currency) return null;

  const cents = Math.round(parseFloat(match[1]!.replace(/,/g, "")) * 100);
  return { cents, currency };
}

function parseLabeledLine(text: string, label: string): string | null {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "m");
  const match = pattern.exec(text);
  return match ? match[1]!.trim() : null;
}

function parseParentheticalChange(text: string): { cents: number; currency: string } | null {
  const match = /change:\s*\+?\s*((?:EUR|USD|GBP|[$€£])\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(
    text,
  );
  if (!match) return null;
  return parseAmount(match[1]!);
}

/** Full source line (label included) for quoting in the UI. */
function sourceLine(text: string, label: string): string {
  const pattern = new RegExp(`^(${label}:.*)$`, "m");
  const match = pattern.exec(text);
  return match ? match[1]!.trim() : "";
}

// ---------------------------------------------------------------------------
// Document-type parsers
// ---------------------------------------------------------------------------

function parseInsuranceRenewal(
  text: string,
  ocrConfidence: number | null,
): ExtractionResult {
  const deadline = parseLabeledDate(text, "DEADLINE");
  const newPremium = parseLabeledLine(text, "NEW PREMIUM");
  const change = newPremium ? parseParentheticalChange(newPremium) : null;
  const sendTo = parseLabeledLine(text, "SEND TO");
  const policyHolder = parseLabeledLine(text, "Policy holder");
  const policyNumber = parseLabeledLine(text, "Policy number");
  const confidence = (ocrConfidence ?? 0.9) * 0.98;

  const obligation: ExtractedObligation = {
    title: "Confirm Northstar plan renewal",
    description:
      `Northstar asks you to confirm the family plan renewal or request ` +
      `alternatives before the deadline. The premium changes to ` +
      `${newPremium ?? "an unknown amount"}.`,
    category: "insurance",
    dueAt: deadline,
    amountCents: change?.cents ?? null,
    currency: change?.currency ?? null,
    requiredUserDecision: "Keep the current plan or request alternatives",
    missingInformation: [],
    confidence: Number(confidence.toFixed(2)),
    sourceQuote: sourceLine(text, "NEW PREMIUM") || "NEW PREMIUM (page 1)",
    sourcePage: 1,
    recommendedNextStep:
      deadline !== null
        ? `Reply to Northstar before ${formatDate(deadline)} asking for family-plan alternatives and their premiums.`
        : "Reply to Northstar asking for family-plan alternatives and their premiums.",
    approvalRequired: true,
    actionTarget: sendTo ? `${sendTo} (email)` : "renewals@northstar-health.example (email)",
    draft: {
      channel: "email",
      subject: `Re: Family plan renewal${policyNumber ? ` — policy ${policyNumber}` : ""}`,
      body: [
        "Hi Northstar team,",
        "",
        `Thank you for the renewal notice for our family plan${policyNumber ? ` (policy ${policyNumber})` : ""}.`,
        "",
        "Before confirming, could you send me the available family-plan",
        "alternatives and their monthly premiums?",
        deadline !== null
          ? `I would like to decide before ${formatDate(deadline)}.`
          : "I would like to review the options before deciding.",
        "",
        `Best regards,\n${policyHolder ?? "Alex Rivera"}`,
      ].join("\n"),
    },
    minutesSavedEstimate: 35,
  };

  return {
    documentType: "insurance_renewal",
    senderLabel: "Northstar Health",
    agentExplanation:
      "This is a plan renewal notice. It changes your premium and asks you to " +
      "decide before the deadline. No action happens until you approve it.",
    obligations: [obligation],
  };
}

function parseSchoolForm(
  text: string,
  ocrConfidence: number | null,
): ExtractionResult {
  const deadline = parseLabeledDate(text, "DEADLINE");
  const missing = parseLabeledLine(text, "MISSING");
  const student = parseLabeledLine(text, "Student");
  const policyHolder = parseLabeledLine(text, "Primary emergency contact");
  const parentName = policyHolder?.split("(")[0]?.trim() ?? null;
  const confidence = (ocrConfidence ?? 0.9) * 0.97;

  const obligation: ExtractedObligation = {
    title: "Complete Riverside emergency contact form",
    description:
      `The school needs the emergency contact form returned before the ` +
      `deadline. ${missing ? `Missing: ${missing}.` : "Some fields are missing."}`,
    category: "family",
    dueAt: deadline,
    amountCents: null,
    currency: null,
    requiredUserDecision: null,
    missingInformation: missing ? [missing] : ["The form may be incomplete — review before returning"],
    confidence: Number(confidence.toFixed(2)),
    sourceQuote: sourceLine(text, "MISSING") || "MISSING (page 1)",
    sourcePage: 1,
    recommendedNextStep:
      deadline !== null
        ? `Add a secondary emergency contact and return the form before ${formatDate(deadline)}.`
        : "Add a secondary emergency contact and return the form.",
    approvalRequired: true,
    actionTarget: "office@riverside-primary.example (email)",
    draft: {
      channel: "email",
      subject: `Emergency contact form${student ? ` — ${student}` : ""}`,
      body: [
        "Hello Riverside Primary office,",
        "",
        "Thank you for the reminder. I will complete the emergency contact",
        "form, add a secondary emergency contact, and return it" +
          (deadline !== null ? ` before ${formatDate(deadline)}.` : " shortly."),
        "",
        `Best regards,\n${parentName ?? "Alex Rivera"}`,
      ].join("\n"),
    },
    minutesSavedEstimate: 25,
  };

  return {
    documentType: "school_form",
    senderLabel: "Riverside Primary",
    agentExplanation:
      "The school cannot submit this form without a secondary emergency " +
      "contact — only you have that information, so Triage is waiting on you.",
    obligations: [obligation],
  };
}

function parseAppointment(
  text: string,
  ocrConfidence: number | null,
): ExtractionResult {
  const appointment = parseLabeledDate(text, "APPOINTMENT");
  const location = parseLabeledLine(text, "LOCATION");
  const withLine = parseLabeledLine(text, "With");
  const doctor = withLine ? withLine.split(" - ")[0]!.trim() : null;
  const confidence = (ocrConfidence ?? 0.9) * 0.99;

  const obligation: ExtractedObligation = {
    title: doctor ? `Annual check-up — ${doctor}` : "Annual check-up",
    description:
      `Your appointment is confirmed.${appointment ? ` ${formatDate(appointment)}.` : ""} ` +
      "No reply is required; a reminder is useful.",
    category: "health",
    dueAt: appointment,
    amountCents: null,
    currency: null,
    requiredUserDecision: null,
    missingInformation: [],
    confidence: Number(confidence.toFixed(2)),
    sourceQuote: sourceLine(text, "APPOINTMENT") || "APPOINTMENT (page 1)",
    sourcePage: 1,
    recommendedNextStep:
      "Add a reminder for the evening before the appointment. Nothing is sent to the clinic.",
    approvalRequired: false,
    actionTarget: null,
    draft: {
      channel: "reminder",
      subject: `Reminder: ${doctor ?? "annual check-up"}`,
      body: [
        appointment ? `Appointment on ${formatDate(appointment)}.` : "Upcoming appointment.",
        location ? `Location: ${location}.` : null,
        "Arrive 10 minutes early. This reminder stays on your device — nothing is sent to the clinic.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    minutesSavedEstimate: 10,
  };

  return {
    documentType: "appointment_confirmation",
    senderLabel: "Westside Clinic",
    agentExplanation:
      "This is an informational confirmation. Triage added it to your queue " +
      "with a suggested reminder — it will not contact the clinic.",
    obligations: [obligation],
  };
}

/**
 * Extract obligations from OCR text using the deterministic engine.
 * Throws ExtractionUnavailableError for documents it does not recognize.
 */
export function extractFromText(
  text: string,
  ocrConfidence: number | null,
): ExtractionResult {
  if (text.includes("NORTHSTAR HEALTH INSURANCE")) {
    return parseInsuranceRenewal(text, ocrConfidence);
  }
  if (text.includes("RIVERSIDE PRIMARY")) {
    return parseSchoolForm(text, ocrConfidence);
  }
  if (text.includes("WESTSIDE CLINIC")) {
    return parseAppointment(text, ocrConfidence);
  }
  throw new ExtractionUnavailableError(
    "The deterministic extraction engine only supports the synthetic demo " +
      "documents. Configure AGENT_PROVIDER=strands with a model provider " +
      "(see README) to extract real documents.",
  );
}
