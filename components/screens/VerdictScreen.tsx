"use client";

import { Badge, Button, Card, ErrorBanner, Field, Spinner, verdictTone } from "../ui";
import { formatUsd } from "@/lib/damages";
import type { DemoState } from "@/lib/useDemo";

export function VerdictScreen({
  state,
  onAnalyze,
  onDraft,
  onDismissError,
}: {
  state: DemoState;
  onAnalyze: () => void;
  onDraft: () => void;
  onDismissError: () => void;
}) {
  const { verdict, evidence, campaign, corroboratingReports, chainValid, analysis, damages, busy, error } = state;

  if (!verdict || !evidence) {
    return <p className="pt-8 text-sm text-zinc-500">No verdict yet.</p>;
  }

  return (
    <div className="space-y-4 pt-3">
      <div
        className={`rounded-xl border p-4 ${
          verdict.label === "scam"
            ? "border-rose-500/40 bg-rose-500/10"
            : verdict.label === "suspicious"
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-emerald-500/40 bg-emerald-500/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xl font-semibold capitalize text-white">{verdict.label}</p>
          <Badge tone={verdictTone(verdict.label)}>
            {(verdict.confidence * 100).toFixed(0)}% confidence
          </Badge>
        </div>
        {verdict.scamType && (
          <p className="mt-0.5 text-xs uppercase tracking-wide text-zinc-400">{verdict.scamType}</p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{verdict.summary}</p>
      </div>

      {verdict.redFlags.length > 0 && (
        <Card title={`Red flags (${verdict.redFlags.length})`}>
          <ul className="space-y-2.5">
            {verdict.redFlags.map((f, i) => (
              <li key={i} className="border-l-2 border-rose-500/40 pl-3">
                <p className="text-xs font-semibold text-rose-300">{f.label}</p>
                <p className="mt-0.5 text-xs italic leading-relaxed text-zinc-400">“{f.quote}”</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Evidence record">
        <div className="divide-y divide-zinc-800">
          <Field
            label="Integrity"
            value={
              chainValid ? (
                <Badge tone="good">Chain verified</Badge>
              ) : (
                <Badge tone="bad">Chain broken</Badge>
              )
            }
          />
          <Field
            label="SHA-256"
            value={<code className="text-[10px] text-zinc-400">{evidence.hash.slice(0, 24)}…</code>}
          />
          <Field label="Captured" value={new Date(evidence.capturedAt).toLocaleString()} />
        </div>
      </Card>

      {campaign && (
        <Card
          title="Shared scammer database"
          action={<Badge tone={campaign.tier === "reported" ? "neutral" : "bad"}>{campaign.tier}</Badge>}
        >
          {corroboratingReports > 0 ? (
            <p className="text-sm leading-relaxed text-amber-200">
              This script has hit{" "}
              <strong className="text-amber-100">
                {corroboratingReports} other {corroboratingReports === 1 ? "user" : "users"}
              </strong>{" "}
              in the network.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-zinc-400">
              First report of this campaign. Held as <code className="text-zinc-300">reported</code>{" "}
              — not exported until another user independently corroborates it.
            </p>
          )}
          <div className="mt-2 divide-y divide-zinc-800">
            <Field label="Reporters" value={campaign.reporterCount} />
            {campaign.claimedEntity && <Field label="Claims to be" value={campaign.claimedEntity} />}
            {campaign.callbackNumbers.length > 0 && (
              <Field label="Callback" value={campaign.callbackNumbers.join(", ")} />
            )}
          </div>
        </Card>
      )}

      {error && <ErrorBanner message={error} onDismiss={onDismissError} />}
      {busy && <Spinner label={busy} />}

      {!analysis && !busy && verdict.label !== "legitimate" && (
        <Button full onClick={onAnalyze}>
          Check for FTC &amp; TCPA violations
        </Button>
      )}

      {analysis && (
        <Card title="Violation analysis">
          <div className="space-y-3">
            {analysis.violations.map((v, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">{v.provision}</p>
                  <Badge tone={v.privateRightOfAction ? "bad" : "info"}>
                    {v.privateRightOfAction ? "can sue" : v.enforcementChannel ?? "regulator"}
                  </Badge>
                </div>
                <code className="text-[11px] text-sky-300">{v.citation}</code>
                <ul className="mt-1.5 space-y-0.5">
                  {v.elementsMet.map((e, j) => (
                    <li key={j} className="text-[11px] text-zinc-500">
                      ✓ {e}
                    </li>
                  ))}
                </ul>
                {v.privateRightOfAction && (
                  <p className="mt-1.5 text-[11px] text-zinc-400">
                    {formatUsd(v.damagesLow)}–{formatUsd(v.damagesHigh)} per violation
                  </p>
                )}
              </div>
            ))}
          </div>

          {damages && damages.breakdown.length > 0 && (
            <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-sky-400/70">
                Statutory exposure — computed, not estimated
              </p>
              {damages.breakdown.map((b, i) => (
                <p key={i} className="mt-1 text-[11px] text-sky-200/80">
                  {b.citation}: {b.contactCount} × {formatUsd(b.perViolationHigh)} ={" "}
                  {formatUsd(b.subtotalHigh)}
                </p>
              ))}
              <p className="mt-2 text-2xl font-semibold text-sky-200">{formatUsd(damages.high)}</p>
            </div>
          )}

          {analysis.regulatorReferrals.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              {analysis.regulatorReferrals.length} further violation(s) carry no private right of
              action. Those are packaged for the FTC and the California Attorney General instead.
            </p>
          )}

          {analysis.notes && (
            <p className="mt-2 text-[11px] italic leading-relaxed text-zinc-500">{analysis.notes}</p>
          )}

          {!busy && damages && damages.high > 0 && (
            <div className="mt-3">
              <Button full onClick={onDraft}>
                Draft demand letter
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
