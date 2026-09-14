import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const seedSnapshot = {
  metrics: {
    open: 4,
    dueSoon: 2,
    waiting: 1,
    saved: "2h 18m",
  },
  documents: [
    {
      id: "doc-insurance",
      sender: "Northstar Health",
      title: "Renewal notice · family plan",
      date: "Today, 09:14",
      type: "Insurance",
      status: "Needs decision",
      urgency: "high",
      due: "Sep 18",
      summary: "Your premium changes on October 1. Northstar asks you to confirm whether you want to keep the current plan.",
      extracted: [
        ["Decision needed", "Keep current plan or request alternatives"],
        ["Deadline", "September 18, 2026"],
        ["Change", "+€34.20 / month"],
      ],
      draft: "Hi Northstar team,\n\nThanks for the renewal notice. Before I confirm, could you share the available family-plan alternatives and their monthly premiums?\n\nBest,\nAlex",
    },
    {
      id: "doc-school",
      sender: "Riverside Primary",
      title: "Emergency contact form",
      date: "Yesterday, 16:42",
      type: "Family",
      status: "Waiting for you",
      urgency: "medium",
      due: "Sep 16",
      summary: "The school needs one missing emergency contact before the new term begins.",
      extracted: [
        ["Missing field", "Secondary emergency contact"],
        ["Deadline", "September 16, 2026"],
        ["Delivery", "Reply by email or school portal"],
      ],
      draft: "I’ll add a secondary emergency contact and return the form before the deadline.",
    },
    {
      id: "doc-appointment",
      sender: "Dr. Mira Patel",
      title: "Appointment confirmation",
      date: "Monday, 11:05",
      type: "Health admin",
      status: "Handled",
      urgency: "low",
      due: "Sep 22",
      summary: "Your annual appointment is confirmed. No reply is required, but a reminder is useful.",
      extracted: [
        ["Appointment", "September 22, 2026 · 10:30"],
        ["Location", "Westside Clinic, Room 4"],
        ["Action", "Add reminder"],
      ],
      draft: "Reminder added for September 21 at 18:00.",
    },
  ],
  activity: [
    { time: "09:16", label: "Extracted 3 obligations", detail: "Northstar Health renewal notice" },
    { time: "09:16", label: "Flagged a decision", detail: "Premium change needs your approval" },
    { time: "09:15", label: "Created a task", detail: "Confirm school emergency contact" },
    { time: "09:15", label: "Added a reminder", detail: "Dr. Patel · Sep 22 at 10:30" },
  ],
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  triage: router({
    snapshot: publicProcedure.query(() => seedSnapshot),
    approveAction: publicProcedure
      .input(z.object({ documentId: z.string() }))
      .mutation(({ input }) => ({
        success: true,
        documentId: input.documentId,
        message: "Draft approved and queued for sending.",
      })),
    requestProcessing: publicProcedure.mutation(() => ({
      accepted: true,
      message: "Inbox scan started.",
    })),
  }),
});

export type AppRouter = typeof appRouter;
