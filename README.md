# ShieldGuard

A carrier- and OS-independent anti-scam layer tied to a person's digital ID (name, email, phone). Built for the Claude Community Impact Lab, Los Angeles.

Four capabilities on one spine:

1. **Screen** — an AI agent answers unknown calls, talks to the caller, and decides whether they are legitimate.
2. **Capture** — the conversation becomes a hash-chained evidence record, pooled into a shared scammer database across users.
3. **Enforce** — evidence is matched against FTC/TCPA rules, producing a demand letter the consumer sends *without disclosing any personal information*.
4. **Prevent** — California DELETE Act deletion requests shrink the attack surface. The DROP broker-compliance deadline was August 1, 2026.

## Quick start

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Open <http://localhost:3000> for the phone frame plus operations console, and
<http://localhost:3000/scammer> in a second window — a teammate types there as the
caller, and the two windows talk over `BroadcastChannel` (no server round-trip).

Without `ANTHROPIC_API_KEY` the pages render and the offline invariants still run,
but every screening, analysis, and drafting action fails with a visible error
banner: the agents are the product.

## Scripts

```bash
npm run dev          # localhost:3000  (+ /scammer for the second screen)
npm run demo:check   # 45 offline invariant checks; add the API key for the live spine
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

`demo:check` has two phases. Phase A is offline and always runs — PII shielding,
damages arithmetic, hash-chain integrity, campaign fingerprinting, export
filtering. Phase B needs the API key and exercises the real model spine:
triage → verdict → ingest → violations → letter → leak scan.

Reset demo state with the "Reset demo" button in the console, or `rm shieldguard.json`.

## Demo path

1. Pick a scenario on the phone's Shield tab (or drive the caller live from `/scammer`).
2. Converse as the caller; the screening agent replies over SSE.
3. End the call → analyze → draft the demand letter → approve.
4. The letter lands in the Console's "Recipient Inbox" tab, addressed from a claim
   ID rather than a person.

Eight seeded scenarios include one legitimate call (pharmacy refill) and one
ambiguous one (debt collector) — the screening agent is supposed to get those right too.

## Architecture

```
lib/
  types.ts          Integration contract. Change here first.
  db.ts             JSON-file store
  evidence.ts       Canonical JSON + SHA-256 hash chain
  fingerprint.ts    5-word shingles + Jaccard clustering, confidence tiers
  shield.ts         PII shield: ShieldedIdentity derivation + leak scanner
  damages.ts        Statutory damages arithmetic — in code, never model-generated
  ingest.ts         Screening → evidence → campaign folding
  anthropic.ts      Client + per-agent effort/token config
  useDemo.ts        Client-side orchestration hook + BroadcastChannel
  rules/index.ts    TCPA / FTC TSR / CAN-SPAM / CA rule corpus
  agents/           triage, screener, violations, letter, deletion, recovery
app/
  page.tsx          Phone frame (left) + ops console (right)
  scammer/page.tsx  Second screen — a teammate types as the caller
  api/              13 route handlers
components/         PhoneFrame, ui primitives, 6 screens, Console
data/
  seed.ts           8 scam scenarios (incl. 1 legitimate, 1 ambiguous)
  brokers.ts        12 FICTIONAL data brokers
scripts/
  demo-check.mts    Phase A (offline) + Phase B (live) verification
```

### Design decisions worth knowing

**The PII shield has two independent layers.** The letter agent is
*architecturally* incapable of leaking: it receives a `ShieldedIdentity` (claim ID,
proxy address, phone last-4, state, DNC status) and never sees the real name,
email, full phone, or address. `scanForLeaks()` then greps the generated output
against every representation of the real PII and hard-fails on a match. The second
layer should never fire — which is exactly why it exists, to catch a regression in
how the prompt is built.

**Damages are computed, not generated.** The violations agent decides *which*
statutes apply and why; `lib/damages.ts` does the multiplication. A model that
fumbles arithmetic in a document demanding money is a liability.

**Confidence tiers are the defamation guardrail.** `reported` (one unverified
user) is never exported or published. Filtering happens in
`getPublishableCampaigns()` at the query level, not in a component — so there is
no way to ship an unverified entry by rendering different UI.

**Private right of action is tracked per statute.** TCPA §227(b) and §227(c) have
one; the FTC TSR and CAN-SPAM do not. That asymmetry is why there are two
channels — consumer demand letters for TCPA, evidence packages to the FTC and
state AGs for the rest. `demo:check` asserts TSR findings are never marked
privately actionable.

**Storage is a JSON file, deliberately.** `lib/db.ts` started as SQLite via
`better-sqlite3`, whose prebuilt `darwin-arm64` binary segfaults on Node 22.1.0
(exit 139, no output — an ABI mismatch). A plain JSON store has no build step and
no native dependency, so it cannot fail differently on a teammate's laptop. Data
volumes here are dozens of records. The exported interface is unchanged, so
restoring SQLite later touches `lib/db.ts` only.

## Model notes

`claude-opus-5` throughout. Two traps handled in `lib/anthropic.ts`: thinking is on
by default, so `max_tokens` must cover thinking *plus* output; and assistant
prefill returns a 400, so response shape is constrained with structured outputs
instead.

## Before this touches a real user

- `data/brokers.ts` is **entirely fictional** by design. Naming a real company as a
  holder of someone's data is a factual claim we have not verified. Swap in the
  real registry from <https://cppa.ca.gov/data_broker_registry/> — the `DataBroker`
  type already matches its published fields.
- Letter delivery targets an in-app mock inbox. Wiring a real mail transport is a
  separate, deliberate decision.
- The DROP flow deliberately *prepares* a submission rather than auto-submitting:
  the CPPA platform verifies the consumer's own identity, and we should not hold
  those credentials.
