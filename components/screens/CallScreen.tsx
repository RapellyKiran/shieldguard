"use client";

import { useEffect, useRef } from "react";
import { Badge, Button, ErrorBanner, Spinner } from "../ui";
import type { DemoState } from "@/lib/useDemo";

export function CallScreen({
  state,
  onEnd,
  onScreenAnyway,
  onDismissError,
}: {
  state: DemoState;
  onEnd: () => void;
  onScreenAnyway: () => void;
  onDismissError: () => void;
}) {
  const { event, triage, transcript, streaming, busy, error, callActive } = state;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length, streaming]);

  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-1 text-center">
        <span className="text-4xl">☎</span>
        <p className="text-sm text-zinc-500">No active call.</p>
        <p className="text-xs text-zinc-600">Start one from the Shield tab.</p>
        {/* Screening can fail before an event exists — surface it here, or the
            failure looks identical to never having started a call. */}
        {error && (
          <div className="w-full text-left">
            <ErrorBanner message={error} onDismiss={onDismissError} />
          </div>
        )}
      </div>
    );
  }

  const actionTone =
    triage?.action === "block" ? "bad" : triage?.action === "allow" ? "good" : "info";

  return (
    <div className="flex h-full flex-col pt-3">
      <header className="shrink-0 space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">
              {event.fromDisplayName ?? "Unknown caller"}
            </p>
            <p className="text-sm text-zinc-500">{event.fromIdentifier}</p>
          </div>
          {triage && <Badge tone={actionTone}>{triage.action}</Badge>}
        </div>

        {triage && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
            <p className="text-xs leading-relaxed text-zinc-400">{triage.reason}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">
              triage confidence {(triage.confidence * 100).toFixed(0)}%
              {triage.priorMatches.length > 0 &&
                ` · ${triage.priorMatches.length} prior match(es)`}
            </p>
          </div>
        )}
      </header>

      {triage?.action === "block" && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center">
          <p className="text-2xl">🚫</p>
          <p className="mt-1 font-semibold text-rose-300">Blocked before it rang</p>
          <p className="mt-1 text-xs text-rose-400/70">
            Matched a known campaign. Your phone never lit up.
          </p>
          {/* A blocked repeat caller is the one worth answering: § 227(c)(5)
              needs a second contact, and blocking forfeits it. The user makes
              that trade, not the triage agent. */}
          <p className="mt-3 text-[11px] leading-relaxed text-rose-200/60">
            Answering costs you nothing and gets the second contact enforcement needs.
          </p>
          <div className="mt-2">
            <Button variant="ghost" full onClick={onScreenAnyway} disabled={Boolean(busy)}>
              Screen it anyway — collect the evidence
            </Button>
          </div>
          {busy && (
            <div className="mt-2">
              <Spinner label={busy} />
            </div>
          )}
          {error && (
            <div className="mt-2 text-left">
              <ErrorBanner message={error} onDismiss={onDismissError} />
            </div>
          )}
        </div>
      )}

      {triage?.action === "allow" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
          <p className="text-2xl">✅</p>
          <p className="mt-1 font-semibold text-emerald-300">Ringing through</p>
          <p className="mt-1 text-xs text-emerald-400/70">Recognized contact — no screening needed.</p>
        </div>
      )}

      {triage?.action === "screen" && (
        <>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-2">
            {transcript.map((turn, i) => (
              <Bubble key={i} speaker={turn.speaker} text={turn.text} />
            ))}
            {streaming && <Bubble speaker="agent" text={streaming} pending />}
            <div ref={endRef} />
          </div>

          <footer className="shrink-0 space-y-2 border-t border-zinc-800 pt-3">
            {error && <ErrorBanner message={error} onDismiss={onDismissError} />}
            {busy ? (
              <Spinner label={busy} />
            ) : (
              <p className="text-[11px] text-zinc-600">
                {callActive
                  ? "Waiting for the caller — type in the Scammer Console."
                  : "Call ended."}
              </p>
            )}
            <Button variant="danger" full onClick={onEnd} disabled={!callActive || Boolean(busy)}>
              End call &amp; analyze
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}

function Bubble({
  speaker,
  text,
  pending,
}: {
  speaker: "agent" | "caller";
  text: string;
  pending?: boolean;
}) {
  const isAgent = speaker === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isAgent
            ? "rounded-bl-sm bg-sky-500/15 text-sky-100 ring-1 ring-inset ring-sky-500/25"
            : "rounded-br-sm bg-zinc-800 text-zinc-200"
        } ${pending ? "opacity-80" : ""}`}
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-50">
          {isAgent ? "Screening agent" : "Caller"}
        </p>
        {text}
        {pending && <span className="ml-0.5 animate-pulse">▊</span>}
      </div>
    </div>
  );
}
