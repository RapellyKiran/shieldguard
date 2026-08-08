# ShieldGuard — Session Handoff

**Project:** Claude Community Impact Lab, Los Angeles — 4-person team.
**Location:** `/Users/krapelly/Kiran/Claude/ImpactLab_08082026/shieldguard`
**Approved plan:** `~/.claude/plans/i-am-at-claude-twinkly-kitten.md` (read this first — it has the full rationale, demo choreography, and work split).

---

## What this is

A carrier- and OS-independent anti-scam layer tied to a person's digital ID (name, email, phone). Four capabilities, wired into one demo spine:

1. **Screen** — an AI agent answers unknown calls, talks to the caller, and decides whether they're legitimate.
2. **Capture** — the conversation becomes a hash-chained evidence record, pooled into a shared scammer database across users.
3. **Enforce** — evidence is matched against FTC/TCPA rules, producing a demand letter the consumer sends *without disclosing any personal information*.
4. **Prevent** — California DELETE Act deletion requests shrink the attack surface. (The DROP broker-compliance deadline hit **August 1, 2026**, eight days before the event — this is the timely hook.)

---

## Status

### Working and verified

| Area | Evidence |
|---|---|
| TypeScript compiles | `npm run typecheck` — 0 errors |
| Production build | `npm run build` — succeeds, 13 routes registered |
| Offline safety invariants | `npm run demo:check` — **45/45 checks pass** |
| API runtime | `curl` against `/api/session`, `/api/enforcement`, `/api/inbox` — all return valid JSON |
| Pages render | `/` and `/scammer` both HTTP 200, no server errors in the dev log |
| Browser: page paint | `/` renders phone frame + console, 8 scenarios listed, zero console errors |
| Browser: console tabs | Enforcement Console ↔ Recipient Inbox switch, both render empty states |
| Browser: BroadcastChannel | Verified **both directions** — `call_started` from the phone flips `/scammer` to "on the call" and enables its input; `caller_line` from `/scammer` arrives at the phone window |
| Error surfacing | A screening failure now renders a banner on the call screen (was silently swallowed — see below) |

### Not yet done — read this before you demo

**1. No model call has ever executed.** `ANTHROPIC_API_KEY` has never been set in this environment, so Phase B of `demo:check` has never run. Every agent system prompt in `lib/agents/` is written but **completely unvalidated**. This is the single biggest open risk and the first thing to do next session. It also blocks items 2–4 below, which all begin with a model call.

**2. Model-dependent click-through is still unverified.** Everything that does not call a model has now been exercised in a browser (see the table above). Still untested, because the first action in each path is a model call:
- SSE streaming of the screening transcript (`/api/screen` → `useDemo.runAgentTurn`)
- The full click-through: start call → converse → end call → analyze → draft letter → approve → land in mock inbox
- The Privacy (deletion) and Recover screens

**3. Committed.** README written; the working tree is committed on `main`.

---

## Architecture

```
lib/
  types.ts          Frozen integration contract. Change here first.
  db.ts             JSON-file store (see "Storage decision" below)
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

### The four load-bearing design decisions

**PII shield — two independent layers.** The letter agent is *architecturally* incapable of leaking: it receives a `ShieldedIdentity` (claim ID, proxy address, phone last-4, state, DNC status) and never sees the real name, email, full phone, or address. `scanForLeaks()` then greps the generated output against every representation of the real PII and hard-fails if any appear. The second layer should never fire — which is exactly why it must exist, to catch a regression in how the prompt is built.

**Damages are computed, not generated.** The violations agent decides *which* statutes apply and *why*; `lib/damages.ts` does the multiplication. A model that fumbles arithmetic in a document demanding money is a liability.

**Confidence tiers are the defamation guardrail.** `reported` (one unverified user) is never exported or published. Filtering happens in `getPublishableCampaigns()` at the query level, not in a component — so there's no way to ship an unverified entry by rendering different UI.

**Private right of action is tracked per statute.** TCPA §227(b) and §227(c) have one; the FTC TSR and CAN-SPAM do not. That asymmetry is why the product has two channels — consumer demand letters for TCPA, evidence packages to FTC/state AG for the rest. `demo:check` asserts TSR findings are never marked privately actionable.

### Storage decision

`lib/db.ts` was originally SQLite via `better-sqlite3`. Its prebuilt `darwin-arm64` binary **segfaults on Node 22.1.0** (exit 139, no error output — an ABI mismatch). Rather than require every teammate to get native build tools working, it was replaced with a plain JSON file store: no build step, no native dependency, no way to fail differently on someone else's laptop. Data volumes here are dozens of records.

The exported interface is unchanged, so restoring SQLite later touches `lib/db.ts` only.

---

## Next steps, in order

1. **Set the key and run the live spine.**
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   npm run demo:check
   ```
   Phase B exercises triage → verdict → ingest → violations → letter → leak scan, and asserts the pharmacy scenario is *not* classified as a scam. Expect prompt tuning on the first run.

2. **Click through the app end to end.**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` and `http://localhost:3000/scammer` side by side. Start the `amazon_giftcard` scenario, type as the caller, end the call, analyze, draft, approve. Confirm the letter lands in the Console's "Recipient inbox" tab.

3. **Verify the two demo-critical claims by eye.** The letter must contain zero real PII (the "They will see / Never leaves your phone" panel is the centerpiece of the pitch), and the campaign-clustering line ("this script has hit N other users") needs a second reporter to appear — run a scenario twice from two user IDs, or seed it.

4. **Tune the screening agent.** It's the most visible surface and the least validated. Watch for: over-eagerness to flag the legitimate pharmacy call, and whether it holds the line when a caller applies urgency pressure.

5. **Write a README and commit.**

### Fixed since the first draft

- **Screening errors were invisible.** `startCall` sets `screen: "call"` before fetching, and `CallScreen` early-returned "No active call." whenever `event` was null — so a failed `/api/inbound` looked identical to never having started a call. (The console-side banner in `app/page.tsx` is gated on `screen === "home"`, so it didn't catch it either.) The empty state now renders the error. Found by clicking the app with no API key set; it would have looked like a dead button on stage.
- `HomeScreen` no longer imports `Button` unused.
- `useDemo`'s unused `setRecovery` action removed — `RecoveryScreen` manages its own state.

### Known minor issues

- Turbopack warns about dynamic `fs` calls in `lib/db.ts`. Cosmetic; runtime is verified working.
- No linter is configured, so unused imports and dead exports don't error.

### Before this touches a real user

- `data/brokers.ts` is **entirely fictional** by design. Naming a real company as a holder of someone's data is a factual claim we haven't verified. Swap in the real registry from `https://cppa.ca.gov/data_broker_registry/` — the `DataBroker` type already matches its published fields.
- Letter delivery targets an in-app mock inbox. Wiring a real mail transport is a deliberate, separate decision.
- The DROP flow deliberately *prepares* a submission rather than auto-submitting: the CPPA platform verifies the consumer's own identity, and we should not hold those credentials.

---

## Cheat sheet

```bash
npm run dev          # localhost:3000  (+ /scammer for the second screen)
npm run demo:check   # 45 offline checks; add API key for the live spine
npm run typecheck
npm run build
```

Reset demo state: the "Reset demo" button in the console, or `rm shieldguard.json`.

Model is `claude-opus-5` throughout. Two traps already handled in `lib/anthropic.ts`: thinking is ON by default (so `max_tokens` covers thinking *plus* output), and assistant prefill returns a 400 (structured outputs used instead).
