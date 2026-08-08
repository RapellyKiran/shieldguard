"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBanner, Spinner } from "../ui";
import type { DataBroker, DeletionRequest } from "@/lib/types";

interface Ranked {
  registrationId: string;
  likelihood: number;
  rationale: string;
  broker: DataBroker;
}

export function DeletionScreen() {
  const [brokers, setBrokers] = useState<DataBroker[]>([]);
  const [ranked, setRanked] = useState<Ranked[] | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/deletion")
      .then((r) => r.json())
      .then((d) => setBrokers(d.brokers ?? []))
      .catch(() => setError("Could not load the broker registry."));
  }, []);

  const call = useCallback(async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const assess = async () => {
    const data = await call({ action: "assess" }, "Checking the registry…");
    if (data) {
      setRanked(data.ranked ?? []);
      setSummary(data.summary ?? "");
    }
  };

  const fileDrop = async () => {
    const likely = (ranked ?? []).filter((r) => r.likelihood >= 0.5).map((r) => r.registrationId);
    const data = await call(
      { action: "drop", brokerIds: likely.length > 0 ? likely : undefined },
      "Preparing DROP submission…",
    );
    if (data) setRequest(data.request);
  };

  return (
    <div className="space-y-4 pt-3">
      <header>
        <h2 className="text-lg font-semibold text-white">Shrink your attack surface</h2>
        <p className="text-xs leading-relaxed text-zinc-500">
          Scammers do not guess your number. They buy it.
        </p>
      </header>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
        <div className="flex items-start gap-2">
          <span className="text-lg">📅</span>
          <div>
            <p className="text-sm font-semibold text-sky-200">New as of August 1, 2026</p>
            <p className="mt-1 text-[11px] leading-relaxed text-sky-300/80">
              Under California&apos;s DELETE Act, registered data brokers must now check the state
              DROP platform every <strong>45 days</strong> and delete your data within{" "}
              <strong>90 days</strong> of a request.
            </p>
          </div>
        </div>
      </div>

      <Card title={`Registered brokers (${brokers.length})`}>
        {!ranked && (
          <>
            <p className="mb-3 text-xs leading-relaxed text-zinc-500">
              Rank which brokers are most likely holding your phone number.
            </p>
            <Button full onClick={assess} disabled={Boolean(busy)}>
              Check the registry
            </Button>
          </>
        )}

        {busy && (
          <div className="mt-2">
            <Spinner label={busy} />
          </div>
        )}

        {summary && <p className="mb-3 text-xs leading-relaxed text-zinc-400">{summary}</p>}

        {ranked && (
          <ul className="space-y-1.5">
            {ranked.map((r) => (
              <li
                key={r.registrationId}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">{r.broker.name}</p>
                  <Badge
                    tone={r.likelihood >= 0.7 ? "bad" : r.likelihood >= 0.4 ? "warn" : "neutral"}
                  >
                    {(r.likelihood * 100).toFixed(0)}%
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{r.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {ranked && !request && (
        <Button variant="success" full onClick={fileDrop} disabled={Boolean(busy)}>
          Prepare deletion request
        </Button>
      )}

      {request && (
        <Card title="Ready to submit" action={<Badge tone="good">prepared</Badge>}>
          <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
            DROP verifies your identity itself, so we prepare the request and you submit it — we
            never hold your verification credentials.
          </p>
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">
            {request.content}
          </pre>
          {request.portalUrl && (
            <a
              href={request.portalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block rounded-lg bg-sky-500 px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-sky-400"
            >
              Open {request.portalUrl.replace("https://", "")} ↗
            </a>
          )}
        </Card>
      )}
    </div>
  );
}
