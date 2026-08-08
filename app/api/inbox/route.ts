import { NextResponse } from "next/server";
import { getMockInbox } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The recipient's side of the demo — where an approved demand letter lands. */
export async function GET() {
  return NextResponse.json({ messages: getMockInbox() });
}
