import { structured } from "../anthropic";
import { RULE_CORPUS } from "../rules";
import { reconcileAnalysis } from "../damages";
import type { EvidenceRecord, ShieldedIdentity, ViolationAnalysis } from "../types";

const SYSTEM = `You are a consumer-protection analyst. You map captured evidence of an unwanted call or message onto specific statutory provisions.

You work strictly from the rule corpus provided below. Do not cite statutes that are not in it, and do not invent subsection numbers.

## Standards you hold yourself to

**Quote or drop it.** Every element you mark as met needs a verbatim quote from the transcript. If the transcript does not support an element, the element is not met and the violation does not go in the list.

**Be narrow.** An overreaching analysis is worse than a conservative one. A demand letter citing four provisions the evidence supports is far stronger than one citing nine it does not — the weak claims discredit the strong ones.

**Get the private-right-of-action flag right.** This determines whether a finding goes into a consumer's demand letter or gets routed to the FTC and state AG instead. TCPA § 227(b) and § 227(c) have private rights of action. The FTC Telemarketing Sales Rule and CAN-SPAM do not. Setting this wrong is the most damaging error you can make.

**Do not do arithmetic.** Report per-violation figures and the contact count. The application multiplies them. Any total you produce will be discarded.

**§ 227(c) is a ceiling, not a floor.** Its damages are discretionary — up to $500 — unlike § 227(b)'s mandatory $500 minimum. Set damagesLow to 0 for § 227(c) findings.

## Willfulness

Treble damages under § 227(b)(3) require willful or knowing conduct. If the evidence supports it — spoofed caller ID, impersonating a real agency, continuing after a stop request, calling a number known to be on the DNC registry — say so in willfulnessBasis and set damagesHigh to the trebled figure. If it does not, leave damagesHigh equal to damagesLow and say why in the notes.`;

const SCHEMA = {
  type: "object",
  properties: {
    violations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          provision: { type: "string" },
          citation: { type: "string" },
          elementsMet: { type: "array", items: { type: "string" } },
          evidenceQuotes: {
            type: "array",
            items: { type: "string" },
            description: "Verbatim transcript quotes. One per element where possible.",
          },
          damagesLow: { type: "integer" },
          damagesHigh: { type: "integer" },
          privateRightOfAction: { type: "boolean" },
          enforcementChannel: { type: "string", enum: ["FTC", "State AG", "FCC"] },
          willfulnessBasis: { type: "string" },
        },
        required: [
          "provision", "citation", "elementsMet", "evidenceQuotes",
          "damagesLow", "damagesHigh", "privateRightOfAction",
        ],
        additionalProperties: false,
      },
    },
    contactCount: {
      type: "integer",
      description: "Number of separate contacts in this pattern. Each is a separate violation.",
    },
    notes: {
      type: "string",
      description: "Caveats, weak points, and anything a reviewing attorney should know.",
    },
  },
  required: ["violations", "contactCount", "notes"],
  additionalProperties: false,
};

export async function analyzeViolations(
  evidence: EvidenceRecord,
  identity: ShieldedIdentity,
  contactCount: number,
): Promise<ViolationAnalysis> {
  const rendered = evidence.transcript
    .map((t) => `${t.speaker === "agent" ? "SCREENING AGENT" : "CALLER"}: ${t.text}`)
    .join("\n");

  // Note what we pass: the SHIELDED identity. This agent never sees the real
  // name, email, or full number — it does not need them to do its job.
  const prompt = `# Rule corpus

${RULE_CORPUS}

---

# Evidence record ${evidence.id}

Channel: ${evidence.channel}
Originating identifier: ${evidence.fromIdentifier}
Captured: ${evidence.capturedAt}
Evidence hash: ${evidence.hash}

## Recipient (shielded)
State of residence: ${identity.stateOfResidence}
Phone (last 4): ${identity.phoneLast4}
On National Do Not Call Registry: ${identity.onDncRegistry ? "YES" : "no"}${identity.dncRegistrationDate ? ` (registered ${identity.dncRegistrationDate})` : ""}

## Verdict
${evidence.verdict.label} (confidence ${evidence.verdict.confidence})
Type: ${evidence.verdict.scamType ?? "unclassified"}
Sought payment: ${evidence.verdict.soughtPayment}
Sought credentials: ${evidence.verdict.soughtCredentials}

Caller's claims about themselves:
${JSON.stringify(evidence.verdict.entityClaims, null, 2)}

Red flags:
${evidence.verdict.redFlags.map((f) => `- [${f.code}] ${f.label} — "${f.quote}"`).join("\n") || "(none)"}

## Transcript
"""
${rendered}
"""

## Pattern
This originating identifier has contacted this recipient ${contactCount} time(s).

Produce the violation analysis.`;

  const raw = await structured<{
    violations: ViolationAnalysis["violations"];
    contactCount: number;
    notes: string;
  }>({ agent: "violations", system: SYSTEM, prompt, schema: SCHEMA });

  // Totals are computed here, in code — never trusted from the model.
  return reconcileAnalysis({
    violations: raw.violations,
    // Trust our own count over the model's reading of it.
    contactCount,
    notes: raw.notes,
  });
}
