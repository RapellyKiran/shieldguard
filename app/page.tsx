"use client";

import { useState } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Console } from "@/components/Console";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { CallScreen } from "@/components/screens/CallScreen";
import { VerdictScreen } from "@/components/screens/VerdictScreen";
import { LetterScreen } from "@/components/screens/LetterScreen";
import { DeletionScreen } from "@/components/screens/DeletionScreen";
import { RecoveryScreen } from "@/components/screens/RecoveryScreen";
import { ErrorBanner } from "@/components/ui";
import { postMessage, useChannel, useDemo } from "@/lib/useDemo";

export default function Page() {
  const { state, patch, actions } = useDemo();
  const [refreshKey, setRefreshKey] = useState(0);

  // Caller lines arrive from the Scammer Console window. The phone is also the
  // authority on whether a call is live, so it answers a console that opened or
  // reloaded mid-call and missed `call_started`.
  useChannel((msg) => {
    if (msg.kind === "caller_line") {
      void actions.addCallerLine(msg.text);
    } else if (msg.kind === "state_request") {
      postMessage({
        kind: "call_state",
        active: state.callActive,
        fromIdentifier: state.event?.fromIdentifier,
        fromDisplayName: state.event?.fromDisplayName,
        agentLines: state.transcript.filter((t) => t.speaker === "agent").map((t) => t.text),
      });
    }
  });

  const bumpConsole = () => setRefreshKey((k) => k + 1);

  const dismissError = () => patch({ error: null });

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 lg:flex-row">
        <div className="flex flex-col items-center gap-3">
          <PhoneFrame screen={state.screen} onNavigate={actions.go}>
            {state.screen === "home" && (
              <HomeScreen state={state} onStart={(id) => void actions.startCall(id)} />
            )}
            {state.screen === "call" && (
              <CallScreen
                state={state}
                onEnd={() => void actions.endCall().then(bumpConsole)}
                onScreenAnyway={() => void actions.screenAnyway()}
                onDismissError={dismissError}
              />
            )}
            {state.screen === "verdict" && (
              <VerdictScreen
                state={state}
                onAnalyze={() => void actions.analyze()}
                onDraft={() => void actions.draftLetter()}
                onDismissError={dismissError}
              />
            )}
            {state.screen === "letter" && (
              <LetterScreen
                state={state}
                onSend={() => void actions.sendLetter().then(bumpConsole)}
                onDismissError={dismissError}
              />
            )}
            {state.screen === "deletion" && <DeletionScreen />}
            {state.screen === "recovery" && <RecoveryScreen />}
          </PhoneFrame>

          <a
            href="/scammer"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            Open Scammer Console ↗
          </a>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header>
            <h1 className="text-xl font-semibold text-white">ShieldGuard operations</h1>
            <p className="text-sm text-zinc-500">
              Shared intelligence, evidence integrity, and the enforcement export.
            </p>
          </header>

          {state.error && state.screen === "home" && (
            <ErrorBanner message={state.error} onDismiss={dismissError} />
          )}

          <Console refreshKey={refreshKey} onReset={() => void actions.reset().then(bumpConsole)} />
        </div>
      </div>
    </main>
  );
}
