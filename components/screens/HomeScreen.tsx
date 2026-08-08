"use client";

import { Badge, Card, Field } from "../ui";
import type { DemoState } from "@/lib/useDemo";

export function HomeScreen({
  state,
  onStart,
}: {
  state: DemoState;
  onStart: (scenarioId: string) => void;
}) {
  const { identity, shielded } = state;
  if (!identity || !shielded) return <p className="pt-8 text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4 pt-3">
      <header>
        <h1 className="text-2xl font-semibold text-white">ShieldGuard</h1>
        <p className="text-sm text-zinc-500">Screening, evidence, and enforcement.</p>
      </header>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛡</span>
          <div>
            <p className="font-semibold text-emerald-300">Protection active</p>
            <p className="text-xs text-emerald-400/70">
              Calls, texts, and email are being screened.
            </p>
          </div>
        </div>
      </div>

      <Card title="Your digital ID">
        <p className="mb-3 text-xs leading-relaxed text-zinc-500">
          This is what scammers buy. It stays on your device — outbound
          correspondence uses your claim ID instead.
        </p>
        <div className="divide-y divide-zinc-800">
          <Field label="Name" value={identity.fullName} />
          <Field label="Email" value={identity.email} />
          <Field label="Phone" value={identity.phone} />
          <Field label="State" value={identity.stateOfResidence} />
          <Field
            label="Do Not Call"
            value={
              identity.onDncRegistry ? (
                <Badge tone="good">Registered {identity.dncRegistrationDate}</Badge>
              ) : (
                <Badge tone="warn">Not registered</Badge>
              )
            }
          />
        </div>
      </Card>

      <Card title="Public identity">
        <div className="divide-y divide-zinc-800">
          <Field label="Claim ID" value={<code className="text-sky-300">{shielded.claimId}</code>} />
          <Field
            label="Reply address"
            value={<code className="text-[11px] text-sky-300">{shielded.proxyReplyAddress}</code>}
          />
          <Field label="Phone shown" value={`••• ••• ${shielded.phoneLast4}`} />
        </div>
      </Card>

      <Card title="Simulate an inbound contact">
        <p className="mb-3 text-xs text-zinc-500">
          Pick a scenario, or drive the caller live from the Scammer Console.
        </p>
        <div className="space-y-1.5">
          {state.scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => onStart(s.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left transition hover:border-zinc-700 hover:bg-zinc-800"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{s.label}</p>
                <p className="truncate text-[11px] text-zinc-500">
                  {s.channel} · {s.fromIdentifier}
                </p>
              </div>
              <Badge
                tone={s.expected === "scam" ? "bad" : s.expected === "legitimate" ? "good" : "warn"}
              >
                {s.expected}
              </Badge>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
