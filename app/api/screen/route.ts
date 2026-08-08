import { getInboundEvent } from "@/lib/db";
import { streamScreeningTurn, OPENING_LINE } from "@/lib/agents/screener";
import type { ScreeningTurn } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream the screening agent's next spoken turn as SSE.
 *
 * The very first turn is the fixed opening line rather than a model call: the
 * California recording disclosure has to be verbatim every time, and there is
 * no reason to pay latency for a sentence that must not vary.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const event = getInboundEvent(body.eventId);

  if (!event) {
    return new Response(JSON.stringify({ error: "Unknown eventId" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const transcript: ScreeningTurn[] = body.transcript ?? [];
  const encoder = new TextEncoder();

  // Turn zero: the mandatory disclosure, streamed word by word so the UI
  // renders it the same way as a model turn.
  if (transcript.length === 0) {
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        for (const word of OPENING_LINE.split(" ")) {
          send({ type: "delta", text: word + " " });
          await new Promise((r) => setTimeout(r, 28));
        }
        send({ type: "done", text: OPENING_LINE });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const modelStream = streamScreeningTurn(event, transcript);
        modelStream.on("text", (delta) => send({ type: "delta", text: delta }));

        const final = await modelStream.finalMessage();
        const text = final.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim();

        send({ type: "done", text });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
