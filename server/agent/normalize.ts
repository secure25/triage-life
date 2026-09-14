import { z } from "zod";
import { parseAmount, type ExtractedObligation } from "./extraction";

/**
 * Normalization of LLM-extracted raw values into typed extraction fields.
 *
 * The Strands agent states dates and amounts as they appear in the document
 * ("September 18, 2026", "EUR 34.20"); these helpers convert them into Dates
 * and integer cents. Anything unparseable stays null — the agent never
 * invents a value, and neither do we.
 */

const MONTHS_BY_PREFIX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Raw obligation shape as the LLM states it (dates/amounts as text). */
export const RawObligationSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(2000),
  category: z.string().max(64),
  dueDate: z
    .string()
    .max(120)
    .nullable()
    .describe("Deadline exactly as stated in the document, or null if none is stated"),
  dueTime: z
    .string()
    .max(40)
    .nullable()
    .describe("Time of day if stated, e.g. '10:30'; otherwise null"),
  amount: z
    .string()
    .max(80)
    .nullable()
    .describe("Amount with currency exactly as stated, e.g. 'EUR 34.20'; null if none"),
  requiredUserDecision: z.string().max(500).nullable(),
  missingInformation: z.array(z.string().max(300)).max(10),
  confidence: z.number().min(0).max(1),
  sourceQuote: z
    .string()
    .min(2)
    .max(500)
    .describe("Short verbatim quote from the document supporting this obligation"),
  sourcePage: z.number().int().min(1).max(500),
  recommendedNextStep: z.string().max(600).nullable(),
  approvalRequired: z.boolean(),
  actionTarget: z
    .string()
    .max(200)
    .nullable()
    .describe("Where the action would go, e.g. 'office@school.example (email)'"),
  draft: z
    .object({
      channel: z.enum(["email", "form", "portal", "reminder", "none"]),
      subject: z.string().max(255),
      body: z.string().max(8000),
    })
    .nullable(),
  minutesSavedEstimate: z.number().int().min(0).max(240),
});

export type RawObligation = z.infer<typeof RawObligationSchema>;

/** Document-level structured output the Strands agent must return. */
export const StructuredExtractionSchema = z.object({
  documentType: z.string().min(3).max(64),
  senderLabel: z.string().min(2).max(120),
  agentExplanation: z.string().min(10).max(1200),
  obligations: z.array(RawObligationSchema).max(10),
});

export type StructuredExtraction = z.infer<typeof StructuredExtractionSchema>;

// ---------------------------------------------------------------------------
// Date normalization
// ---------------------------------------------------------------------------

function parseMonth(token: string): number | null {
  const prefix = token.slice(0, 3).toLowerCase();
  const month = MONTHS_BY_PREFIX[prefix];
  return month === undefined ? null : month;
}

function buildDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): Date | null {
  const date = new Date(year, month, day, hours, minutes, 0, 0);
  // Reject calendar-impossible values (e.g. February 31) that Date silently
  // rolls over — better null than a wrong deadline.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parse a date as stated in a document into a Date, or null.
 * Supported: "September 18, 2026", "Sep 18 2026", "18 September 2026",
 * "2026-09-18", with an optional time ("at 10:30", "10:30 AM").
 */
export function normalizeDueDate(
  dateText: string | null | undefined,
  timeText?: string | null,
  now: Date = new Date(),
): Date | null {
  if (!dateText) return null;
  const text = dateText.trim();
  if (text.length === 0) return null;

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  const monthFirst = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (monthFirst) {
    month = parseMonth(monthFirst[1]!);
    day = parseInt(monthFirst[2]!, 10);
    year = parseInt(monthFirst[3]!, 10);
  } else if (dayFirst) {
    day = parseInt(dayFirst[1]!, 10);
    month = parseMonth(dayFirst[2]!);
    year = parseInt(dayFirst[3]!, 10);
  } else if (iso) {
    year = parseInt(iso[1]!, 10);
    month = parseInt(iso[2]!, 10) - 1;
    day = parseInt(iso[3]!, 10);
  }

  if (year === null || month === null || day === null) return null;
  if (year < 2000 || year > 2100) return null;

  // Time: prefer an explicit time argument, else "at 10:30" inside the date text.
  const timeSource = (timeText && timeText.trim()) || text;
  const timeMatch = /(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i.exec(timeSource);
  let hours = 12;
  let minutes = 0;
  if (timeMatch) {
    hours = parseInt(timeMatch[1]!, 10);
    minutes = parseInt(timeMatch[2]!, 10);
    const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem?.startsWith("p") && hours < 12) hours += 12;
    if (meridiem?.startsWith("a") && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
  }

  const date = buildDate(year, month, day, hours, minutes);
  if (!date) return null;

  // Guard against dates the document cannot have meant (more than 10 years
  // out) — treat as unparseable rather than acting on a bad deadline.
  const tenYearsMs = 10 * 365.25 * 24 * 60 * 60 * 1000;
  if (Math.abs(date.getTime() - now.getTime()) > tenYearsMs) return null;

  return date;
}

// ---------------------------------------------------------------------------
// Obligation normalization
// ---------------------------------------------------------------------------

/** Convert a raw (LLM-stated) obligation into the typed extraction shape. */
export function normalizeRawObligation(raw: RawObligation): ExtractedObligation {
  const amount = raw.amount ? parseAmount(raw.amount) : null;
  return {
    title: raw.title.trim(),
    description: raw.description.trim(),
    category: raw.category.trim().toLowerCase().replace(/\s+/g, "_"),
    dueAt: normalizeDueDate(raw.dueDate, raw.dueTime),
    amountCents: amount?.cents ?? null,
    currency: amount?.currency ?? null,
    requiredUserDecision: raw.requiredUserDecision?.trim() || null,
    missingInformation: raw.missingInformation.map(item => item.trim()).filter(Boolean),
    confidence: Math.min(1, Math.max(0, raw.confidence)),
    sourceQuote: raw.sourceQuote.trim(),
    sourcePage: raw.sourcePage,
    recommendedNextStep: raw.recommendedNextStep?.trim() || null,
    approvalRequired: raw.approvalRequired,
    actionTarget: raw.actionTarget?.trim() || null,
    draft: raw.draft
      ? {
          channel: raw.draft.channel,
          subject: raw.draft.subject.trim(),
          body: raw.draft.body.trim(),
        }
      : null,
    minutesSavedEstimate: raw.minutesSavedEstimate,
  };
}

export function normalizeStructuredExtraction(
  structured: StructuredExtraction,
): {
  documentType: string;
  senderLabel: string;
  agentExplanation: string;
  obligations: ExtractedObligation[];
} {
  return {
    documentType: structured.documentType.trim().toLowerCase().replace(/\s+/g, "_"),
    senderLabel: structured.senderLabel.trim(),
    agentExplanation: structured.agentExplanation.trim(),
    obligations: structured.obligations.map(normalizeRawObligation),
  };
}
