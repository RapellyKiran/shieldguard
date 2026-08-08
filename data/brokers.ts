import type { DataBroker } from "@/lib/types";

/**
 * Illustrative data-broker registry.
 *
 * ⚠️  THESE ARE FICTIONAL. Every company name and registration ID below is
 * invented for the demo. Do not ship this to real users, and do not present it
 * as a list of actual registered brokers — naming a real company as a holder of
 * someone's data is a factual claim we have not verified.
 *
 * The real registry is public and downloadable from the California Privacy
 * Protection Agency at https://cppa.ca.gov/data_broker_registry/ — swap it in
 * before this touches a real consumer. The `DataBroker` shape below already
 * matches the fields the registry publishes.
 */
export const BROKERS: DataBroker[] = [
  {
    registrationId: "DB-2026-0117",
    name: "Meridian Audience Group",
    website: "meridianaudience.example",
    categories: ["Name", "Phone", "Email", "Household income", "Purchase history"],
    collectsPhone: true,
    privacyContact: "privacy@meridianaudience.example",
  },
  {
    registrationId: "DB-2026-0243",
    name: "Northgate Identity Solutions",
    website: "northgateid.example",
    categories: ["Name", "Address", "Phone", "Date of birth", "Property records"],
    collectsPhone: true,
    privacyContact: "dsar@northgateid.example",
  },
  {
    registrationId: "DB-2026-0388",
    name: "Pacific Lead Exchange",
    website: "pacificleadx.example",
    categories: ["Phone", "Email", "Consumer intent signals", "Lead scoring"],
    collectsPhone: true,
    privacyContact: "compliance@pacificleadx.example",
  },
  {
    registrationId: "DB-2026-0401",
    name: "Cascade Consumer Analytics",
    website: "cascadeanalytics.example",
    categories: ["Name", "Email", "Web browsing", "Device identifiers"],
    collectsPhone: false,
    privacyContact: "privacy@cascadeanalytics.example",
  },
  {
    registrationId: "DB-2026-0512",
    name: "Harborview People Search",
    website: "harborviewsearch.example",
    categories: ["Name", "Address", "Phone", "Relatives", "Criminal records", "Age"],
    collectsPhone: true,
    privacyContact: "optout@harborviewsearch.example",
  },
  {
    registrationId: "DB-2026-0630",
    name: "Sentinel Risk Data",
    website: "sentinelriskdata.example",
    categories: ["Name", "Address", "Employment", "Insurance claims"],
    collectsPhone: false,
    privacyContact: "privacy@sentinelriskdata.example",
  },
  {
    registrationId: "DB-2026-0744",
    name: "BrightPath Marketing Data",
    website: "brightpathdata.example",
    categories: ["Name", "Phone", "Email", "Life events", "Marketing segments"],
    collectsPhone: true,
    privacyContact: "privacy@brightpathdata.example",
  },
  {
    registrationId: "DB-2026-0821",
    name: "Anchor Commercial Intelligence",
    website: "anchorcommercial.example",
    categories: ["Business firmographics", "Executive contacts"],
    collectsPhone: false,
    privacyContact: "legal@anchorcommercial.example",
  },
  {
    registrationId: "DB-2026-0955",
    name: "Vantage Telecom Records",
    website: "vantagetelecom.example",
    categories: ["Phone", "Carrier", "Line type", "Reassigned number data"],
    collectsPhone: true,
    privacyContact: "privacy@vantagetelecom.example",
  },
  {
    registrationId: "DB-2026-1063",
    name: "Crestline Health Marketing",
    website: "crestlinehm.example",
    categories: ["Name", "Phone", "Age band", "Health interest segments"],
    collectsPhone: true,
    privacyContact: "privacy@crestlinehm.example",
  },
  {
    registrationId: "DB-2026-1188",
    name: "Foundry Location Insights",
    website: "foundrylocation.example",
    categories: ["Device identifiers", "Location history", "Dwell patterns"],
    collectsPhone: false,
    privacyContact: "privacy@foundrylocation.example",
  },
  {
    registrationId: "DB-2026-1274",
    name: "Redwood Voter & Consumer File",
    website: "redwoodfile.example",
    categories: ["Name", "Address", "Phone", "Party affiliation", "Voting history"],
    collectsPhone: true,
    privacyContact: "privacy@redwoodfile.example",
  },
];

export function getBroker(registrationId: string): DataBroker | undefined {
  return BROKERS.find((b) => b.registrationId === registrationId);
}
