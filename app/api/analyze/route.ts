import { NextResponse } from "next/server";
import { getClaimId, getEscrowedIdentity, getEvidence } from "@/lib/db";
import { analyzeViolations } from "@/lib/agents/violations";
import { countContacts } from "@/lib/ingest";
import { computeDamages } from "@/lib/damages";
import { shieldIdentity } from "@/lib/shield";
import { DEMO_USER } from "@/data/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId: string = body.userId ?? DEMO_USER.userId;

    const evidence = getEvidence(body.evidenceId);
    if (!evidence) return NextResponse.json({ error: "Unknown evidenceId" }, { status: 404 });

    const identity = getEscrowedIdentity(userId);
    const claimId = getClaimId(userId);
    if (!identity || !claimId) {
      return NextResponse.json({ error: "No enrolled identity for this user" }, { status: 400 });
    }

    // The analyst sees the shielded identity only. It needs jurisdiction and
    // DNC status to do its job; it does not need a name.
    const shielded = shieldIdentity(identity, claimId);

    // Contact count comes from our own evidence chain, not from the model.
    const contactCount = Math.max(1, countContacts(userId, evidence.fromIdentifier));
    const analysis = await analyzeViolations(evidence, shielded, contactCount);
    const damages = computeDamages(
      analysis.violations.filter((v) => v.privateRightOfAction),
      contactCount,
    );

    return NextResponse.json({ analysis, damages, contactCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
