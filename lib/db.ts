import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Campaign,
  DemandLetter,
  DeletionRequest,
  DigitalId,
  EvidenceRecord,
  InboundEvent,
  MockInboxMessage,
  ScreeningTurn,
} from "./types";
import { PUBLISHABLE_TIERS } from "./fingerprint";

/**
 * Storage.
 *
 * This was SQLite, and SQL suited the enforcement queries better. It was
 * replaced with a plain JSON file after better-sqlite3's prebuilt binary
 * segfaulted on Node 22.1.0 — a native-module ABI mismatch that would have to
 * be resolved independently on every machine that runs this.
 *
 * For a four-person team on a deadline that trade is worth making: the data
 * here is dozens of records, the queries are trivial in JS, and this version
 * has no build step, no native dependency, and no way to fail differently on
 * someone else's laptop. If this ever needs real concurrency or real volume,
 * put SQLite back — the exported interface below is unchanged, so that swap
 * touches this file only.
 */

const DB_PATH = process.env.SHIELDGUARD_DB ?? join(process.cwd(), "shieldguard.json");

interface Store {
  users: Record<string, { claimId: string; createdAt: string }>;
  /**
   * Real identities. Nothing outside getEscrowedIdentity() reads this, and no
   * agent code path calls that function.
   */
  escrow: Record<string, DigitalId>;
  inboundEvents: Record<string, InboundEvent>;
  /** Append-only, ordered. Order is the chain order. */
  evidence: EvidenceRecord[];
  campaigns: Record<string, Campaign>;
  letters: Record<string, { userId: string; evidenceId: string; letter: DemandLetter }>;
  deletionRequests: DeletionRequest[];
  mockInbox: MockInboxMessage[];
}

function emptyStore(): Store {
  return {
    users: {}, escrow: {}, inboundEvents: {}, evidence: [],
    campaigns: {}, letters: {}, deletionRequests: [], mockInbox: [],
  };
}

// Next.js dev-mode hot reload re-evaluates modules. Hold the store on the
// global so an edit doesn't silently reset in-memory state mid-demo.
declare global {
  // eslint-disable-next-line no-var
  var __shieldguardStore: Store | undefined;
}

function load(): Store {
  if (global.__shieldguardStore) return global.__shieldguardStore;

  let store = emptyStore();
  if (existsSync(DB_PATH)) {
    try {
      store = { ...emptyStore(), ...JSON.parse(readFileSync(DB_PATH, "utf8")) };
    } catch {
      // A corrupt file must not take the demo down. Start clean.
      store = emptyStore();
    }
  }

  global.__shieldguardStore = store;
  return store;
}

/** Write via a temp file + rename so a crash mid-write can't corrupt the store. */
function save(): void {
  const store = load();
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tmp = `${DB_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, DB_PATH);
}

// ---------------------------------------------------------------------------
// Users + escrow
// ---------------------------------------------------------------------------

export function upsertUser(id: DigitalId, claimId: string): void {
  const store = load();
  store.users[id.userId] = { claimId, createdAt: new Date().toISOString() };
  store.escrow[id.userId] = id;
  save();
}

/**
 * Read the real identity out of escrow.
 *
 * Every call site of this function is a point where PII enters memory. There
 * should be very few, and none of them may sit on a path that reaches an agent
 * prompt — the letter pipeline takes it only to run the outbound leak scan.
 */
export function getEscrowedIdentity(userId: string): DigitalId | null {
  return load().escrow[userId] ?? null;
}

export function getClaimId(userId: string): string | null {
  return load().users[userId]?.claimId ?? null;
}

// ---------------------------------------------------------------------------
// Inbound events
// ---------------------------------------------------------------------------

export function insertInboundEvent(e: InboundEvent): void {
  load().inboundEvents[e.id] = e;
  save();
}

export function getInboundEvent(id: string): InboundEvent | null {
  return load().inboundEvents[id] ?? null;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export function getLastEvidenceHash(userId: string): string {
  const chain = getEvidenceChain(userId);
  return chain.length > 0 ? chain[chain.length - 1].hash : "";
}

export function insertEvidence(record: EvidenceRecord): void {
  load().evidence.push(record);
  save();
}

export function getEvidence(id: string): EvidenceRecord | null {
  return load().evidence.find((e) => e.id === id) ?? null;
}

/** One user's records, in insertion order — which is the hash-chain order. */
export function getEvidenceChain(userId: string): EvidenceRecord[] {
  return load().evidence.filter((e) => e.userId === userId);
}

export function getEvidenceByIds(ids: string[]): EvidenceRecord[] {
  const wanted = new Set(ids);
  return load().evidence.filter((e) => wanted.has(e.id));
}

/**
 * Distinct users behind a set of evidence records.
 *
 * This is the corroboration counter, and it must count USERS, not reports —
 * otherwise one user screening the same scammer five times would promote a
 * campaign to `corroborated` on their own, which is exactly the failure mode
 * the confidence tiers exist to prevent.
 */
export function countDistinctReporters(evidenceIds: string[]): number {
  return new Set(getEvidenceByIds(evidenceIds).map((e) => e.userId)).size;
}

/** Test hook: corrupt a stored record so the chain check can be shown failing. */
export function tamperWithEvidence(id: string, newTranscript: ScreeningTurn[]): void {
  const record = load().evidence.find((e) => e.id === id);
  if (!record) return;
  record.transcript = newTranscript;
  save();
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function upsertCampaign(c: Campaign): void {
  load().campaigns[c.id] = c;
  save();
}

export function getAllCampaigns(): Campaign[] {
  return Object.values(load().campaigns).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function getCampaign(id: string): Campaign | null {
  return load().campaigns[id] ?? null;
}

/**
 * The export surface.
 *
 * Single-reporter `reported` entries are filtered out here rather than in the
 * UI, so there is no way to accidentally publish one by rendering a different
 * component.
 */
export function getPublishableCampaigns(): Campaign[] {
  return getAllCampaigns()
    .filter((c) => PUBLISHABLE_TIERS.includes(c.tier))
    .sort((a, b) => b.reporterCount - a.reporterCount || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

// ---------------------------------------------------------------------------
// Letters
// ---------------------------------------------------------------------------

export function insertLetter(userId: string, evidenceId: string, letter: DemandLetter): void {
  load().letters[letter.id] = { userId, evidenceId, letter };
  save();
}

export function getLetter(id: string): DemandLetter | null {
  return load().letters[id]?.letter ?? null;
}

export function markLetterSent(id: string, approvedAt: string, sentAt: string): void {
  const entry = load().letters[id];
  if (!entry) return;
  entry.letter = { ...entry.letter, approvedAt, sentAt };
  save();
}

// ---------------------------------------------------------------------------
// Deletion requests
// ---------------------------------------------------------------------------

export function insertDeletionRequest(r: DeletionRequest): void {
  load().deletionRequests.push(r);
  save();
}

export function getDeletionRequests(userId: string): DeletionRequest[] {
  return load()
    .deletionRequests.filter((r) => r.userId === userId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

// ---------------------------------------------------------------------------
// Mock inbox (demo delivery target)
// ---------------------------------------------------------------------------

export function insertMockInboxMessage(m: MockInboxMessage): void {
  load().mockInbox.push(m);
  save();
}

export function getMockInbox(): MockInboxMessage[] {
  return [...load().mockInbox].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** Wipe everything. Used by the reset button and by demo:check. */
export function resetDb(): void {
  global.__shieldguardStore = emptyStore();
  save();
}
