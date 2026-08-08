import { NextResponse } from "next/server";
import { getInboundEvent } from "@/lib/db";
import { analyzeVerdict } from "@/lib/agents/screener";
import { ingestScreening } from "@/lib/ingest";
import { verifyChain } from "@/lib/evidence";
import { getEvidenceChain } from "@/lib/db";
import { DEMO_USER } from "@/data/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The call is over. Analyze it, write the evidence record, fold it into the
 * shared campaign database.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId: string = body.userId ?? DEMO_USER.userId;

    const event = getInboundEvent(body.eventId);
    if (!event) return NextResponse.json({ error: "Unknown eventId" }, { status: 404 });

    const verdict = await analyzeVerdict(event, body.transcript ?? []);
    const ingest = ingestScreening({
      userId,
      event,
      transcript: body.transcript ?? [],
      verdict,
    });

    // Verify the chain on every write. Cheap, and it means a corruption bug
    // surfaces at the moment it happens rather than during the demo.
    const chain = verifyChain(getEvidenceChain(userId));

    return NextResponse.json({
      verdict,
      evidence: ingest.evidence,
      campaign: ingest.campaign,
      isNewCampaign: ingest.isNewCampaign,
      matchBasis: ingest.matchBasis,
      matchSimilarity: ingest.matchSimilarity,
      corroboratingReports: ingest.corroboratingReports,
      chainValid: chain.valid,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
