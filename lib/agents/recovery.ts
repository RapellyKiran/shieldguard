import { structured } from "../anthropic";
import type { PaymentRail, RecoveryPlan } from "../types";

export const DISCLAIMER =
  "This is general information about consumer protection procedures, not legal or financial advice. " +
  "Deadlines and outcomes vary by institution and by the specifics of your situation. " +
  "For advice about your circumstances, contact your bank directly or consult a licensed attorney.";

/**
 * Time windows, kept in code rather than left to the model.
 *
 * The 72-hour wire figure is the single highest-value number in this feature:
 * IC3's Recovery Asset Team can initiate a Financial Fraud Kill Chain on a
 * domestic wire that is reported fast enough, and the success rate falls off a
 * cliff after that. It leads the plan for a reason.
 */
export const RAIL_WINDOWS: Record<PaymentRail, { hours: number | null; note: string }> = {
  wire: {
    hours: 72,
    note: "Wire recall is realistic only if reported almost immediately. IC3's Recovery Asset Team can attempt a Financial Fraud Kill Chain on domestic wires reported within roughly 72 hours.",
  },
  ach: {
    hours: 60 * 24,
    note: "Reg E gives 60 days from the statement date for unauthorized electronic fund transfers (12 C.F.R. § 1005.6).",
  },
  debit_card: {
    hours: 60 * 24,
    note: "Reg E liability tiers escalate sharply — 2 business days from learning of the loss caps liability at $50; after that it rises to $500, and past 60 days from the statement it can be unlimited.",
  },
  credit_card: {
    hours: 60 * 24,
    note: "Fair Credit Billing Act dispute window is 60 days from the statement; network chargeback rules often allow longer.",
  },
  p2p: {
    hours: 48,
    note: "Zelle, Venmo, and Cash App treat authorized-but-induced transfers as final. Report immediately anyway — some networks have added scam-reimbursement programs.",
  },
  gift_card: {
    hours: 24,
    note: "Call the card issuer's fraud line immediately. Funds are occasionally recoverable if the card has not been drained.",
  },
  crypto: {
    hours: null,
    note: "On-chain transfers are irreversible. The realistic path is reporting to the exchange and to IC3 so the receiving address can be flagged and, in some cases, frozen at an off-ramp.",
  },
  check: {
    hours: 24,
    note: "A stop-payment order is possible while the check is uncleared. Contact the bank the same day.",
  },
};

const SYSTEM = `You produce a concrete, time-ordered action plan for someone who has just lost money to a scam.

## Frame

This is information about procedures and deadlines. It is not legal or financial advice, and you never phrase it as advice. Say "you can", "the deadline is", "banks generally" — not "you should sue" or "you will recover".

## Priorities

Order steps by how fast the window closes, not by how important they feel. A step that expires in 72 hours comes before one that expires in 60 days, even if the second is more likely to succeed. Put the single most time-critical action first and make its deadline unmissable.

Be specific and actionable. "Contact your bank" is useless. "Call the number on the back of your card, ask for the fraud department, and say you are reporting an unauthorized wire transfer and requesting a recall" is usable by someone who is panicking.

Assume the reader is distressed and may be embarrassed. Be matter-of-fact. Do not moralize, do not tell them what they should have done, and do not editorialize about the scam.

## Content

Include, where they apply: the bank or card issuer, the receiving institution, FTC ReportFraud (reportfraud.ftc.gov), FBI IC3 (ic3.gov), the state attorney general, and the credit bureaus if identity data was exposed.

Cite the rule behind each deadline in the "basis" field where one exists.

Do not promise recovery. Most scam losses are not recovered, and a plan that implies otherwise sets someone up for a second disappointment.

Mark urgency "critical" only for steps whose window closes within 72 hours.`;

const SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "integer" },
          title: { type: "string" },
          detail: { type: "string", description: "What to do and what to say. Two to four sentences." },
          hoursRemaining: {
            type: ["integer", "null"],
            description: "Hours left before this window closes; null if not time-boxed.",
          },
          basis: { type: "string", description: "The rule or program behind the deadline." },
          contact: { type: "string" },
          urgency: { type: "string", enum: ["critical", "high", "normal"] },
        },
        required: ["order", "title", "detail", "hoursRemaining", "urgency"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

export async function buildRecoveryPlan(input: {
  rail: PaymentRail;
  amountLost: number;
  occurredAt: string;
  scamContext?: string;
}): Promise<RecoveryPlan> {
  const window = RAIL_WINDOWS[input.rail];
  const elapsedHours = Math.max(
    0,
    Math.round((Date.now() - new Date(input.occurredAt).getTime()) / 3_600_000),
  );
  const remaining = window.hours === null ? null : Math.max(0, window.hours - elapsedHours);

  const prompt = `## Loss

Payment rail: ${input.rail}
Amount: $${input.amountLost.toLocaleString("en-US")}
Occurred: ${input.occurredAt} (about ${elapsedHours} hour(s) ago)
${input.scamContext ? `Context: ${input.scamContext}` : ""}

## Rail-specific window

${window.note}
${
  remaining === null
    ? "This rail has no meaningful reversal window."
    : remaining > 0
      ? `Approximately ${remaining} hour(s) remain in the primary recovery window.`
      : "The primary recovery window has already closed. Focus the plan on reporting, documentation, and any secondary avenues."
}

Produce the action plan.`;

  const raw = await structured<{ steps: RecoveryPlan["steps"] }>({
    agent: "recovery",
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
  });

  return {
    rail: input.rail,
    amountLost: input.amountLost,
    occurredAt: input.occurredAt,
    steps: raw.steps.sort((a, b) => a.order - b.order),
    disclaimer: DISCLAIMER,
  };
}
