import { randomUUID } from "node:crypto";
import {
  countDistinctReporters,
  getAllCampaigns,
  getEvidenceByIds,
  getEvidenceChain,
  insertEvidence,
  upsertCampaign,
} from "./db";
import { buildEvidenceRecord } from "./evidence";
import { computeTier, fingerprint, matchCampaign } from "./fingerprint";
import type {
  Campaign,
  Channel,
  EvidenceRecord,
  InboundEvent,
  ScreeningTurn,
  Verdict,
} from "./types";

export interface IngestResult {
  evidence: EvidenceRecord;
  campaign: Campaign;
  /** True if this report created a new campaign rather than joining one. */
  isNewCampaign: boolean;
  /** How the report was matched to an existing campaign, if it was. */
  matchBasis?: "script" | "callback_number" | "identifier";
  matchSimilarity?: number;
  /** Other users who have reported this same campaign. The demo's best line. */
  corroboratingReports: number;
}

/**
 * Turn a completed screening into evidence, then fold that evidence into the
 * shared campaign database.
 *
 * This is where the shared-intelligence value actually accrues: one user's
 * screened call becomes a prior that protects everyone else.
 */
export function ingestScreening(input: {
  userId: string;
  event: InboundEvent;
  transcript: ScreeningTurn[];
  verdict: Verdict;
}): IngestResult {
  const { userId, event, transcript, verdict } = input;
  const now = new Date().toISOString();

  // 1. Evidence record, chained to this user's previous one.
  const chain = getEvidenceChain(userId);
  const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : "";

  const evidence = buildEvidenceRecord({
    id: randomUUID(),
    userId,
    inboundEventId: event.id,
    channel: event.channel as Channel,
    fromIdentifier: event.fromIdentifier,
    transcript,
    verdict,
    capturedAt: now,
    prevHash,
  });
  insertEvidence(evidence);

  // 2. Match against known campaigns.
  const fp = fingerprint(transcript);
  const callback = verdict.entityClaims.callbackNumber;
  const existing = getAllCampaigns();
  const match = matchCampaign(existing, fp, callback, event.fromIdentifier);

  let campaign: Campaign;
  let isNewCampaign = false;

  if (match) {
    const c = match.campaign;
    const evidenceIds = [...c.evidenceIds, evidence.id];

    // Counted across ALL users, not just this one — see countDistinctReporters.
    const reporterCount = countDistinctReporters(evidenceIds);

    // Confirmation requires that *every* report carried agent-verified red
    // flags, not just the newest one. Check the whole set.
    const allReports = getEvidenceByIds(evidenceIds);
    const allReportsHaveRedFlags = allReports.every((r) => r.verdict.redFlags.length > 0);
    const minConfidence = Math.min(...allReports.map((r) => r.verdict.confidence));

    campaign = {
      ...c,
      // Union the fingerprints so the campaign generalizes as it sees variants.
      scriptFingerprint: [...new Set([...c.scriptFingerprint, ...fp])].sort(),
      claimedEntity: c.claimedEntity ?? verdict.entityClaims.claimedCompany,
      callbackNumbers: [...new Set([...c.callbackNumbers, ...(callback ? [callback] : [])])],
      originatingIdentifiers: [...new Set([...c.originatingIdentifiers, event.fromIdentifier])],
      scamType: c.scamType ?? verdict.scamType,
      reporterCount,
      evidenceIds,
      lastSeenAt: now,
      tier: computeTier({ reporterCount, allReportsHaveRedFlags, minConfidence }),
    };
  } else {
    isNewCampaign = true;
    campaign = {
      id: randomUUID(),
      scriptFingerprint: fp,
      claimedEntity: verdict.entityClaims.claimedCompany,
      callbackNumbers: callback ? [callback] : [],
      originatingIdentifiers: [event.fromIdentifier],
      scamType: verdict.scamType,
      // A brand new campaign always starts at `reported` — one user, unverified.
      // It cannot be exported or published until someone else independently
      // corroborates it.
      tier: "reported",
      reporterCount: 1,
      evidenceIds: [evidence.id],
      firstSeenAt: now,
      lastSeenAt: now,
    };
  }

  upsertCampaign(campaign);

  return {
    evidence,
    campaign,
    isNewCampaign,
    matchBasis: match?.basis,
    matchSimilarity: match?.similarity,
    corroboratingReports: Math.max(0, campaign.reporterCount - 1),
  };
}

/** How many times this identifier has contacted this user. Drives damages math. */
export function countContacts(userId: string, fromIdentifier: string): number {
  return getEvidenceChain(userId).filter((e) => e.fromIdentifier === fromIdentifier).length;
}
