import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAllCampaigns, insertInboundEvent } from "@/lib/db";
import { triage } from "@/lib/agents/triage";
import { getScenario, DEMO_USER } from "@/data/seed";
import type { InboundEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A contact arrives. Create the event, run triage, hand back the decision.
 *
 * Accepts either a seeded scenario id, or a fully custom contact typed into the
 * scammer console.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId: string = body.userId ?? DEMO_USER.userId;

    let event: InboundEvent;

    if (body.scenarioId) {
      const scenario = getScenario(body.scenarioId);
      if (!scenario) {
        return NextResponse.json({ error: `Unknown scenario "${body.scenarioId}"` }, { status: 400 });
      }
      event = {
        id: randomUUID(),
        userId,
        channel: scenario.channel,
        fromIdentifier: scenario.fromIdentifier,
        fromDisplayName: scenario.fromDisplayName,
        body: scenario.body,
        receivedAt: new Date().toISOString(),
      };
    } else {
      if (!body.fromIdentifier) {
        return NextResponse.json({ error: "fromIdentifier is required" }, { status: 400 });
      }
      event = {
        id: randomUUID(),
        userId,
        channel: body.channel ?? "call",
        fromIdentifier: body.fromIdentifier,
        fromDisplayName: body.fromDisplayName,
        body: body.body,
        subject: body.subject,
        receivedAt: new Date().toISOString(),
      };
    }

    insertInboundEvent(event);
    const result = await triage(event, getAllCampaigns());

    return NextResponse.json({ event, triage: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
