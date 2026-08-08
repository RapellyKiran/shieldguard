"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Campaign,
  DemandLetter,
  DigitalId,
  EvidenceRecord,
  InboundEvent,
  RecoveryPlan,
  ScreeningTurn,
  ShieldedIdentity,
  TriageResult,
  Verdict,
  ViolationAnalysis,
} from "./types";
import type { DamagesComputation } from "./damages";

/**
 * Cross-window channel between the phone and the scammer console.
 *
 * BroadcastChannel rather than a server round-trip: both windows are the same
 * origin on the same laptop, so this is instant and has no failure mode that
 * depends on the venue network. If the wifi dies mid-demo, the two windows
 * still talk to each other.
 */
export const CHANNEL = "shieldguard-demo";

export type DemoMessage =
  | { kind: "caller_line"; text: string }
  | { kind: "agent_line"; text: string }
  | { kind: "call_started"; fromIdentifier: string; fromDisplayName?: string }
  | { kind: "call_ended" }
  /**
   * BroadcastChannel delivers only to windows that are already listening, and
   * it retains nothing. A Scammer Console opened — or reloaded — after the call
   * started would otherwise never see `call_started` and would sit disabled for
   * the rest of the call. So it asks on mount, and the phone answers.
   */
  | { kind: "state_request" }
  | {
      kind: "call_state";
      active: boolean;
      fromIdentifier?: string;
      fromDisplayName?: string;
      /** Agent turns so far, so a late window shows the conversation in progress. */
      agentLines: string[];
    };

export function postMessage(msg: DemoMessage) {
  if (typeof window === "undefined") return;
  const ch = new BroadcastChannel(CHANNEL);
  ch.postMessage(msg);
  ch.close();
}

export function useChannel(onMessage: (msg: DemoMessage) => void) {
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e) => handler.current(e.data as DemoMessage);
    return () => ch.close();
  }, []);
}

// ---------------------------------------------------------------------------

export type Screen = "home" | "call" | "verdict" | "letter" | "deletion" | "recovery";

export interface ScenarioSummary {
  id: string;
  label: string;
  channel: string;
  fromIdentifier: string;
  fromDisplayName?: string;
  expected: string;
  hasScript: boolean;
}

export interface DemoState {
  identity: DigitalId | null;
  shielded: ShieldedIdentity | null;
  disclosure: { disclosed: string[]; withheld: string[] } | null;
  scenarios: ScenarioSummary[];

  screen: Screen;
  event: InboundEvent | null;
  triage: TriageResult | null;
  transcript: ScreeningTurn[];
  /** Partial text of the agent turn currently streaming in. */
  streaming: string;
  callActive: boolean;

  verdict: Verdict | null;
  evidence: EvidenceRecord | null;
  campaign: Campaign | null;
  corroboratingReports: number;
  chainValid: boolean | null;

  analysis: ViolationAnalysis | null;
  damages: DamagesComputation | null;
  letter: DemandLetter | null;
  letterSent: boolean;
  recovery: RecoveryPlan | null;

  busy: string | null;
  error: string | null;
}

const INITIAL: DemoState = {
  identity: null, shielded: null, disclosure: null, scenarios: [],
  screen: "home", event: null, triage: null, transcript: [], streaming: "",
  callActive: false, verdict: null, evidence: null, campaign: null,
  corroboratingReports: 0, chainValid: null, analysis: null, damages: null,
  letter: null, letterSent: false, recovery: null, busy: null, error: null,
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function useDemo() {
  const [state, setState] = useState<DemoState>(INITIAL);

  // Mirror of state for use inside async callbacks. React state is a frame
  // behind, and the streaming loop needs the current transcript synchronously.
  const ref = useRef<DemoState>(INITIAL);
  const patch = useCallback((p: Partial<DemoState>) => {
    ref.current = { ...ref.current, ...p };
    setState(ref.current);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const data = await json<{
        identity: DigitalId;
        shielded: ShieldedIdentity;
        disclosure: { disclosed: string[]; withheld: string[] };
        scenarios: ScenarioSummary[];
      }>("/api/session");
      patch({ ...data, error: null });
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [patch]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  /** Stream one agent turn, appending deltas as they arrive. */
  const runAgentTurn = useCallback(async () => {
    const event = ref.current.event;
    if (!event) return;

    patch({ streaming: "" });
    let acc = "";

    const res = await fetch("/api/screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: event.id, transcript: ref.current.transcript }),
    });
    if (!res.body) throw new Error("No response stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; the last chunk may be partial.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6));

        if (payload.type === "delta") {
          acc += payload.text;
          patch({ streaming: acc });
        } else if (payload.type === "done") {
          const text = String(payload.text || acc).trim();
          const turn: ScreeningTurn = { speaker: "agent", text, at: new Date().toISOString() };
          patch({ transcript: [...ref.current.transcript, turn], streaming: "" });
          postMessage({ kind: "agent_line", text });
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      }
    }
  }, [patch]);

  const startCall = useCallback(
    async (
      scenarioId?: string,
      custom?: { fromIdentifier: string; fromDisplayName?: string; channel?: string; body?: string },
    ) => {
      try {
        patch({
          busy: "Screening inbound contact…", error: null, screen: "call",
          transcript: [], streaming: "", verdict: null, evidence: null,
          analysis: null, damages: null, letter: null, letterSent: false, campaign: null,
        });

        const data = await json<{ event: InboundEvent; triage: TriageResult }>("/api/inbound", {
          method: "POST",
          body: JSON.stringify(scenarioId ? { scenarioId } : custom),
        });

        patch({
          event: data.event,
          triage: data.triage,
          callActive: data.triage.action === "screen",
          busy: null,
        });

        postMessage({
          kind: "call_started",
          fromIdentifier: data.event.fromIdentifier,
          fromDisplayName: data.event.fromDisplayName,
        });

        // Only screened calls get a conversation. Blocked calls never connect;
        // allowed calls ring through to the user untouched.
        if (data.triage.action === "screen") {
          patch({ busy: "Agent answering…" });
          await runAgentTurn();
          patch({ busy: null });
        }
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : String(e), busy: null });
      }
    },
    [patch, runAgentTurn],
  );

  /**
   * Override a block and screen the caller anyway.
   *
   * A repeat call from a known campaign is exactly the call triage wants to
   * block — and exactly the call the enforcement side needs, because TCPA
   * § 227(c)(5) only opens up on a second contact within twelve months.
   * Blocking is the passive defence this product exists to replace, so the
   * choice belongs to the user rather than to the triage agent.
   */
  const screenAnyway = useCallback(async () => {
    const { event, triage } = ref.current;
    if (!event || !triage) return;
    try {
      patch({
        triage: { ...triage, action: "screen" },
        callActive: true,
        busy: "Agent answering…",
        error: null,
      });
      postMessage({
        kind: "call_started",
        fromIdentifier: event.fromIdentifier,
        fromDisplayName: event.fromDisplayName,
      });
      await runAgentTurn();
      patch({ busy: null });
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e), busy: null });
    }
  }, [patch, runAgentTurn]);

  /** A caller line arrives — typed in the scammer console, or scripted. */
  const addCallerLine = useCallback(
    async (text: string) => {
      if (!ref.current.event || !ref.current.callActive) return;
      try {
        const turn: ScreeningTurn = { speaker: "caller", text, at: new Date().toISOString() };
        patch({ transcript: [...ref.current.transcript, turn], busy: "Agent thinking…", error: null });
        await runAgentTurn();
        patch({ busy: null });
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : String(e), busy: null });
      }
    },
    [patch, runAgentTurn],
  );

  const endCall = useCallback(async () => {
    const { event, transcript } = ref.current;
    if (!event) return;
    try {
      patch({ busy: "Analyzing call…", callActive: false, error: null });
      postMessage({ kind: "call_ended" });

      const data = await json<{
        verdict: Verdict;
        evidence: EvidenceRecord;
        campaign: Campaign;
        corroboratingReports: number;
        chainValid: boolean;
      }>("/api/verdict", {
        method: "POST",
        body: JSON.stringify({ eventId: event.id, transcript }),
      });

      patch({ ...data, screen: "verdict", busy: null });
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e), busy: null });
    }
  }, [patch]);

  const analyze = useCallback(async () => {
    const { evidence } = ref.current;
    if (!evidence) return;
    try {
      patch({ busy: "Matching evidence against FTC and TCPA rules…", error: null });
      const data = await json<{ analysis: ViolationAnalysis; damages: DamagesComputation }>(
        "/api/analyze",
        { method: "POST", body: JSON.stringify({ evidenceId: evidence.id }) },
      );
      patch({ analysis: data.analysis, damages: data.damages, busy: null });
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e), busy: null });
    }
  }, [patch]);

  const draftLetter = useCallback(async () => {
    const { evidence, analysis } = ref.current;
    if (!evidence || !analysis) return;
    try {
      patch({ busy: "Drafting shielded demand letter…", error: null });
      const data = await json<{ letter: DemandLetter }>("/api/letter", {
        method: "POST",
        body: JSON.stringify({ evidenceId: evidence.id, analysis }),
      });
      patch({ letter: data.letter, screen: "letter", busy: null });
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e), busy: null });
    }
  }, [patch]);

  const sendLetter = useCallback(async () => {
    const { letter } = ref.current;
    if (!letter) return;
    try {
      patch({ busy: "Sending…", error: null });
      await json("/api/letter/send", {
        method: "POST",
        body: JSON.stringify({ letterId: letter.id, approved: true }),
      });
      patch({ letterSent: true, busy: null });
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e), busy: null });
    }
  }, [patch]);

  const reset = useCallback(async () => {
    await fetch("/api/session", { method: "POST" });
    ref.current = INITIAL;
    setState(INITIAL);
    await loadSession();
  }, [loadSession]);

  const go = useCallback((screen: Screen) => patch({ screen }), [patch]);

  return {
    state,
    patch,
    actions: {
      startCall, screenAnyway, addCallerLine, endCall, analyze,
      draftLetter, sendLetter, reset, go,
    },
  };
}
