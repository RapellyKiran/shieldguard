import { NextResponse } from "next/server";
import { buildRecoveryPlan, RAIL_WINDOWS } from "@/lib/agents/recovery";
import type { PaymentRail } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rails: RAIL_WINDOWS });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rail = body.rail as PaymentRail;

    if (!rail || !(rail in RAIL_WINDOWS)) {
      return NextResponse.json(
        { error: `rail must be one of: ${Object.keys(RAIL_WINDOWS).join(", ")}` },
        { status: 400 },
      );
    }

    const plan = await buildRecoveryPlan({
      rail,
      amountLost: Number(body.amountLost ?? 0),
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      scamContext: body.scamContext,
    });

    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
