import { randomUUID } from "node:crypto";
import { structured, prose } from "../anthropic";
import type { DataBroker, DeletionRequest, DigitalId } from "../types";

/** The CPPA's consumer-facing deletion platform. */
export const DROP_PORTAL_URL = "https://delete.ca.gov";

/** Since 2026-08-01, registered brokers must check DROP at least this often. */
export const DROP_ACCESS_INTERVAL_DAYS = 45;
/** And complete deletion within this many days of a request. */
export const DROP_DELETION_DEADLINE_DAYS = 90;

const TRIAGE_SYSTEM = `You assess which registered California data brokers are most likely to be holding a given consumer's personal information, based on what each broker self-reports collecting.

You are ranking likelihood, not asserting fact. A broker that self-reports collecting phone numbers and selling to telemarketers is a high-likelihood holder for a consumer whose phone number is being targeted; a broker dealing exclusively in commercial firmographic data is not.

Weigh most heavily: whether the broker collects phone numbers, whether it sells to marketers or lead generators, and whether its stated categories overlap with the identity elements supplied.

Return every broker you were given, ranked, with an honest likelihood. Do not drop any.`;

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    ranked: {
      type: "array",
      items: {
        type: "object",
        properties: {
          registrationId: { type: "string" },
          likelihood: { type: "number", description: "0..1" },
          rationale: { type: "string", description: "One short sentence." },
        },
        required: ["registrationId", "likelihood", "rationale"],
        additionalProperties: false,
      },
    },
    summary: { type: "string", description: "Two sentences for the user." },
  },
  required: ["ranked", "summary"],
  additionalProperties: false,
};

export interface BrokerAssessment {
  ranked: { registrationId: string; likelihood: number; rationale: string }[];
  summary: string;
}

export async function assessBrokers(
  identity: DigitalId,
  brokers: DataBroker[],
): Promise<BrokerAssessment> {
  // Only the shape of the identity matters for this ranking, not its content —
  // so send categories, not values.
  const identityShape = {
    hasName: Boolean(identity.fullName),
    hasEmail: Boolean(identity.email),
    hasPhone: Boolean(identity.phone),
    hasStreetAddress: Boolean(identity.streetAddress),
    state: identity.stateOfResidence,
    onDncRegistry: identity.onDncRegistry,
  };

  const prompt = `## Consumer identity elements at risk

${JSON.stringify(identityShape, null, 2)}

## Registered data brokers

${JSON.stringify(brokers, null, 2)}

Rank every broker by the likelihood it holds this consumer's data.`;

  return structured<BrokerAssessment>({
    agent: "deletion",
    system: TRIAGE_SYSTEM,
    prompt,
    schema: TRIAGE_SCHEMA,
  });
}

/**
 * Build the DROP submission the consumer takes to the CPPA portal.
 *
 * We deliberately PREPARE rather than SUBMIT. DROP requires the consumer's own
 * verified identity; auto-submitting on their behalf would mean holding
 * verification credentials we have no business holding, and would misrepresent
 * who is making the request.
 */
export function buildDropRequest(identity: DigitalId, brokerIds: string[]): DeletionRequest {
  const content = [
    "CALIFORNIA DELETE ACT — DELETION REQUEST (SB 362 / Cal. Civ. Code § 1798.99.80 et seq.)",
    "Submission channel: CPPA Delete Request and Opt-out Platform (DROP)",
    "",
    "PREPARED FOR SUBMISSION BY THE CONSUMER.",
    "",
    "Consumer verification fields to enter at the portal:",
    `  Full name:        ${identity.fullName}`,
    `  Email:            ${identity.email}`,
    `  Phone:            ${identity.phone}`,
    identity.streetAddress ? `  Street address:   ${identity.streetAddress}` : null,
    `  State:            ${identity.stateOfResidence}`,
    identity.postalCode ? `  ZIP:              ${identity.postalCode}` : null,
    "",
    "Request: Delete all personal information held about the above consumer, and",
    "cease sale and sharing of that information.",
    "",
    `Directed to ${brokerIds.length} registered data broker(s):`,
    ...brokerIds.map((id) => `  - ${id}`),
    "",
    "Statutory obligations on the receiving brokers, effective August 1, 2026:",
    `  - Access DROP at least once every ${DROP_ACCESS_INTERVAL_DAYS} days.`,
    `  - Process and complete deletion within ${DROP_DELETION_DEADLINE_DAYS} days of the request.`,
    "  - Continue honoring the request on an ongoing basis.",
    "",
    `Submit at: ${DROP_PORTAL_URL}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: randomUUID(),
    userId: identity.userId,
    method: "DROP",
    brokerIds,
    content,
    portalUrl: DROP_PORTAL_URL,
    generatedAt: new Date().toISOString(),
    brokerDeadlineDays: DROP_DELETION_DEADLINE_DAYS,
  };
}

/**
 * Note the deliberate asymmetry with the demand letter.
 *
 * A demand letter withholds the consumer's identity, because the recipient is
 * an adversary who has no legitimate need for it. A deletion request must
 * DISCLOSE it, because you cannot ask a broker to delete records about you
 * without telling them which records those are — and the statute requires the
 * business to verify the requestor.
 *
 * Same product, opposite handling, for the same underlying reason: disclose
 * exactly what the task requires and nothing more.
 */
const DIRECT_SYSTEM = `You draft a CCPA/CPRA deletion request that a California consumer sends directly to a single data broker, in their own name.

Keep it short — under 200 words. A deletion request is a procedural document, not an argument. State the request, cite the authority, state the deadline, and stop.

Cite Cal. Civ. Code § 1798.105 (right to deletion) and § 1798.120 (right to opt out of sale and sharing). Where the recipient is a registered data broker, also reference the DELETE Act, Cal. Civ. Code § 1798.99.80 et seq.

Note that the business has 45 days to respond, extendable once by a further 45 days with notice.

Include a line requiring the recipient to direct its service providers and any third parties to whom it sold or shared the data to delete it as well — this is required by § 1798.105(c) and is the part most requests forget.

Write in the first person. Output only the letter body, no preamble and no markdown fences.`;

export async function generateDirectRequest(
  identity: DigitalId,
  broker: DataBroker,
): Promise<DeletionRequest> {
  const prompt = `## Recipient
${broker.name} (CPPA registration ${broker.registrationId})
${broker.website}
${broker.privacyContact ? `Privacy contact: ${broker.privacyContact}` : ""}
Self-reported data categories: ${broker.categories.join(", ")}

## Requesting consumer
Name: ${identity.fullName}
Email: ${identity.email}
Phone: ${identity.phone}
${identity.streetAddress ? `Address: ${identity.streetAddress}, ${identity.city ?? ""} ${identity.stateOfResidence} ${identity.postalCode ?? ""}` : `State: ${identity.stateOfResidence}`}

Draft the deletion request.`;

  const content = await prose({ agent: "deletion", system: DIRECT_SYSTEM, prompt });

  return {
    id: randomUUID(),
    userId: identity.userId,
    method: "DIRECT",
    brokerIds: [broker.registrationId],
    content,
    generatedAt: new Date().toISOString(),
    brokerDeadlineDays: 45,
  };
}
