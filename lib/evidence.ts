import { createHash } from "node:crypto";
import type { EvidenceRecord, ScreeningTurn, Verdict, Channel } from "./types";

/**
 * Canonical JSON: keys sorted at every level, no incidental whitespace. Two
 * records that are semantically identical must serialize to identical bytes,
 * or the hash chain is worthless.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);

  return `{${entries.join(",")}}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** The subset of an evidence record that the hash covers. */
type HashableEvidence = Omit<EvidenceRecord, "hash">;

export function hashEvidence(record: HashableEvidence): string {
  return sha256(canonicalJson(record));
}

export function buildEvidenceRecord(input: {
  id: string;
  userId: string;
  inboundEventId: string;
  channel: Channel;
  fromIdentifier: string;
  transcript: ScreeningTurn[];
  verdict: Verdict;
  capturedAt: string;
  prevHash: string;
}): EvidenceRecord {
  const hash = hashEvidence(input);
  return { ...input, hash };
}

export interface ChainVerification {
  valid: boolean;
  /** Index of the first record that failed, or -1 if the chain is intact. */
  brokenAt: number;
  reason?: string;
}

/**
 * Verify a user's evidence chain: every record's stored hash must match a
 * recomputation of its contents, and its prevHash must match the record before
 * it. Tampering with any stored field breaks both checks.
 */
export function verifyChain(records: EvidenceRecord[]): ChainVerification {
  let expectedPrev = "";

  for (let i = 0; i < records.length; i++) {
    const { hash, ...rest } = records[i];

    if (rest.prevHash !== expectedPrev) {
      return {
        valid: false,
        brokenAt: i,
        reason: `prevHash mismatch: expected ${expectedPrev || "<genesis>"}, got ${rest.prevHash || "<empty>"}`,
      };
    }

    const recomputed = hashEvidence(rest);
    if (recomputed !== hash) {
      return {
        valid: false,
        brokenAt: i,
        reason: `content hash mismatch: stored ${hash.slice(0, 12)}…, recomputed ${recomputed.slice(0, 12)}…`,
      };
    }

    expectedPrev = hash;
  }

  return { valid: true, brokenAt: -1 };
}
