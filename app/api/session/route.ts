import { NextResponse } from "next/server";
import { getClaimId, getEscrowedIdentity, resetDb, upsertUser } from "@/lib/db";
import { generateClaimId, shieldIdentity, disclosureBreakdown } from "@/lib/shield";
import { DEMO_USER, SCENARIOS } from "@/data/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ensureDemoUser() {
  let claimId = getClaimId(DEMO_USER.userId);
  if (!claimId) {
    claimId = generateClaimId();
    upsertUser(DEMO_USER, claimId);
  }
  return claimId;
}

export async function GET() {
  const claimId = ensureDemoUser();
  const identity = getEscrowedIdentity(DEMO_USER.userId)!;

  return NextResponse.json({
    // The full identity is returned here because this is the USER viewing their
    // own profile — the one context where it is theirs to see.
    identity,
    shielded: shieldIdentity(identity, claimId),
    disclosure: disclosureBreakdown(identity),
    scenarios: SCENARIOS.map((s) => ({
      id: s.id,
      label: s.label,
      channel: s.channel,
      fromIdentifier: s.fromIdentifier,
      fromDisplayName: s.fromDisplayName,
      expected: s.expected,
      hasScript: s.callerScript.length > 0,
    })),
  });
}

/** Wipe and reseed. Bound to a button so the demo can be re-run cleanly. */
export async function POST() {
  resetDb();
  const claimId = ensureDemoUser();
  return NextResponse.json({ ok: true, claimId });
}
