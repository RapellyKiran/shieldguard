import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getEscrowedIdentity, getLetter, insertMockInboxMessage, markLetterSent } from "@/lib/db";
import { findLeaks } from "@/lib/shield";
import { DEMO_USER } from "@/data/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The human approval gate.
 *
 * Nothing reaches a recipient without an explicit user action landing here. The
 * leak scan runs a second time at this boundary: generation-time scanning is
 * the primary check, but this is the last point at which we can still refuse,
 * and a document that was edited between generation and send would otherwise
 * bypass the first one.
 *
 * Delivery targets the in-app mock inbox. Wiring this to a real mail transport
 * is a deliberate, separate decision — see README.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId: string = body.userId ?? DEMO_USER.userId;

    if (body.approved !== true) {
      return NextResponse.json(
        { error: "Letters are only sent on explicit user approval." },
        { status: 400 },
      );
    }

    const letter = getLetter(body.letterId);
    if (!letter) return NextResponse.json({ error: "Unknown letterId" }, { status: 404 });

    const identity = getEscrowedIdentity(userId);
    if (identity) {
      const leaks = findLeaks(letter.body, identity);
      if (leaks.length > 0) {
        return NextResponse.json(
          {
            error: `Blocked at the send gate: the document contains ${leaks.join(", ")}.`,
            kind: "pii_leak",
            leaks,
          },
          { status: 422 },
        );
      }
    }

    const now = new Date().toISOString();
    const message = {
      id: randomUUID(),
      to: letter.recipientContact,
      from: `${letter.claimId}@claims.shieldguard.app`,
      subject: letter.subject,
      body: letter.body,
      receivedAt: now,
    };

    insertMockInboxMessage(message);
    markLetterSent(letter.id, now, now);

    return NextResponse.json({ ok: true, message, sentAt: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
