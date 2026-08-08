"use client";

import { Badge, Button, Card, ErrorBanner, Spinner } from "../ui";
import { formatUsd } from "@/lib/damages";
import type { DemoState } from "@/lib/useDemo";

export function LetterScreen({
  state,
  onSend,
  onDismissError,
}: {
  state: DemoState;
  onSend: () => void;
  onDismissError: () => void;
}) {
  const { letter, letterSent, busy, error } = state;

  if (!letter) return <p className="pt-8 text-sm text-zinc-500">No letter drafted.</p>;

  return (
    <div className="space-y-4 pt-3">
      <header>
        <h2 className="text-lg font-semibold text-white">Demand letter</h2>
        <p className="text-xs text-zinc-500">
          Sent by you, in your name. Review it before anything leaves your phone.
        </p>
      </header>

      {/*
        The centerpiece. Everything else in the app is plumbing; this panel is
        the argument — an enforcement action that costs the sender nothing in
        privacy.
      */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
            They will see
          </p>
          <ul className="space-y-1">
            {letter.disclosedFields.map((f) => (
              <li key={f} className="text-[11px] leading-tight text-amber-200">
                • {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
            Never leaves your phone
          </p>
          <ul className="space-y-1">
            {letter.withheldFields.map((f) => (
              <li key={f} className="text-[11px] leading-tight text-emerald-200">
                • {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Demand</span>
          <span className="text-xl font-semibold text-white">{formatUsd(letter.demandAmount)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-zinc-500">Response window</span>
          <span className="text-zinc-300">{letter.cureWindowDays} days</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {letter.citations.map((c) => (
            <Badge key={c} tone="info">
              {c}
            </Badge>
          ))}
        </div>
      </Card>

      <Card title="Letter" action={<Badge tone="neutral">{letter.claimId}</Badge>}>
        <p className="mb-2 text-xs font-medium text-zinc-400">{letter.subject}</p>
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-sans text-[11px] leading-relaxed text-zinc-300">
          {letter.body}
        </pre>
      </Card>

      {error && <ErrorBanner message={error} onDismiss={onDismissError} />}
      {busy && <Spinner label={busy} />}

      {letterSent ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
          <p className="text-2xl">📨</p>
          <p className="mt-1 font-semibold text-emerald-300">Sent</p>
          <p className="mt-1 text-xs text-emerald-400/70">
            Delivered from {letter.claimId}@claims.shieldguard.app — check the recipient inbox on
            the console.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Nothing is sent without your approval. Your identity is held in escrow and released
            only if you sign a settlement agreement.
          </p>
          <Button variant="success" full onClick={onSend} disabled={Boolean(busy)}>
            Approve &amp; send
          </Button>
        </div>
      )}
    </div>
  );
}
