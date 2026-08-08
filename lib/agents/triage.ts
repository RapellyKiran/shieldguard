import { structured } from "../anthropic";
import type { Campaign, InboundEvent, TriageResult } from "../types";

const SYSTEM = `You are the triage stage of a call and message screening system. You run in the seconds while a phone is ringing, so you are fast and decisive.

You classify an inbound contact into one of three actions:

- "block"  — near-certain scam or spam. Do not let it through and do not spend a screening conversation on it. Reserve this for contacts matching a known campaign, or with unmistakable markers (spoofed government agency + payment demand, a known scam callback number).
- "screen" — unknown or ambiguous. Hand off to the conversational screening agent, which will talk to the caller and decide. This is the DEFAULT for anything you are not sure about.
- "allow"  — recognizably legitimate and expected. A known contact, a verified business the user has a relationship with, a transactional message matching a recent user action.

Bias toward "screen". A wrongly blocked legitimate call is a much worse failure than a screened scammer — the user misses a call from their doctor, their kid's school, a job offer. Only use "allow" when the contact is affirmatively recognizable, not merely when nothing looks wrong.

**A caller ID display name is not evidence.** It is the single cheapest thing on a call to forge, so "AMAZON SECURITY" or "IRS" in the display name is a reason to screen, never a reason to block. Blocking on it also throws away the conversation — and the conversation is the evidence this system exists to collect. On a ringing call with no content yet, the caller ID is usually all you have, so unless the contact matches a campaign in the supplied list, the answer is "screen".

Report confidence honestly. A 0.55 that lands on "screen" is a more useful signal than a confidently wrong 0.9.`;

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["allow", "block", "screen"] },
    confidence: { type: "number" },
    reason: {
      type: "string",
      description: "One sentence, written for the user to read on their lock screen.",
    },
    priorMatches: {
      type: "array",
      items: { type: "string" },
      description: "IDs of known campaigns this contact matches, from the supplied list.",
    },
  },
  required: ["action", "confidence", "reason", "priorMatches"],
  additionalProperties: false,
};

export async function triage(
  event: InboundEvent,
  knownCampaigns: Campaign[],
): Promise<TriageResult> {
  // Only send the campaign facts triage can actually match on — sending whole
  // fingerprint arrays would balloon the prompt for no decision value.
  const campaignDigest = knownCampaigns.map((c) => ({
    id: c.id,
    claimedEntity: c.claimedEntity,
    scamType: c.scamType,
    callbackNumbers: c.callbackNumbers,
    originatingIdentifiers: c.originatingIdentifiers,
    tier: c.tier,
    reporterCount: c.reporterCount,
  }));

  const prompt = `## Inbound contact

Channel: ${event.channel}
From: ${event.fromIdentifier}${event.fromDisplayName ? ` ("${event.fromDisplayName}")` : ""}
Received: ${event.receivedAt}
${event.subject ? `Subject: ${event.subject}\n` : ""}${event.body ? `Content:\n"""\n${event.body}\n"""` : "(No content yet — this is a ringing call.)"}

## Known scam campaigns in the shared database

${campaignDigest.length > 0 ? JSON.stringify(campaignDigest, null, 2) : "(none yet)"}

Classify this contact.`;

  const result = await structured<TriageResult>({
    agent: "triage",
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
  });

  // Second layer, same reasoning as the PII shield: the prompt above already
  // forbids blocking on a caller ID alone, and it was observed doing it anyway
  // — "Amazon does not make unsolicited security calls", priorMatches empty.
  // A block on no corroboration costs the user the call AND costs the shared
  // database the evidence, so the rule is enforced here where a model cannot
  // talk its way past it: no verified prior match, no block.
  const knownIds = new Set(knownCampaigns.map((c) => c.id));
  const priorMatches = result.priorMatches.filter((id) => knownIds.has(id));

  if (result.action === "block" && priorMatches.length === 0) {
    return {
      ...result,
      priorMatches,
      action: "screen",
      reason: `${result.reason} Screening rather than blocking — no corroborating report in the shared database yet.`,
    };
  }

  return { ...result, priorMatches };
}
