import type { Violation, ViolationAnalysis } from "./types";

/**
 * Damages arithmetic lives here, in code, deliberately.
 *
 * The violations agent decides *which* statutes are implicated and *why*. It
 * does not decide what the numbers add up to — a model that fumbles a
 * multiplication in a document demanding money is a liability, and a number we
 * can't reproduce on a whiteboard is a number we shouldn't send.
 */

/** 47 U.S.C. § 227(b)(3): actual loss or $500 per violation, whichever is greater. */
export const TCPA_B_PER_VIOLATION = 500;
/** Trebled where the violation was willful or knowing. */
export const TCPA_B_WILLFUL_MULTIPLIER = 3;
/** 47 U.S.C. § 227(c)(5): up to $500, at the court's discretion. */
export const TCPA_C_PER_VIOLATION_MAX = 500;

export interface DamagesComputation {
  low: number;
  high: number;
  /** Line-by-line arithmetic, rendered in the UI and the letter appendix. */
  breakdown: {
    citation: string;
    contactCount: number;
    perViolationLow: number;
    perViolationHigh: number;
    subtotalLow: number;
    subtotalHigh: number;
  }[];
}

/**
 * Total exposure across every violation that an individual can actually sue
 * on. Regulator-only violations (TSR, CAN-SPAM) are excluded from the demand
 * figure — including them would inflate the number with damages the consumer
 * has no standing to collect.
 */
export function computeDamages(
  violations: Violation[],
  contactCount: number,
): DamagesComputation {
  const breakdown = violations
    .filter((v) => v.privateRightOfAction)
    .map((v) => {
      const subtotalLow = v.damagesLow * contactCount;
      const subtotalHigh = v.damagesHigh * contactCount;
      return {
        citation: v.citation,
        contactCount,
        perViolationLow: v.damagesLow,
        perViolationHigh: v.damagesHigh,
        subtotalLow,
        subtotalHigh,
      };
    });

  return {
    low: breakdown.reduce((sum, b) => sum + b.subtotalLow, 0),
    high: breakdown.reduce((sum, b) => sum + b.subtotalHigh, 0),
    breakdown,
  };
}

/**
 * Overwrite whatever totals the model produced with the computed ones, and
 * split out the referrals. Call this on every analysis before it is used.
 */
export function reconcileAnalysis(
  analysis: Omit<ViolationAnalysis, "damagesTotalLow" | "damagesTotalHigh" | "regulatorReferrals">,
): ViolationAnalysis {
  const computed = computeDamages(analysis.violations, analysis.contactCount);
  return {
    ...analysis,
    damagesTotalLow: computed.low,
    damagesTotalHigh: computed.high,
    regulatorReferrals: analysis.violations.filter((v) => !v.privateRightOfAction),
  };
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
