import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Put your own key in .env.local before\n" +
          "starting the app (it is gitignored — do not commit it):\n" +
          "  cp .env.example .env.local",
      );
    }
    client = new Anthropic();
  }
  return client;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Per-agent tuning.
 *
 * Two Opus 5 traps this encodes for us:
 *  - Thinking is ON by default, and `max_tokens` caps thinking PLUS output.
 *    Every budget below is sized with that headroom already included.
 *  - Assistant prefill returns a 400. Shape is constrained with structured
 *    outputs instead — see `parseJson` below.
 */
export const AGENT_CONFIG = {
  /** Runs while the phone is ringing — latency is the whole game. */
  triage: { effort: "low" as Effort, maxTokens: 4000 },
  /**
   * Conversational; must feel like a person is on the line. The budget is
   * generous because this key also covers the structured verdict analysis,
   * which thinks harder than a single spoken turn. max_tokens is a ceiling,
   * not a target — short replies stay short.
   */
  screener: { effort: "medium" as Effort, maxTokens: 16000 },
  /** Correctness over speed. Cites statutes; mistakes here are expensive. */
  violations: { effort: "high" as Effort, maxTokens: 20000 },
  letter: { effort: "high" as Effort, maxTokens: 20000 },
  deletion: { effort: "medium" as Effort, maxTokens: 12000 },
  recovery: { effort: "medium" as Effort, maxTokens: 12000 },
} as const;

export type AgentName = keyof typeof AGENT_CONFIG;

/**
 * One-shot structured call. Uses `output_config.format` with a JSON schema —
 * the supported replacement for assistant prefill on Opus 5.
 */
export async function structured<T>(opts: {
  agent: AgentName;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const cfg = AGENT_CONFIG[opts.agent];

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: cfg.maxTokens,
    system: opts.system,
    output_config: {
      effort: cfg.effort,
      format: { type: "json_schema", schema: opts.schema },
    },
    messages: [{ role: "user", content: opts.prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Model declined the request (${response.stop_details?.category ?? "unspecified"}). ` +
        `This can happen on security-adjacent content; try narrowing the prompt.`,
    );
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`No text block in response (stop_reason: ${response.stop_reason}).`);
  }

  try {
    return JSON.parse(text.text) as T;
  } catch {
    throw new Error(`Model returned non-JSON despite a schema constraint: ${text.text.slice(0, 300)}`);
  }
}

/** Plain text call, for prose output like letter bodies. */
export async function prose(opts: {
  agent: AgentName;
  system: string;
  prompt: string;
}): Promise<string> {
  const cfg = AGENT_CONFIG[opts.agent];

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: cfg.maxTokens,
    system: opts.system,
    output_config: { effort: cfg.effort },
    messages: [{ role: "user", content: opts.prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Model declined the request (${response.stop_details?.category ?? "unspecified"}).`);
  }

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}
