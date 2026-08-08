import { randomBytes } from "node:crypto";
import type { DigitalId, ShieldedIdentity } from "./types";

export const CLAIM_DOMAIN = "claims.shieldguard.app";

/**
 * Claim IDs are the user's public face. Ambiguous characters (0/O, 1/I) are
 * excluded so they survive being read aloud or retyped off a printed letter.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateClaimId(now = new Date()): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ALPHABET[bytes[i] % ALPHABET.length];
  return `SG-${now.getUTCFullYear()}-${suffix}`;
}

/**
 * Derive the ONLY identity representation an agent or an outbound letter is
 * permitted to see.
 *
 * This is the primary defense and it is architectural, not cosmetic: the real
 * name, email, full phone, and street address are simply not present in the
 * returned object, so there is nothing for a prompt to leak. scanForLeaks()
 * below is the secondary, verification-time defense.
 */
export function shieldIdentity(id: DigitalId, claimId: string): ShieldedIdentity {
  return {
    claimId,
    proxyReplyAddress: `${claimId}@${CLAIM_DOMAIN}`,
    phoneLast4: id.phone.replace(/\D/g, "").slice(-4),
    stateOfResidence: id.stateOfResidence,
    onDncRegistry: id.onDncRegistry,
    dncRegistrationDate: id.dncRegistrationDate,
  };
}

export class PiiLeakError extends Error {
  constructor(public readonly leaks: string[]) {
    super(
      `Refusing to release document: it contains ${leaks.length} piece(s) of protected identity data (${leaks.join(", ")}).`,
    );
    this.name = "PiiLeakError";
  }
}

/** Build the list of literal strings that must never appear in outbound text. */
function protectedStrings(id: DigitalId): { label: string; value: string }[] {
  const digits = id.phone.replace(/\D/g, "");
  const out: { label: string; value: string }[] = [
    { label: "full name", value: id.fullName },
    { label: "email address", value: id.email },
    { label: "phone number", value: id.phone },
    { label: "phone number (digits)", value: digits },
  ];

  // Common formattings of the same number. A letter that writes the phone as
  // (310) 555-1234 is just as leaked as one that writes +13105551234.
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    out.push(
      { label: "phone number (formatted)", value: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` },
      { label: "phone number (dashed)", value: `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` },
      { label: "phone number (dotted)", value: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}` },
      { label: "phone number (national)", value: d },
    );
  }

  // First and last name separately — a letter signed "Sincerely, Maria" leaks
  // just as surely as one signed with the full name.
  const parts = id.fullName.split(/\s+/).filter((p) => p.length > 2);
  for (const part of parts) out.push({ label: `name component "${part}"`, value: part });

  if (id.streetAddress) out.push({ label: "street address", value: id.streetAddress });
  if (id.postalCode) out.push({ label: "postal code", value: id.postalCode });

  // The local part of the email often *is* the name.
  const localPart = id.email.split("@")[0];
  if (localPart.length > 3) out.push({ label: "email local part", value: localPart });

  return out;
}

/**
 * Verification-time defense. Scan generated text for any protected value and
 * return every hit. Callers should treat a non-empty result as fatal.
 */
export function findLeaks(text: string, id: DigitalId): string[] {
  const haystack = text.toLowerCase();
  const hits = new Set<string>();

  for (const { label, value } of protectedStrings(id)) {
    if (!value) continue;
    if (haystack.includes(value.toLowerCase())) hits.add(label);
  }

  return [...hits];
}

/**
 * Throwing wrapper. Every path that produces outbound correspondence must call
 * this before the document is shown to the user or delivered anywhere.
 */
export function scanForLeaks(text: string, id: DigitalId): void {
  const leaks = findLeaks(text, id);
  if (leaks.length > 0) throw new PiiLeakError(leaks);
}

/** Field lists for the "what they see / what stays private" UI panel. */
export function disclosureBreakdown(id: DigitalId): {
  disclosed: string[];
  withheld: string[];
} {
  const withheld = ["Full name", "Email address", "Full phone number"];
  if (id.streetAddress) withheld.push("Street address");
  if (id.postalCode) withheld.push("ZIP code");
  withheld.push("Device identifiers", "Call recordings");

  return {
    disclosed: [
      "Claim ID",
      "Proxy reply address",
      "Last 4 digits of phone",
      "State of residence",
      "Do Not Call registration status",
    ],
    withheld,
  };
}
