import { randomUUID } from "node:crypto";
import { prose } from "../anthropic";
import { computeDamages, formatUsd } from "../damages";
import { disclosureBreakdown, scanForLeaks } from "../shield";
import type {
  DemandLetter,
  DigitalId,
  EvidenceRecord,
  ShieldedIdentity,
  ViolationAnalysis,
} from "../types";

export const DEFAULT_CURE_WINDOW_DAYS = 30;

const SYSTEM = `You draft demand letters that a consumer sends in their own name over a TCPA violation.

## Who is speaking

The consumer is the author. Write in the first person singular — "I received", "I am demanding". You are a drafting tool; the consumer reviews, approves, and sends this themselves. Never write as a law firm, never write as a company acting on the consumer's behalf, and never state or imply that the sender is represented by counsel.

## The identity constraint — this is the hard requirement

The sender is identified ONLY by a claim ID and a proxy reply address. You have not been given their name, email, street address, or full phone number, and you must not invent, infer, or request placeholders for them.

Concretely:
- Sign off with the claim ID. Never "Sincerely, [Name]", never "[Your Name]", never a bracketed placeholder of any kind.
- Refer to the sender as "the undersigned" or "I".
- The only identifying details permitted are: the claim ID, the proxy reply address, the last four digits of the phone number, the state of residence, and Do Not Call registration status.
- Include a short paragraph explaining that the sender's full identity is held in escrow and will be released upon execution of a mutual non-disclosure and settlement agreement. This is a real mechanism, not a dodge — say it plainly and without apology.

A draft containing a name placeholder is a failed draft.

## Tone

Firm, specific, unemotional. This should read like it was written by someone who knows exactly what statute was violated and is not interested in arguing about it. No threats beyond the remedies the statute actually provides. No insults. No exclamation marks.

Short paragraphs. A recipient's compliance officer should be able to read it in ninety seconds and understand precisely what happened, what is demanded, and by when.

## Structure

1. Subject line stating the claim ID and the statute.
2. What happened — dates, the originating number, what the caller said. Quote the transcript where it is damaging.
3. The legal basis — cite the provisions and state the per-violation damages the statute provides.
4. The demand — the amount, and the deadline.
5. How to respond — the proxy address, and the escrow paragraph.
6. A preservation notice: instruct the recipient to preserve all call records, dialer logs, consent records, and lead-source documentation relating to the identified number.
7. Sign-off with the claim ID.

## Accuracy

Cite only the provisions supplied to you. Use the damages total exactly as given — do not recompute it, round it, or adjust it. Do not claim the sender has retained counsel, filed anything, or contacted any regulator unless told so.

Output only the letter body. No preamble, no commentary, no markdown code fences.`;

export async function generateDemandLetter(opts: {
  evidence: EvidenceRecord;
  analysis: ViolationAnalysis;
  shielded: ShieldedIdentity;
  /**
   * The real identity — used ONLY for the post-generation leak scan. It is
   * never placed in the prompt. Keeping it as a separate parameter from
   * `shielded` is deliberate: it makes the boundary visible at every call site.
   */
  realIdentity: DigitalId;
  cureWindowDays?: number;
}): Promise<DemandLetter> {
  const { evidence, analysis, shielded, realIdentity } = opts;
  const cureWindowDays = opts.cureWindowDays ?? DEFAULT_CURE_WINDOW_DAYS;

  const actionable = analysis.violations.filter((v) => v.privateRightOfAction);
  if (actionable.length === 0) {
    throw new Error(
      "No violations with a private right of action — there is nothing for a consumer to demand. " +
        "Route this evidence to the regulator-referral channel instead.",
    );
  }

  const damages = computeDamages(actionable, analysis.contactCount);
  const recipientName = evidence.verdict.entityClaims.claimedCompany ?? "The Operator of the Identified Number";
  const recipientContact =
    evidence.verdict.entityClaims.callbackNumber ?? evidence.fromIdentifier;

  const transcript = evidence.transcript
    .map((t) => `${t.speaker === "agent" ? "SCREENING AGENT" : "CALLER"}: ${t.text}`)
    .join("\n");

  const prompt = `## Sender (shielded — this is everything you know about them)

Claim ID: ${shielded.claimId}
Reply address: ${shielded.proxyReplyAddress}
Phone, last four digits: ${shielded.phoneLast4}
State of residence: ${shielded.stateOfResidence}
On National Do Not Call Registry: ${shielded.onDncRegistry ? "YES" : "no"}${shielded.dncRegistrationDate ? `, registered ${shielded.dncRegistrationDate}` : ""}

## Recipient

${recipientName}
Contact of record: ${recipientContact}
Originating identifier: ${evidence.fromIdentifier}

## Incident

Date: ${evidence.capturedAt}
Channel: ${evidence.channel}
Number of contacts in this pattern: ${analysis.contactCount}
Evidence record: ${evidence.id}
Evidence hash (SHA-256): ${evidence.hash}

Red flags documented:
${evidence.verdict.redFlags.map((f) => `- ${f.label} — caller said: "${f.quote}"`).join("\n")}

## Transcript
"""
${transcript}
"""

## Violations to cite

${actionable
  .map(
    (v) => `### ${v.provision}
Citation: ${v.citation}
Elements established: ${v.elementsMet.join("; ")}
Supporting quotes: ${v.evidenceQuotes.map((q) => `"${q}"`).join(", ")}
Statutory damages: ${formatUsd(v.damagesLow)}–${formatUsd(v.damagesHigh)} per violation${v.willfulnessBasis ? `\nBasis for treble damages: ${v.willfulnessBasis}` : ""}`,
  )
  .join("\n\n")}

## Demand amount — use this figure exactly

${formatUsd(damages.high)}

Arithmetic (for the letter's own explanation of the figure):
${damages.breakdown
  .map(
    (b) =>
      `- ${b.citation}: ${b.contactCount} violation(s) × ${formatUsd(b.perViolationHigh)} = ${formatUsd(b.subtotalHigh)}`,
  )
  .join("\n")}

## Response deadline

${cureWindowDays} days from the date of this letter.

Draft the letter.`;

  const body = await prose({ agent: "letter", system: SYSTEM, prompt });

  // Verification-time defense. The agent was never given the real PII, so this
  // should never fire — which is exactly why it must run. A silent regression
  // in how the prompt is built would otherwise ship a leak.
  scanForLeaks(body, realIdentity);

  const breakdown = disclosureBreakdown(realIdentity);

  return {
    id: randomUUID(),
    claimId: shielded.claimId,
    recipientName,
    recipientContact,
    subject: `Notice of TCPA Violation and Demand for Settlement — Claim ${shielded.claimId}`,
    body,
    demandAmount: damages.high,
    cureWindowDays,
    citations: actionable.map((v) => v.citation),
    generatedAt: new Date().toISOString(),
    withheldFields: breakdown.withheld,
    disclosedFields: breakdown.disclosed,
  };
}
