import type { ScreeningTurn, Campaign, ConfidenceTier } from "./types";

const SHINGLE_SIZE = 5;

/**
 * Similarity above which two scripts are treated as the same campaign.
 * Tuned low-ish on purpose: scammers vary names, amounts, and order, but the
 * skeleton of a script is remarkably stable.
 */
export const CAMPAIGN_MATCH_THRESHOLD = 0.28;

/** Words that carry no campaign signal and just inflate the Jaccard denominator. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
  "been", "to", "of", "in", "on", "at", "for", "with", "you", "your", "i",
  "we", "it", "this", "that", "have", "has", "will", "would", "can", "do",
  "does", "did", "so", "if", "as", "my", "me", "our",
]);

/**
 * Normalize aggressively. Numbers become placeholders so that "your $499
 * charge" and "your $1,299 charge" fingerprint the same — the dollar amount is
 * the variable, the sentence is the script.
 */
export function normalizeScript(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\$[\d,]+(\.\d{2})?/g, " AMOUNT ")
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, " PHONE ")
    .replace(/\b\d+\b/g, " NUM ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Overlapping n-word shingles, deduped and sorted for stable storage. */
export function fingerprint(turns: ScreeningTurn[]): string[] {
  // Only the caller's words describe the campaign. Our agent's replies are
  // constant across every screening and would swamp the similarity score.
  const callerText = turns
    .filter((t) => t.speaker === "caller")
    .map((t) => t.text)
    .join(" ");

  const words = normalizeScript(callerText);
  if (words.length < SHINGLE_SIZE) {
    return [...new Set(words)].sort();
  }

  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) {
    shingles.add(words.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return [...shingles].sort();
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const setB = new Set(b);
  let intersection = 0;
  for (const item of a) if (setB.has(item)) intersection++;

  const union = a.length + b.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface CampaignMatch {
  campaign: Campaign;
  similarity: number;
  /** Why we matched — shown in the enforcement console. */
  basis: "script" | "callback_number" | "identifier";
}

/**
 * Find the best existing campaign for a new report. An exact callback-number
 * or originating-identifier match is decisive on its own; otherwise fall back
 * to script similarity.
 */
export function matchCampaign(
  candidates: Campaign[],
  newFingerprint: string[],
  callbackNumber: string | undefined,
  originatingIdentifier: string,
): CampaignMatch | null {
  for (const campaign of candidates) {
    if (callbackNumber && campaign.callbackNumbers.includes(callbackNumber)) {
      return { campaign, similarity: 1, basis: "callback_number" };
    }
    if (campaign.originatingIdentifiers.includes(originatingIdentifier)) {
      return { campaign, similarity: 1, basis: "identifier" };
    }
  }

  let best: CampaignMatch | null = null;
  for (const campaign of candidates) {
    const similarity = jaccard(newFingerprint, campaign.scriptFingerprint);
    if (similarity >= CAMPAIGN_MATCH_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { campaign, similarity, basis: "script" };
    }
  }
  return best;
}

/**
 * Confidence tiering — the defamation guardrail.
 *
 * A single user's report is never enough to publish. Corroboration requires
 * independent reporters; confirmation additionally requires that every report
 * carried agent-verified red flags rather than a bare user assertion.
 */
export function computeTier(input: {
  reporterCount: number;
  allReportsHaveRedFlags: boolean;
  minConfidence: number;
}): ConfidenceTier {
  if (input.reporterCount < 2) return "reported";
  if (input.allReportsHaveRedFlags && input.minConfidence >= 0.8) return "confirmed";
  return "corroborated";
}

/** Tiers that are allowed to leave the system in exports and the public console. */
export const PUBLISHABLE_TIERS: ConfidenceTier[] = ["corroborated", "confirmed"];

export function isPublishable(tier: ConfidenceTier): boolean {
  return PUBLISHABLE_TIERS.includes(tier);
}
