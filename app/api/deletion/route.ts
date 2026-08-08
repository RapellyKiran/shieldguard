import { NextResponse } from "next/server";
import { getDeletionRequests, getEscrowedIdentity, insertDeletionRequest } from "@/lib/db";
import {
  assessBrokers,
  buildDropRequest,
  generateDirectRequest,
  DROP_ACCESS_INTERVAL_DAYS,
  DROP_DELETION_DEADLINE_DAYS,
  DROP_PORTAL_URL,
} from "@/lib/agents/deletion";
import { BROKERS, getBroker } from "@/data/brokers";
import { DEMO_USER } from "@/data/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    brokers: BROKERS,
    requests: getDeletionRequests(DEMO_USER.userId),
    drop: {
      portalUrl: DROP_PORTAL_URL,
      accessIntervalDays: DROP_ACCESS_INTERVAL_DAYS,
      deletionDeadlineDays: DROP_DELETION_DEADLINE_DAYS,
      effectiveSince: "2026-08-01",
    },
  });
}

/**
 * Actions:
 *   assess  — rank which brokers likely hold this consumer's data
 *   drop    — prepare a CPPA DROP submission (the consumer submits it)
 *   direct  — draft a CCPA deletion letter to one named broker
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId: string = body.userId ?? DEMO_USER.userId;

    const identity = getEscrowedIdentity(userId);
    if (!identity) {
      return NextResponse.json({ error: "No enrolled identity for this user" }, { status: 400 });
    }

    if (body.action === "assess") {
      const assessment = await assessBrokers(identity, BROKERS);
      const ranked = assessment.ranked
        .map((r) => ({ ...r, broker: getBroker(r.registrationId) }))
        .filter((r) => r.broker)
        .sort((a, b) => b.likelihood - a.likelihood);
      return NextResponse.json({ ...assessment, ranked });
    }

    if (body.action === "drop") {
      const brokerIds: string[] = body.brokerIds ?? BROKERS.map((b) => b.registrationId);
      const request = buildDropRequest(identity, brokerIds);
      insertDeletionRequest(request);
      return NextResponse.json({ request });
    }

    if (body.action === "direct") {
      const broker = getBroker(body.registrationId);
      if (!broker) return NextResponse.json({ error: "Unknown broker" }, { status: 404 });
      const request = await generateDirectRequest(identity, broker);
      insertDeletionRequest(request);
      return NextResponse.json({ request, broker });
    }

    return NextResponse.json(
      { error: `Unknown action "${body.action}". Expected assess | drop | direct.` },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
