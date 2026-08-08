/**
 * The rule corpus.
 *
 * Kept as a bundled string rather than markdown read off disk: Next.js route
 * bundling makes runtime `fs` reads fragile, and this needs to work on stage
 * with no filesystem surprises. It is still written as a document because the
 * violations agent reads it as one.
 *
 * Accuracy note for whoever extends this: the private-right-of-action column
 * is the load-bearing part. Getting it wrong means either telling a consumer
 * they can sue when they can't, or leaving money on the table. Verify against
 * the statute before adding a row.
 */
export const RULE_CORPUS = `
# Telemarketing and messaging rules — enforcement reference

## 1. TCPA — 47 U.S.C. § 227(b): automated calls and texts

**Prohibition.** It is unlawful to make any call (including a text message)
using an automatic telephone dialing system or an artificial or prerecorded
voice to a wireless number without the called party's prior express consent.
For calls that introduce an advertisement or constitute telemarketing, prior
express *written* consent is required.

**Key citations**
- 47 U.S.C. § 227(b)(1)(A)(iii) — ATDS / prerecorded voice to a wireless number
- 47 U.S.C. § 227(b)(1)(B) — prerecorded voice to a residential line
- 47 C.F.R. § 64.1200(a)(1)-(2) — implementing regulation

**Damages — 47 U.S.C. § 227(b)(3).** Actual monetary loss, or **$500 per
violation**, whichever is greater. The court **may** treble the award to
**$1,500 per violation** where the defendant acted **willfully or knowingly**.
Each call and each text is a separate violation.

**Private right of action: YES.** An individual may sue in state or federal court.

**Elements to establish**
1. A call or text was made to the plaintiff's number.
2. The number is a wireless (or covered residential) line.
3. An ATDS or an artificial/prerecorded voice was used.
4. The plaintiff did not give prior express consent (written consent, if telemarketing).

**Evidence that supports willfulness** — continuing after a stop request; spoofed
or rotating caller ID; refusal to identify the caller or company; calling a
number known to be on the DNC registry; impersonating a real business.

---

## 2. TCPA — 47 U.S.C. § 227(c): Do Not Call Registry

**Prohibition.** Telephone solicitations to a residential subscriber whose
number is on the National Do Not Call Registry, or who has made a
company-specific do-not-call request.

**Key citations**
- 47 U.S.C. § 227(c)(5) — private right of action
- 47 C.F.R. § 64.1200(c)(2) — national registry
- 47 C.F.R. § 64.1200(d) — internal do-not-call procedures

**Damages — 47 U.S.C. § 227(c)(5).** **Up to $500** per violation, trebled for
willful or knowing violations.

**IMPORTANT — do not overstate this.** Unlike § 227(b), the § 227(c) figure is a
**discretionary ceiling, not a mandatory floor**. Courts have specifically held
that statutory damages for a DNC violation should not automatically start at
$500 per call. When both § 227(b) and § 227(c) are implicated, lead the demand
with § 227(b), whose $500 minimum is mandatory.

**Threshold.** Generally requires more than one solicitation within a
twelve-month period by or on behalf of the same entity.

**Private right of action: YES.**

---

## 3. FTC Telemarketing Sales Rule — 16 C.F.R. Part 310

**Key prohibitions**
- § 310.3(a)(2) — misrepresenting any material aspect of goods or services
- § 310.3(a)(4) — making a false or misleading statement to induce payment
- § 310.4(a)(1) — threats, intimidation, or profane language
- § 310.4(a)(2) — requesting payment for recovering money lost in a prior scam
- § 310.4(b)(1)(iii)(B) — calling a number on the National DNC Registry
- § 310.4(b)(1)(v) — abandoning a call (dead air / no live rep within 2 seconds)
- § 310.4(d) — failing to promptly disclose the seller's identity and that the
  call is a sales call

**Payment-method restrictions — § 310.4(a)(9)-(10).** It is an abusive practice
to accept, as payment in a telemarketing transaction, a **cash-to-cash money
transfer** or a **cash reload mechanism** (the category that covers gift cards
and prepaid reload codes). A demand for gift-card payment is a near-conclusive
marker of fraud and is independently a TSR violation.

**Private right of action: NO** for an individual consumer in the ordinary case.
The TSR is enforced by the FTC and by state attorneys general.
→ **Route TSR findings to the regulator-referral channel, not the demand letter.**

---

## 4. CAN-SPAM — 15 U.S.C. § 7704

**Key prohibitions**
- § 7704(a)(1) — false or misleading header information
- § 7704(a)(2) — deceptive subject lines
- § 7704(a)(3) — no functioning opt-out mechanism
- § 7704(a)(5) — missing sender identification and physical postal address

**Private right of action: NO** for individuals. Enforcement runs through the
FTC, state attorneys general, and — uniquely — internet access services.
→ **Regulator-referral channel.**

---

## 5. Wire fraud and impersonation (referral only)

- 18 U.S.C. § 1343 — wire fraud
- 18 U.S.C. § 1028A — aggravated identity theft
- Impersonating a federal agency (IRS, SSA, Medicare) is a distinct offense.

**Private right of action: NO.** These are criminal statutes.
→ **Referral to FBI IC3 and the relevant agency's OIG.**

---

## 6. California provisions

- **Cal. Bus. & Prof. Code § 17538.5** — commercial email requirements.
- **Cal. Penal Code § 632** — California is a **two-party consent** state.
  Recording a confidential communication without the consent of all parties is
  unlawful. *This constrains us as much as them: our screening agent must
  announce that the call is being recorded before capturing anything.*
- **Cal. Civ. Code § 1798.100 et seq. (CCPA/CPRA)** — consumer right to deletion.
- **Cal. Civ. Code § 1798.99.80 et seq. (SB 362, the DELETE Act)** — data broker
  registration and the CPPA's central deletion platform (DROP). Since
  **August 1, 2026**, registered brokers must access DROP at least once every
  **45 days** and process pending deletion requests, completing deletion within
  **90 days**.

---

## Analyst guidance

- Cite only provisions the evidence actually supports. An overreaching demand
  letter is worse than a narrow one — it invites a dismissal and destroys the
  sender's credibility.
- Quote the transcript verbatim for each element. If you cannot quote it, the
  element is not met.
- Keep the private-right-of-action flag honest. Statutes without one still
  matter — they go to the FTC and state AG, which is a real enforcement path,
  not a consolation prize.
- Do not compute damages totals. Report the per-violation figures and the
  contact count; the application multiplies them.
`.trim();

/** Machine-readable index, used for UI chips and export metadata. */
export const STATUTES = [
  {
    citation: "47 U.S.C. § 227(b)(3)",
    short: "TCPA — automated call/text",
    perViolationLow: 500,
    perViolationHigh: 1500,
    privateRightOfAction: true,
  },
  {
    citation: "47 U.S.C. § 227(c)(5)",
    short: "TCPA — Do Not Call Registry",
    perViolationLow: 0,
    perViolationHigh: 1500,
    privateRightOfAction: true,
  },
  {
    citation: "16 C.F.R. § 310.3",
    short: "FTC TSR — deceptive practices",
    perViolationLow: 0,
    perViolationHigh: 0,
    privateRightOfAction: false,
  },
  {
    citation: "16 C.F.R. § 310.4",
    short: "FTC TSR — abusive practices",
    perViolationLow: 0,
    perViolationHigh: 0,
    privateRightOfAction: false,
  },
  {
    citation: "15 U.S.C. § 7704",
    short: "CAN-SPAM",
    perViolationLow: 0,
    perViolationHigh: 0,
    privateRightOfAction: false,
  },
] as const;
