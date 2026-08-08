"use client";

import { useEffect, useRef, useState } from "react";
import { postMessage, useChannel } from "@/lib/useDemo";
import { SCENARIOS } from "@/data/seed";

interface Line {
  speaker: "agent" | "caller";
  text: string;
}

/**
 * The second screen.
 *
 * A teammate drives the caller side from here while the phone screens the
 * call, so the agent's replies are genuinely improvised in front of the
 * audience rather than replayed from a script. Talks to the phone window over
 * BroadcastChannel — no server, no network dependency.
 */
export default function ScammerConsole() {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(false);
  const [caller, setCaller] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  useChannel((msg) => {
    if (msg.kind === "call_started") {
      setLines([]);
      setActive(true);
      setCaller(`${msg.fromDisplayName ?? "Unknown"} · ${msg.fromIdentifier}`);
    } else if (msg.kind === "call_ended") {
      setActive(false);
    } else if (msg.kind === "agent_line") {
      setLines((l) => [...l, { speaker: "agent", text: msg.text }]);
    } else if (msg.kind === "call_state") {
      // The phone's answer to our mount-time question. Adopt it wholesale:
      // this window may have opened late, and the phone is the authority.
      setActive(msg.active);
      setLines(msg.agentLines.map((text) => ({ speaker: "agent" as const, text })));
      setCaller(
        msg.fromIdentifier ? `${msg.fromDisplayName ?? "Unknown"} · ${msg.fromIdentifier}` : "",
      );
    }
  });

  // Ask the phone whether a call is already in progress. Opening this window
  // after the call started is the normal case on stage, not an edge case.
  useEffect(() => {
    postMessage({ kind: "state_request" });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !active) return;
    setLines((l) => [...l, { speaker: "caller", text: trimmed }]);
    postMessage({ kind: "caller_line", text: trimmed });
    setDraft("");
  };

  // Prompts from the seeded scripts, offered as one-click fallbacks in case
  // improvising under stage lights stops being fun.
  const suggestions = SCENARIOS.flatMap((s) => s.callerScript).filter(Boolean);

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-rose-300">Scammer Console</h1>
            <p className="text-sm text-zinc-500">
              You are the caller. Type what you would say; the screening agent responds live.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
              active
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40"
                : "bg-zinc-700/60 text-zinc-400 ring-zinc-600/40"
            }`}
          >
            {active ? "on the call" : "waiting"}
          </span>
        </header>

        {caller && (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
            Presenting as <span className="text-zinc-200">{caller}</span>
          </p>
        )}

        <div className="h-[380px] space-y-2.5 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {lines.length === 0 && (
            <p className="pt-24 text-center text-sm text-zinc-600">
              {active
                ? "The agent has answered. Say something."
                : "Start a call from the phone window to begin."}
            </p>
          )}
          {lines.map((l, i) => (
            <div key={i} className={`flex ${l.speaker === "agent" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  l.speaker === "agent"
                    ? "rounded-bl-sm bg-sky-500/15 text-sky-100 ring-1 ring-inset ring-sky-500/25"
                    : "rounded-br-sm bg-rose-500/15 text-rose-100 ring-1 ring-inset ring-rose-500/25"
                }`}
              >
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-50">
                  {l.speaker === "agent" ? "Screening agent" : "You (caller)"}
                </p>
                {l.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!active}
            placeholder={active ? "Say something as the caller…" : "Waiting for a call…"}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!active || !draft.trim()}
            className="rounded-lg bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-40"
          >
            Send
          </button>
        </form>

        <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-300">
            Scripted lines ({suggestions.length}) — if improvising stops being fun
          </summary>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                disabled={!active}
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-[11px] leading-relaxed text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}
