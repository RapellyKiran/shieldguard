/**
 * ShieldGuard — the integration contract.
 *
 * Everything in the app builds against these types. Freeze them early; if a
 * shape has to change, change it here first and let the compiler find the
 * call sites.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The user's real identity. This object is PRIVILEGED: it must never be passed
 * into an agent prompt, logged, or serialized into anything that leaves the
 * device. Derive a ShieldedIdentity instead (see lib/shield.ts).
 */
export interface DigitalId {
  userId: string;
  fullName: string;
  email: string;
  /** E.164, e.g. +13105551234 */
  phone: string;
  streetAddress?: string;
  city?: string;
  stateOfResidence: string;
  postalCode?: string;
  /** Registered on the National Do Not Call Registry. */
  onDncRegistry: boolean;
  /** ISO date the number was placed on the registry. */
  dncRegistrationDate?: string;
}

/**
 * The ONLY identity representation an agent is ever allowed to see, and the
 * only one that appears in outbound correspondence.
 */
export interface ShieldedIdentity {
  /** e.g. SG-2026-8F3K21 */
  claimId: string;
  /** e.g. SG-2026-8F3K21@claims.shieldguard.app */
  proxyReplyAddress: string;
  /** Last four digits only, e.g. "1234". */
  phoneLast4: string;
  /** Two-letter state code — needed for jurisdiction, not identifying. */
  stateOfResidence: string;
  onDncRegistry: boolean;
  dncRegistrationDate?: string;
}

// ---------------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------------

export type Channel = "call" | "sms" | "email";

export interface InboundEvent {
  id: string;
  userId: string;
  channel: Channel;
  /** Caller ID / sender number or address as presented. */
  fromIdentifier: string;
  /** Display name if the carrier or mail client supplied one. */
  fromDisplayName?: string;
  /** Initial payload: SMS body, email body, or the caller's opening line. */
  body?: string;
  subject?: string;
  receivedAt: string;
}

export type TriageAction = "allow" | "block" | "screen";

export interface TriageResult {
  action: TriageAction;
  /** 0..1 */
  confidence: number;
  reason: string;
  /** Campaign IDs from the shared DB that this inbound already matches. */
  priorMatches: string[];
}

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------

export type Speaker = "agent" | "caller";

export interface ScreeningTurn {
  speaker: Speaker;
  text: string;
  at: string;
}

export type VerdictLabel = "legitimate" | "suspicious" | "scam";

export interface RedFlag {
  code: string;
  label: string;
  /** Verbatim quote from the transcript that evidences this flag. */
  quote: string;
}

/**
 * What the caller *claimed* about themselves. Claims, not facts — the naming
 * matters, because the whole point is that we could not verify them.
 */
export interface EntityClaims {
  claimedCompany?: string;
  claimedName?: string;
  callbackNumber?: string;
  claimedWebsite?: string;
  claimedReason?: string;
  paymentMethodRequested?: string;
}

export interface Verdict {
  label: VerdictLabel;
  /** 0..1 */
  confidence: number;
  scamType?: string;
  summary: string;
  redFlags: RedFlag[];
  entityClaims: EntityClaims;
  /** Did the caller request money, gift cards, or credentials? */
  soughtPayment: boolean;
  soughtCredentials: boolean;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface EvidenceRecord {
  id: string;
  userId: string;
  inboundEventId: string;
  channel: Channel;
  fromIdentifier: string;
  transcript: ScreeningTurn[];
  verdict: Verdict;
  capturedAt: string;
  /** sha256 over the canonical JSON of everything above. */
  hash: string;
  /** Hash of the previous record in this user's chain; "" for the first. */
  prevHash: string;
}

// ---------------------------------------------------------------------------
// Shared scammer database
// ---------------------------------------------------------------------------

/**
 * `reported`     — a single user, unverified. NEVER published or exported.
 * `corroborated` — 2+ independent users with a matching script fingerprint.
 * `confirmed`    — corroborated AND agent-verified red flags on every report.
 */
export type ConfidenceTier = "reported" | "corroborated" | "confirmed";

export interface Campaign {
  id: string;
  /** Normalized shingle set, persisted as a sorted JSON array. */
  scriptFingerprint: string[];
  claimedEntity?: string;
  callbackNumbers: string[];
  originatingIdentifiers: string[];
  scamType?: string;
  tier: ConfidenceTier;
  /** Distinct users who reported this campaign. */
  reporterCount: number;
  evidenceIds: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

// ---------------------------------------------------------------------------
// Violations
// ---------------------------------------------------------------------------

export interface Violation {
  /** Human label, e.g. "TCPA — prerecorded call to a wireless number". */
  provision: string;
  /** Formal citation, e.g. "47 U.S.C. § 227(b)(1)(A)(iii)". */
  citation: string;
  /** Which elements of the offense the evidence satisfies. */
  elementsMet: string[];
  /** Verbatim transcript quotes supporting each element. */
  evidenceQuotes: string[];
  /** Per-violation statutory floor in whole dollars. */
  damagesLow: number;
  /** Per-violation ceiling (usually the trebled figure). */
  damagesHigh: number;
  /** True only for statutes an individual can sue under. */
  privateRightOfAction: boolean;
  /** Where this goes if there's no private right of action. */
  enforcementChannel?: "FTC" | "State AG" | "FCC";
  willfulnessBasis?: string;
}

export interface ViolationAnalysis {
  violations: Violation[];
  /** Number of separate contacts in the pattern (each is its own violation). */
  contactCount: number;
  /** Computed in code, never by the model. See lib/damages.ts. */
  damagesTotalLow: number;
  damagesTotalHigh: number;
  /** Violations with no private right of action, routed to regulators. */
  regulatorReferrals: Violation[];
  notes: string;
}

// ---------------------------------------------------------------------------
// Demand letter
// ---------------------------------------------------------------------------

export interface DemandLetter {
  id: string;
  claimId: string;
  recipientName: string;
  recipientContact: string;
  subject: string;
  /** Full letter body. MUST contain zero real PII. */
  body: string;
  demandAmount: number;
  /** Days the recipient has to respond. */
  cureWindowDays: number;
  citations: string[];
  generatedAt: string;
  approvedAt?: string;
  sentAt?: string;
  /** Fields deliberately withheld, surfaced in the UI split panel. */
  withheldFields: string[];
  /** Fields actually present in the letter, surfaced in the UI split panel. */
  disclosedFields: string[];
}

// ---------------------------------------------------------------------------
// Data deletion (California DELETE Act / SB 362)
// ---------------------------------------------------------------------------

export interface DataBroker {
  /** CPPA registration ID. */
  registrationId: string;
  name: string;
  website: string;
  /** Categories of data the broker self-reports collecting. */
  categories: string[];
  /** Does the broker collect phone numbers / reassigned-number data? */
  collectsPhone: boolean;
  privacyContact?: string;
}

export interface DeletionRequest {
  id: string;
  userId: string;
  /** DROP = the CPPA's central platform. DIRECT = a letter to one broker. */
  method: "DROP" | "DIRECT";
  brokerIds: string[];
  /** Prefilled submission payload or letter body. */
  content: string;
  /** Where the user goes to complete a DROP submission themselves. */
  portalUrl?: string;
  generatedAt: string;
  approvedAt?: string;
  /** Statutory deadline the broker is on, once submitted. */
  brokerDeadlineDays: number;
}

// ---------------------------------------------------------------------------
// Money recovery
// ---------------------------------------------------------------------------

export type PaymentRail =
  | "wire"
  | "ach"
  | "debit_card"
  | "credit_card"
  | "p2p"
  | "gift_card"
  | "crypto"
  | "check";

export interface RecoveryStep {
  order: number;
  title: string;
  detail: string;
  /** Hours remaining before this avenue likely closes; null if not time-boxed. */
  hoursRemaining: number | null;
  /** The rule or program this step rests on, e.g. "Reg E, 12 C.F.R. § 1005.6". */
  basis?: string;
  contact?: string;
  urgency: "critical" | "high" | "normal";
}

export interface RecoveryPlan {
  rail: PaymentRail;
  amountLost: number;
  occurredAt: string;
  steps: RecoveryStep[];
  /** Always rendered. This is information, not legal or financial advice. */
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Mock inbox (demo delivery target)
// ---------------------------------------------------------------------------

export interface MockInboxMessage {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}
