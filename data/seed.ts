import type { Channel, DigitalId } from "@/lib/types";

/**
 * The demo user.
 *
 * Entirely fictional. The phone number uses the 555-01xx range reserved for
 * fiction, and the domain is not registered — nothing here resolves to a real
 * person, which matters given that this record is treated as PII throughout
 * the codebase.
 */
export const DEMO_USER: DigitalId = {
  userId: "user_demo_maria",
  fullName: "Maria Delgado",
  email: "maria.delgado@example.com",
  phone: "+13105550142",
  streetAddress: "1847 Rosewood Avenue, Apt 3B",
  city: "Los Angeles",
  stateOfResidence: "CA",
  postalCode: "90019",
  onDncRegistry: true,
  dncRegistrationDate: "2019-03-14",
};

export interface Scenario {
  id: string;
  label: string;
  channel: Channel;
  fromIdentifier: string;
  fromDisplayName?: string;
  body?: string;
  subject?: string;
  /**
   * Scripted caller lines, played in order when the demo runs unattended.
   * The live scammer console overrides these — a human types instead.
   */
  callerScript: string[];
  /** What we expect the system to conclude. Used by demo:check as an assertion. */
  expected: "scam" | "legitimate" | "suspicious";
  notes: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "amazon_giftcard",
    label: "Amazon security — gift card",
    channel: "call",
    fromIdentifier: "+18885550177",
    fromDisplayName: "AMAZON SECURITY",
    expected: "scam",
    notes:
      "The headline demo. Hits impersonation, urgency, and a gift-card demand — " +
      "which is independently an FTC TSR violation under § 310.4(a)(10).",
    callerScript: [
      "Yes, hello, this is David Chen calling from the Amazon Account Security Department. We've detected an unauthorized charge of $1,299 on your Prime account for an iPhone shipping to Ohio.",
      "I'm with Amazon, sir. Ma'am. Look, the charge is processing right now — if we don't stop it in the next few minutes the funds leave your account and there is nothing anybody can do.",
      "I can't give you a callback number, this is a secure outbound line. You need to stay on with me. Now, to reverse the charge our security system requires you to purchase two Apple gift cards for $500 each and read me the codes on the back.",
      "It's not a payment, it's a verification hold. The money goes right back to you once the reversal clears. Do not hang up, if you hang up the charge finalizes.",
    ],
  },
  {
    id: "irs_warrant",
    label: "IRS impersonation — arrest threat",
    channel: "call",
    fromIdentifier: "+12025550193",
    fromDisplayName: "IRS",
    expected: "scam",
    notes: "Government impersonation plus threat of arrest. Strong willfulness evidence for treble damages.",
    callerScript: [
      "This is Officer Michael Barnes, badge number 4471, calling from the Internal Revenue Service Criminal Investigation Division. A federal arrest warrant has been issued in your name for tax fraud.",
      "The warrant is active as of this morning. Local law enforcement has been notified and will be dispatched to your residence within two hours unless this is resolved on this call.",
      "The outstanding amount is $4,832. It must be settled today by wire transfer to a federal holding account. I'll give you the routing details.",
      "Ma'am, I would advise against contacting an attorney. That will be viewed as non-cooperation and I will have to close this file and let the arrest proceed.",
    ],
  },
  {
    id: "tech_support",
    label: "Tech support — remote access",
    channel: "call",
    fromIdentifier: "+18775550118",
    fromDisplayName: "MICROSOFT SUPPORT",
    expected: "scam",
    notes: "Remote-access request. Good for showing the CREDENTIAL_REQUEST and UNSOLICITED_REMOTE_ACCESS flags.",
    callerScript: [
      "Hello, I'm calling from Microsoft Windows Technical Support. Our servers are showing that your computer is broadcasting a virus signature onto the internet.",
      "Your machine has been infected with a trojan that is transmitting your banking passwords. I can see it right now on my monitor.",
      "I need you to go to your computer and download a small remote support tool so I can clean the infection. It's completely safe, it's official Microsoft software.",
      "After I remove the virus there is a one-time support fee of $299. I'll need a card number to process that.",
    ],
  },
  {
    id: "delivery_sms",
    label: "Package delivery — SMS phishing",
    channel: "sms",
    fromIdentifier: "+16195550164",
    body:
      "USPS: Your package #9241 could not be delivered due to an incomplete address. " +
      "Update your details within 24 hours to avoid return: usps-redelivery-track.co/a8k2",
    expected: "scam",
    notes: "Shows the SMS path and a lookalike domain. Fast to demo — no conversation needed.",
    callerScript: [],
  },
  {
    id: "bank_fraud_spoof",
    label: "Bank fraud dept — credential harvest",
    channel: "call",
    fromIdentifier: "+18005550129",
    fromDisplayName: "WELLS SECURITY",
    expected: "scam",
    notes:
      "The most sophisticated script. The caller sounds legitimate for two turns before asking " +
      "for the one thing no real bank asks for. Good for showing the agent doesn't block on vibes.",
    callerScript: [
      "Good afternoon, this is the fraud prevention department calling about some unusual activity we flagged on your account ending in 4-2. Am I speaking with the account holder?",
      "I understand the caution, that's exactly right. For your security I can't disclose the full account number — I can tell you we flagged two attempted charges in Miami this morning.",
      "To verify I'm speaking with the account holder I'll need you to read back the six-digit code we just texted to this number.",
      "Ma'am, without that code I can't stop the charges. I know it's unusual but this is the standard verification process and the window is closing.",
    ],
  },
  {
    id: "pharmacy_legit",
    label: "Pharmacy refill — LEGITIMATE",
    channel: "call",
    fromIdentifier: "+13105550188",
    fromDisplayName: "WESTSIDE PHARMACY",
    expected: "legitimate",
    notes:
      "CRITICAL for the demo. Proves the system isn't a blunt blocker. The caller identifies " +
      "themselves, offers a verifiable callback, asks for nothing, and takes 'call back later' " +
      "for an answer. If this comes back 'scam', the agent prompt needs work.",
    callerScript: [
      "Hi, this is Denise calling from Westside Pharmacy on Pico. I'm calling about a prescription that's ready for pickup.",
      "Of course — we're at 5820 West Pico Boulevard, and our number is 310-555-0188, you can look us up. There's no rush on this at all.",
      "I don't need any information from you, I just wanted to let you know it's ready and that it'll be held for fourteen days. That's really all.",
      "No problem at all. Have a good afternoon.",
    ],
  },
  {
    id: "debt_collector",
    label: "Debt collector — AMBIGUOUS",
    channel: "call",
    fromIdentifier: "+18445550155",
    fromDisplayName: "UNKNOWN",
    expected: "suspicious",
    notes:
      "Deliberately ambiguous. Could be a real (if aggressive) collector, could be a debt " +
      "collection scam. Should come back 'suspicious' with middling confidence — good for " +
      "showing calibrated uncertainty instead of false confidence.",
    callerScript: [
      "This call is an attempt to collect a debt. Am I speaking with the party responsible for account ending 7719?",
      "I'm calling from Meridian Recovery Associates regarding a balance of $2,340 originally with a medical provider.",
      "I can send written validation but I'd need to confirm your mailing address first. Can you confirm the street address on file?",
      "If the balance isn't addressed this week the file escalates and that will be reflected on the credit report.",
    ],
  },
  {
    id: "medicare",
    label: "Medicare — benefit harvest",
    channel: "call",
    fromIdentifier: "+18665550171",
    fromDisplayName: "MEDICARE BENEFITS",
    expected: "scam",
    notes: "Targets a vulnerable population. Useful for the impact framing in the pitch.",
    callerScript: [
      "Hello, I'm calling from the Medicare benefits coordination office about your new plastic Medicare card that's being issued this year.",
      "The old paper cards are being discontinued. To get your replacement card sent out I just need to verify your Medicare number and date of birth.",
      "There's no cost for the card itself. I do need that Medicare number to pull up your file — it's the eleven-character number on your current card.",
      "Ma'am, if we can't verify your file your benefits could lapse at the end of the enrollment period.",
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
