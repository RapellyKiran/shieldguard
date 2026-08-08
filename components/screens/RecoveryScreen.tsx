"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorBanner, Spinner } from "../ui";
import type { PaymentRail, RecoveryPlan } from "@/lib/types";

const RAILS: { id: PaymentRail; label: string }[] = [
  { id: "wire", label: "Wire transfer" },
  { id: "debit_card", label: "Debit card" },
  { id: "credit_card", label: "Credit card" },
  { id: "ach", label: "Bank transfer (ACH)" },
  { id: "p2p", label: "Zelle / Venmo / Cash App" },
  { id: "gift_card", label: "Gift cards" },
  { id: "crypto", label: "Crypto" },
  { id: "check", label: "Check" },
];

export function RecoveryScreen() {
  const [rail, setRail] = useState<PaymentRail>("wire");
  const [amount, setAmount] = useState("2500");
  const [hoursAgo, setHoursAgo] = useState("6");
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const occurredAt = new Date(Date.now() - Number(hoursAgo) * 3_600_000).toISOString();
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rail, amountLost: Number(amount), occurredAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setPlan(data.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-3">
      <header>
        <h2 className="text-lg font-semibold text-white">Money recovery</h2>
        <p className="text-xs leading-relaxed text-zinc-500">
          Some windows close in hours. Start with the one that closes first.
        </p>
      </header>

      <Card title="What happened">
        <label className="mb-1 block text-[11px] text-zinc-500">How the money moved</label>
        <select
          value={rail}
          onChange={(e) => setRail(e.target.value as PaymentRail)}
          className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
        >
          {RAILS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-zinc-500">Amount (USD)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-zinc-500">Hours ago</label>
            <input
              value={hoursAgo}
              onChange={(e) => setHoursAgo(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
        </div>

        <div className="mt-3">
          <Button full onClick={build} disabled={busy}>
            Build action plan
          </Button>
        </div>
      </Card>

      {busy && <Spinner label="Building your action plan…" />}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {plan && (
        <>
          {plan.steps.map((step) => (
            <div
              key={step.order}
              className={`rounded-xl border p-3 ${
                step.urgency === "critical"
                  ? "border-rose-500/40 bg-rose-500/10"
                  : step.urgency === "high"
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">
                  {step.order}. {step.title}
                </p>
                {step.hoursRemaining !== null && (
                  <Badge tone={step.urgency === "critical" ? "bad" : "warn"}>
                    {step.hoursRemaining <= 0 ? "closed" : `${step.hoursRemaining}h left`}
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{step.detail}</p>
              {step.contact && (
                <p className="mt-1 text-[11px] text-sky-300">{step.contact}</p>
              )}
              {step.basis && (
                <p className="mt-1 text-[10px] italic text-zinc-500">{step.basis}</p>
              )}
            </div>
          ))}

          <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-[10px] leading-relaxed text-zinc-500">
            {plan.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}
