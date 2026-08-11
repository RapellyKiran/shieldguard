/**
 * demo:check — run this before you present, and after every merge in the last
 * two hours.
 *
 * Split into two phases on purpose:
 *
 *   Phase A (offline)  — the safety invariants. No API key, no network, runs in
 *                        under a second. These are the properties that must
 *                        never regress: the PII shield, the evidence chain, the
 *                        confidence tiers, and the damages arithmetic.
 *
 *   Phase B (live)     — the full spine through real model calls. Needs
 *                        ANTHROPIC_API_KEY. Skipped with a clear notice if the
 *                        key is absent, so Phase A still gates a commit.
 *
 * Exit code is non-zero if anything fails, so it works in a pre-push hook.
 */

import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Point the store at a scratch file so a check run never clobbers demo state.
// This must happen BEFORE lib/db is loaded, which is why every import below is
// dynamic rather than a top-level `import` statement.
const TEST_DB = join(process.cwd(), "demo-check.json");
process.env.SHIELDGUARD_DB = TEST_DB;
try {
  rmSync(TEST_DB);
} catch {
  /* not present — fine */
}

const { buildEvidenceRecord, verifyChain, canonicalJson } = await import("../lib/evidence");
const { findLeaks, scanForLeaks, shieldIdentity, generateClaimId, PiiLeakError } = await import("../lib/shield");
const { computeTier, fingerprint, jaccard, isPublishable } = await import("../lib/fingerprint");
const { computeDamages, reconcileAnalysis } = await import("../lib/damages");
const db = await import("../lib/db");
const { ingestScreening, countContacts } = await import("../lib/ingest");
const { DEMO_USER, getScenario } = await import("../data/seed");

import type { DigitalId, ScreeningTurn, Verdict, Violation } from "../lib/types";

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? `\n      ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRANSCRIPT: ScreeningTurn[] = [
  { speaker: "agent", text: "Hi, this is an automated screening assistant. This call is being recorded. Who's calling?", at: "2026-08-08T10:00:00Z" },
  { speaker: "caller", text: "This is David Chen from the Amazon Account Security Department. There's an unauthorized charge of $1,299 on your Prime account.", at: "2026-08-08T10:00:10Z" },
  { speaker: "agent", text: "Can you provide a callback number and your company's website?", at: "2026-08-08T10:00:20Z" },
  { speaker: "caller", text: "I can't give you a callback number, this is a secure line. You need to buy two Apple gift cards for $500 each and read me the codes to reverse the charge.", at: "2026-08-08T10:00:30Z" },
];

const VERDICT: Verdict = {
  label: "scam",
  confidence: 0.95,
  scamType: "Amazon impersonation",
  summary: "Caller impersonated Amazon and demanded gift card payment.",
  redFlags: [
    { code: "IMPERSONATION", label: "Impersonated Amazon", quote: "This is David Chen from the Amazon Account Security Department." },
    { code: "GIFT_CARD_REQUEST", label: "Demanded gift cards", quote: "buy two Apple gift cards for $500 each" },
    { code: "REFUSED_IDENTIFICATION", label: "Refused callback number", quote: "I can't give you a callback number, this is a secure line." },
  ],
  entityClaims: { claimedCompany: "Amazon", claimedName: "David Chen", paymentMethodRequested: "Apple gift cards" },
  soughtPayment: true,
  soughtCredentials: false,
};

// ===========================================================================
// PHASE A — offline invariants
// ===========================================================================

console.log("\n\x1b[1m\x1b[36mPHASE A — offline safety invariants\x1b[0m");

// --- 1. PII shield -----------------------------------------------------------
section("1. PII shield");

const claimId = generateClaimId();
const shielded = shieldIdentity(DEMO_USER, claimId);

check(
  "shielded identity carries no name, email, or full phone",
  !JSON.stringify(shielded).includes(DEMO_USER.fullName) &&
    !JSON.stringify(shielded).includes(DEMO_USER.email) &&
    !JSON.stringify(shielded).includes(DEMO_USER.phone),
  `got: ${JSON.stringify(shielded)}`,
);

check("claim ID format is SG-YYYY-XXXXXX", /^SG-\d{4}-[A-Z0-9]{6}$/.test(claimId), claimId);

check(
  "claim IDs avoid ambiguous characters (0/O/1/I)",
  !/[01IO]/.test(claimId.split("-")[2]),
  claimId,
);

// Every representation of the phone number must be caught, not just E.164.
const phoneVariants = [
  "+13105550142",
  "13105550142",
  "3105550142",
  "(310) 555-0142",
  "310-555-0142",
  "310.555.0142",
];
for (const variant of phoneVariants) {
  check(
    `leak scanner catches phone as "${variant}"`,
    findLeaks(`Please call me back at ${variant} to resolve this.`, DEMO_USER).length > 0,
  );
}

check(
  "leak scanner catches the full name",
  findLeaks("Sincerely, Maria Delgado", DEMO_USER).length > 0,
);
check(
  "leak scanner catches a first name alone",
  findLeaks("Sincerely, Maria", DEMO_USER).length > 0,
);
check(
  "leak scanner catches a surname alone",
  findLeaks("Regards, Delgado", DEMO_USER).length > 0,
);
check(
  "leak scanner catches the email",
  findLeaks("Reply to maria.delgado@example.com", DEMO_USER).length > 0,
);
check(
  "leak scanner catches the street address",
  findLeaks("I reside at 1847 Rosewood Avenue, Apt 3B.", DEMO_USER).length > 0,
);
check(
  "leak scanner is case-insensitive",
  findLeaks("MARIA DELGADO", DEMO_USER).length > 0,
);

// A clean letter must NOT trip the scanner — a check that only ever fires is
// worthless, and false positives would block every legitimate send.
const cleanLetter = `To Whom It May Concern:

I am writing regarding repeated unsolicited calls to my telephone number ending in ${shielded.phoneLast4}, a number registered on the National Do Not Call Registry.

Please direct all correspondence to ${shielded.proxyReplyAddress}, referencing claim ${shielded.claimId}. My full identity is held in escrow and will be released upon execution of a mutual non-disclosure and settlement agreement.

Reference: ${shielded.claimId}`;

check(
  "a properly shielded letter produces zero leaks",
  findLeaks(cleanLetter, DEMO_USER).length === 0,
  `found: ${findLeaks(cleanLetter, DEMO_USER).join(", ")}`,
);

check(
  "scanForLeaks throws PiiLeakError on a contaminated document",
  (() => {
    try {
      scanForLeaks(cleanLetter + "\n\nSincerely,\nMaria Delgado", DEMO_USER);
      return false;
    } catch (e) {
      return e instanceof PiiLeakError && e.leaks.length > 0;
    }
  })(),
);

check(
  "scanForLeaks does not throw on a clean document",
  (() => {
    try {
      scanForLeaks(cleanLetter, DEMO_USER);
      return true;
    } catch {
      return false;
    }
  })(),
);

// --- 2. Evidence chain -------------------------------------------------------
section("2. Evidence integrity");

check(
  "canonical JSON is key-order independent",
  canonicalJson({ b: 1, a: 2 }) === canonicalJson({ a: 2, b: 1 }),
);

const rec1 = buildEvidenceRecord({
  id: "e1", userId: "u1", inboundEventId: "i1", channel: "call",
  fromIdentifier: "+18885550177", transcript: TRANSCRIPT, verdict: VERDICT,
  capturedAt: "2026-08-08T10:01:00Z", prevHash: "",
});
const rec2 = buildEvidenceRecord({
  id: "e2", userId: "u1", inboundEventId: "i2", channel: "call",
  fromIdentifier: "+18885550177", transcript: TRANSCRIPT, verdict: VERDICT,
  capturedAt: "2026-08-08T11:01:00Z", prevHash: rec1.hash,
});

check("an intact chain verifies", verifyChain([rec1, rec2]).valid);

const tampered = { ...rec2, transcript: [...TRANSCRIPT, { speaker: "caller" as const, text: "fabricated", at: "x" }] };
const tamperResult = verifyChain([rec1, tampered]);
check(
  "mutating a record's content breaks the chain",
  !tamperResult.valid && tamperResult.brokenAt === 1,
  tamperResult.reason,
);

const reordered = verifyChain([rec2, rec1]);
check("reordering records breaks the chain", !reordered.valid);

// --- 3. Confidence tiers -----------------------------------------------------
section("3. Confidence tiers (defamation guardrail)");

check(
  "a single reporter is held at `reported`",
  computeTier({ reporterCount: 1, allReportsHaveRedFlags: true, minConfidence: 0.99 }) === "reported",
);
check(
  "`reported` is not publishable",
  !isPublishable("reported"),
);
check(
  "two reporters reach `confirmed` when all reports carry red flags",
  computeTier({ reporterCount: 2, allReportsHaveRedFlags: true, minConfidence: 0.9 }) === "confirmed",
);
check(
  "two reporters without red flags stop at `corroborated`",
  computeTier({ reporterCount: 2, allReportsHaveRedFlags: false, minConfidence: 0.9 }) === "corroborated",
);
check(
  "low confidence prevents promotion to `confirmed`",
  computeTier({ reporterCount: 3, allReportsHaveRedFlags: true, minConfidence: 0.5 }) === "corroborated",
);
check("both corroborated and confirmed are publishable", isPublishable("corroborated") && isPublishable("confirmed"));

// --- 4. Damages arithmetic ---------------------------------------------------
section("4. Damages arithmetic (computed, never generated)");

const tcpaB: Violation = {
  provision: "TCPA — prerecorded call to a wireless number",
  citation: "47 U.S.C. § 227(b)(1)(A)(iii)",
  elementsMet: ["call placed", "wireless number", "no consent"],
  evidenceQuotes: ["..."],
  damagesLow: 500, damagesHigh: 1500, privateRightOfAction: true,
};
const tsr: Violation = {
  provision: "FTC TSR — gift card payment",
  citation: "16 C.F.R. § 310.4(a)(10)",
  elementsMet: ["cash reload mechanism requested"],
  evidenceQuotes: ["..."],
  damagesLow: 0, damagesHigh: 0, privateRightOfAction: false,
  enforcementChannel: "FTC",
};

const d = computeDamages([tcpaB, tsr], 4);
check("4 contacts × $1,500 = $6,000", d.high === 6000, `got ${d.high}`);
check("floor is 4 × $500 = $2,000", d.low === 2000, `got ${d.low}`);
check(
  "regulator-only violations are excluded from the demand figure",
  d.breakdown.length === 1 && d.breakdown[0].citation === tcpaB.citation,
);

const reconciled = reconcileAnalysis({ violations: [tcpaB, tsr], contactCount: 4, notes: "" });
check("reconcileAnalysis overwrites totals with computed values", reconciled.damagesTotalHigh === 6000);
check("reconcileAnalysis routes non-actionable findings to referrals", reconciled.regulatorReferrals.length === 1);

// --- 5. Fingerprinting -------------------------------------------------------
section("5. Campaign fingerprinting");

const fpA = fingerprint(TRANSCRIPT);
check("fingerprint is non-empty", fpA.length > 0);
check("identical transcripts are identical fingerprints", jaccard(fpA, fingerprint(TRANSCRIPT)) === 1);

// Same script, different dollar amount and name — must still cluster.
const variant: ScreeningTurn[] = TRANSCRIPT.map((t) =>
  t.speaker === "caller"
    ? { ...t, text: t.text.replace("$1,299", "$899").replace("David Chen", "Robert Hall") }
    : t,
);
check(
  "amount and name variants still match the same campaign",
  jaccard(fpA, fingerprint(variant)) > 0.5,
  `similarity ${jaccard(fpA, fingerprint(variant)).toFixed(2)}`,
);

const unrelated: ScreeningTurn[] = [
  { speaker: "caller", text: "Hi, this is Denise from Westside Pharmacy, your prescription is ready for pickup whenever convenient.", at: "x" },
];
check(
  "an unrelated call does not match",
  jaccard(fpA, fingerprint(unrelated)) < 0.28,
  `similarity ${jaccard(fpA, fingerprint(unrelated)).toFixed(2)}`,
);

// --- 6. Export filtering (end to end through the DB) -------------------------
section("6. Export filtering");

db.resetDb();
db.upsertUser(DEMO_USER, claimId);

const evt = {
  id: randomUUID(), userId: DEMO_USER.userId, channel: "call" as const,
  fromIdentifier: "+18885550177", fromDisplayName: "AMAZON SECURITY",
  receivedAt: new Date().toISOString(),
};
db.insertInboundEvent(evt);

const first = ingestScreening({ userId: DEMO_USER.userId, event: evt, transcript: TRANSCRIPT, verdict: VERDICT });
check("first report creates a campaign at `reported`", first.campaign.tier === "reported");
check("a single-reporter campaign is excluded from the export", db.getPublishableCampaigns().length === 0);
check("but it is visible in the internal view", db.getAllCampaigns().length === 1);

// A second, independent user reports the same script.
const otherUser: DigitalId = { ...DEMO_USER, userId: "user_demo_two", fullName: "Sam Rivera", email: "sam@example.com", phone: "+13105550199" };
db.upsertUser(otherUser, generateClaimId());
const evt2 = { ...evt, id: randomUUID(), userId: otherUser.userId };
db.insertInboundEvent(evt2);
const second = ingestScreening({ userId: otherUser.userId, event: evt2, transcript: variant, verdict: VERDICT });

check("a second independent reporter joins the same campaign", !second.isNewCampaign, `matched by ${second.matchBasis}`);
check("reporter count reflects distinct users", second.campaign.reporterCount === 2, `got ${second.campaign.reporterCount}`);
check("the campaign is now publishable", db.getPublishableCampaigns().length === 1);

// The same user reporting twice must NOT manufacture corroboration.
db.resetDb();
db.upsertUser(DEMO_USER, claimId);
const evtA = { ...evt, id: randomUUID() };
const evtB = { ...evt, id: randomUUID() };
db.insertInboundEvent(evtA);
db.insertInboundEvent(evtB);
ingestScreening({ userId: DEMO_USER.userId, event: evtA, transcript: TRANSCRIPT, verdict: VERDICT });
const selfSecond = ingestScreening({ userId: DEMO_USER.userId, event: evtB, transcript: variant, verdict: VERDICT });
check(
  "one user reporting twice does NOT reach corroboration",
  selfSecond.campaign.reporterCount === 1 && selfSecond.campaign.tier === "reported",
  `count ${selfSecond.campaign.reporterCount}, tier ${selfSecond.campaign.tier}`,
);
check("contact count tracks repeat contacts for damages", countContacts(DEMO_USER.userId, "+18885550177") === 2);

// ===========================================================================
// PHASE B — live spine
// ===========================================================================

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("\n\x1b[33m⚠ PHASE B skipped — ANTHROPIC_API_KEY is not set.\x1b[0m");
  console.log("  Offline invariants above still gate the build. To run the full");
  console.log("  spine:  put your own key in .env.local (gitignored), then");
  console.log("          npm run demo:check\n");
} else {
  console.log("\n\x1b[1m\x1b[36mPHASE B — live spine (real model calls)\x1b[0m");

  const { triage } = await import("../lib/agents/triage");
  const { analyzeVerdict } = await import("../lib/agents/screener");
  const { analyzeViolations } = await import("../lib/agents/violations");
  const { generateDemandLetter } = await import("../lib/agents/letter");

  db.resetDb();
  db.upsertUser(DEMO_USER, claimId);

  const scenario = getScenario("amazon_giftcard")!;
  const liveEvent = {
    id: randomUUID(), userId: DEMO_USER.userId, channel: scenario.channel,
    fromIdentifier: scenario.fromIdentifier, fromDisplayName: scenario.fromDisplayName,
    receivedAt: new Date().toISOString(),
  };
  db.insertInboundEvent(liveEvent);

  try {
    section("7. Triage");
    const t = await triage(liveEvent, db.getAllCampaigns());
    check("triage returns a valid action", ["allow", "block", "screen"].includes(t.action), t.action);
    check("an unknown scammer is screened, not auto-allowed", t.action !== "allow", `got "${t.action}"`);

    section("8. Verdict");
    const v = await analyzeVerdict(liveEvent, TRANSCRIPT);
    check("gift-card scam is classified as scam", v.label === "scam", `got "${v.label}"`);
    check("red flags are extracted", v.redFlags.length > 0);
    check(
      "every red flag quotes the transcript verbatim",
      v.redFlags.every((f) => TRANSCRIPT.some((turn) => turn.text.includes(f.quote.slice(0, 25)))),
      "a quote was not found in the source transcript",
    );
    check("payment demand is detected", v.soughtPayment);

    section("9. Ingest");
    const ing = ingestScreening({ userId: DEMO_USER.userId, event: liveEvent, transcript: TRANSCRIPT, verdict: v });
    check("evidence record written", Boolean(db.getEvidence(ing.evidence.id)));
    check("evidence chain valid after write", verifyChain(db.getEvidenceChain(DEMO_USER.userId)).valid);
    check("campaign created", Boolean(db.getCampaign(ing.campaign.id)));

    section("10. Violations");
    const analysis = await analyzeViolations(ing.evidence, shielded, 4);
    check("at least one violation identified", analysis.violations.length > 0);
    check(
      "at least one carries a private right of action",
      analysis.violations.some((x) => x.privateRightOfAction),
    );
    check(
      "TSR findings are correctly marked as regulator-only",
      analysis.violations.filter((x) => x.citation.includes("310")).every((x) => !x.privateRightOfAction),
      "a TSR provision was wrongly marked as privately actionable",
    );
    check(
      "totals equal the code-computed figure",
      analysis.damagesTotalHigh ===
        computeDamages(analysis.violations.filter((x) => x.privateRightOfAction), 4).high,
    );

    section("11. Demand letter + PII shield");
    const letter = await generateDemandLetter({
      evidence: ing.evidence, analysis, shielded, realIdentity: DEMO_USER,
    });
    check("letter generated", letter.body.length > 200);
    check("letter contains the claim ID", letter.body.includes(shielded.claimId));
    check("letter contains the proxy reply address", letter.body.includes(shielded.proxyReplyAddress));
    check(
      "letter contains ZERO real PII",
      findLeaks(letter.body, DEMO_USER).length === 0,
      `leaked: ${findLeaks(letter.body, DEMO_USER).join(", ")}`,
    );
    check(
      "letter contains no bracketed name placeholder",
      !/\[\s*(your |full )?name\s*\]/i.test(letter.body),
    );
    check("demand amount matches the computed figure", letter.demandAmount === analysis.damagesTotalHigh);

    section("12. Adversarial — the shield must fire");
    check(
      "a letter contaminated post-generation is rejected",
      (() => {
        try {
          scanForLeaks(letter.body + `\n\nSincerely,\n${DEMO_USER.fullName}`, DEMO_USER);
          return false;
        } catch (e) {
          return e instanceof PiiLeakError;
        }
      })(),
    );

    section("13. Legitimate call must not be flagged");
    const legit = getScenario("pharmacy_legit")!;
    const legitEvent = {
      id: randomUUID(), userId: DEMO_USER.userId, channel: legit.channel,
      fromIdentifier: legit.fromIdentifier, fromDisplayName: legit.fromDisplayName,
      receivedAt: new Date().toISOString(),
    };
    db.insertInboundEvent(legitEvent);
    const legitTranscript: ScreeningTurn[] = legit.callerScript.map((text, i) => ({
      speaker: "caller" as const, text, at: new Date(Date.now() + i * 1000).toISOString(),
    }));
    const legitVerdict = await analyzeVerdict(legitEvent, legitTranscript);
    check(
      "a real pharmacy call is NOT classified as a scam",
      legitVerdict.label !== "scam",
      `got "${legitVerdict.label}" — the screening prompt is over-triggering`,
    );
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`Phase B threw: ${msg}`);
    console.log(`\n  \x1b[31m✗ Phase B threw an exception\x1b[0m\n      ${msg}`);
  }
}

// ---------------------------------------------------------------------------

try {
  rmSync(TEST_DB);
} catch {
  /* fine */
}

console.log(`\n${"─".repeat(60)}`);
if (failed === 0) {
  console.log(`\x1b[32m\x1b[1m✓ ${passed} checks passed.\x1b[0m\n`);
  process.exit(0);
} else {
  console.log(`\x1b[31m\x1b[1m✗ ${failed} failed, ${passed} passed.\x1b[0m\n`);
  for (const f of failures) console.log(`  \x1b[31m•\x1b[0m ${f}`);
  console.log("");
  process.exit(1);
}
