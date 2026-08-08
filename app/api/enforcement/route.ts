import { NextResponse } from "next/server";
import { getAllCampaigns, getEvidenceByIds, getPublishableCampaigns } from "@/lib/db";
import { isPublishable } from "@/lib/fingerprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The enforcement console and its export.
 *
 * `?view=internal` shows everything including single-reporter `reported`
 * entries, because the operator needs to see what is pending corroboration.
 * Everything else — and every export — returns publishable tiers only, filtered
 * at the query level in getPublishableCampaigns() so there is no way to ship an
 * unverified entry by rendering a different component.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view");
  const format = url.searchParams.get("format");

  const internal = view === "internal";
  const campaigns = internal ? getAllCampaigns() : getPublishableCampaigns();

  const enriched = campaigns.map((c) => {
    const evidence = getEvidenceByIds(c.evidenceIds);
    return {
      ...c,
      // Never ship raw fingerprints in the API payload — they're large and of
      // no use to a consumer of the feed.
      scriptFingerprint: undefined,
      fingerprintSize: c.scriptFingerprint.length,
      publishable: isPublishable(c.tier),
      redFlagCodes: [...new Set(evidence.flatMap((e) => e.verdict.redFlags.map((f) => f.code)))],
      sampleQuotes: evidence
        .flatMap((e) => e.verdict.redFlags.map((f) => f.quote))
        .slice(0, 3),
      evidenceHashes: evidence.map((e) => e.hash),
    };
  });

  if (format === "csv") {
    const header = [
      "campaign_id", "tier", "reporter_count", "scam_type", "claimed_entity",
      "callback_numbers", "originating_identifiers", "red_flags",
      "first_seen", "last_seen", "evidence_count",
    ].join(",");

    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

    const rows = enriched.map((c) =>
      [
        c.id, c.tier, c.reporterCount, c.scamType ?? "", c.claimedEntity ?? "",
        c.callbackNumbers.join(" "), c.originatingIdentifiers.join(" "),
        c.redFlagCodes.join(" "), c.firstSeenAt, c.lastSeenAt, c.evidenceIds.length,
      ]
        .map((v) => escape(String(v)))
        .join(","),
    );

    return new Response([header, ...rows].join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="shieldguard-campaigns-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    campaigns: enriched,
    totalKnown: getAllCampaigns().length,
    publishableCount: getPublishableCampaigns().length,
    view: internal ? "internal" : "published",
    note: internal
      ? "Internal view. Includes single-reporter entries that are NOT cleared for export."
      : "Published view. Single-reporter, uncorroborated entries are excluded.",
  });
}
