"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, tierTone } from "./ui";
import type { MockInboxMessage } from "@/lib/types";

interface ConsoleCampaign {
  id: string;
  tier: string;
  reporterCount: number;
  scamType?: string;
  claimedEntity?: string;
  callbackNumbers: string[];
  originatingIdentifiers: string[];
  redFlagCodes: string[];
  sampleQuotes: string[];
  publishable: boolean;
  evidenceIds: string[];
  lastSeenAt: string;
}

type Tab = "enforcement" | "inbox";

export function Console({ refreshKey, onReset }: { refreshKey: number; onReset: () => void }) {
  const [tab, setTab] = useState<Tab>("enforcement");
  const [internal, setInternal] = useState(true);
  const [campaigns, setCampaigns] = useState<ConsoleCampaign[]>([]);
  const [meta, setMeta] = useState<{ totalKnown: number; publishableCount: number; note: string } | null>(null);
  const [inbox, setInbox] = useState<MockInboxMessage[]>([]);
  const [openMessage, setOpenMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      fetch(`/api/enforcement${internal ? "?view=internal" : ""}`).then((r) => r.json()),
      fetch("/api/inbox").then((r) => r.json()),
    ]);
    setCampaigns(c.campaigns ?? []);
    setMeta({ totalKnown: c.totalKnown, publishableCount: c.publishableCount, note: c.note });
    setInbox(i.messages ?? []);
  }, [internal]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // The demo moves fast; poll so the console never shows stale state on screen.
  useEffect(() => {
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {(["enforcement", "inbox"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition ${
                tab === t ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "inbox" ? `Recipient inbox${inbox.length ? ` (${inbox.length})` : ""}` : "Enforcement console"}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={onReset}>
          Reset demo
        </Button>
      </header>

      {tab === "enforcement" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Campaigns tracked" value={meta?.totalKnown ?? 0} />
            <Stat label="Cleared for export" value={meta?.publishableCount ?? 0} tone="good" />
            <Stat
              label="Held (uncorroborated)"
              value={(meta?.totalKnown ?? 0) - (meta?.publishableCount ?? 0)}
              tone="warn"
            />
          </div>

          <Card
            title="Shared scammer database"
            action={
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                    className="accent-sky-500"
                  />
                  internal view
                </label>
                <a
                  href="/api/enforcement?format=csv"
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-[11px] font-medium text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700"
                >
                  Export CSV ↓
                </a>
              </div>
            }
          >
            {meta && <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">{meta.note}</p>}

            {campaigns.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-600">
                No campaigns yet. Screen a call to populate the database.
              </p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 ${
                      c.publishable
                        ? "border-zinc-700 bg-zinc-900"
                        : "border-dashed border-zinc-800 bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {c.claimedEntity ?? "Unidentified operator"}
                          {c.scamType && (
                            <span className="ml-2 text-xs font-normal text-zinc-500">
                              {c.scamType}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                          {c.originatingIdentifiers.join(", ")}
                          {c.callbackNumbers.length > 0 && ` · callback ${c.callbackNumbers.join(", ")}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone="info">
                          {c.reporterCount} {c.reporterCount === 1 ? "reporter" : "reporters"}
                        </Badge>
                        <Badge tone={tierTone(c.tier)}>{c.tier}</Badge>
                      </div>
                    </div>

                    {c.redFlagCodes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.redFlagCodes.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {!c.publishable && (
                      <p className="mt-2 text-[10px] italic text-amber-400/70">
                        Single reporter — withheld from export until independently corroborated.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <p className="text-[11px] leading-relaxed text-zinc-600">
            Export feeds consumer-protection attorneys, state AGs, and the FTC. Uncorroborated
            single-reporter entries are filtered out in the query, not the view — there is no way to
            ship one by rendering a different component.
          </p>
        </>
      )}

      {tab === "inbox" && (
        <Card title="Recipient inbox — the scammer's side">
          {inbox.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-600">
              Nothing delivered yet. Approve a demand letter to see it land here.
            </p>
          ) : (
            <div className="space-y-2">
              {inbox.map((m) => (
                <div key={m.id} className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                  <button
                    onClick={() => setOpenMessage(openMessage === m.id ? null : m.id)}
                    className="w-full text-left"
                  >
                    <p className="text-sm font-medium text-zinc-100">{m.subject}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      From <code className="text-sky-300">{m.from}</code> · to {m.to} ·{" "}
                      {new Date(m.receivedAt).toLocaleTimeString()}
                    </p>
                  </button>
                  {openMessage === m.id && (
                    <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-sans text-[11px] leading-relaxed text-zinc-300">
                      {m.body}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
            Note the sender address: a claim ID, not a person. That is the whole point.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "warn";
}) {
  const colors = {
    neutral: "text-zinc-100",
    good: "text-emerald-300",
    warn: "text-amber-300",
  };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}
