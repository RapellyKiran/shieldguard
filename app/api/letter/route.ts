import { NextResponse } from "next/server";
import { getClaimId, getEscrowedIdentity, getEvidence, insertLetter } from "@/lib/db";
import { generateDemandLetter } from "@/lib/agents/letter";
import { PiiLeakError, shieldIdentity } from "@/lib/shield";
import { DEMO_USER } from "@/data/seed";
import type { ViolationAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId: string = body.userId ?? DEMO_USER.userId;

    const evidence = getEvidence(body.evidenceId);
    if (!evidence) return NextResponse.json({ error: "Unknown evidenceId" }, { status: 404 });

    const analysis = body.analysis as ViolationAnalysis | undefined;
    if (!analysis) return NextResponse.json({ error: "analysis is required" }, { status: 400 });

    const identity = getEscrowedIdentity(userId);
    const claimId = getClaimId(userId);
    if (!identity || !claimId) {
      return NextResponse.json({ error: "No enrolled identity for this user" }, { status: 400 });
    }

    const letter = await generateDemandLetter({
      evidence,
      analysis,
      shielded: shieldIdentity(identity, claimId),
      // Passed for the post-generation leak scan ONLY — never enters the prompt.
      realIdentity: identity,
      cureWindowDays: body.cureWindowDays,
    });

    insertLetter(userId, evidence.id, letter);
    return NextResponse.json({ letter });
  } catch (err) {
    // A leak is not a generic 500. Surface it distinctly so the UI can show
    // that the shield fired rather than a vague failure.
    if (err instanceof PiiLeakError) {
      return NextResponse.json(
        { error: err.message, kind: "pii_leak", leaks: err.leaks },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
