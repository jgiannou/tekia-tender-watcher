# PRD — ARC Tenders SaaS features (competition)

> **Canonical product PRD (as-built overview):** [PRD-arc-tenders.md](./PRD-arc-tenders.md) — use that for the full product picture (plans, surfaces, outbox/ops, launch gates).  
> This file keeps the **competition feature decisions** (F1–F11). Where they diverge from code (e.g. TED adapter now exists behind env), prefer [PRD-arc-tenders.md](./PRD-arc-tenders.md).

**Status:** Implemented competition-feature spec (see canonical PRD for updates)  
**Date:** 2026-10-09 (pointer updated 2026-10-11)  
**Surface:** `apps/saas-web`, `apps/mobile`, `src/saas`  
**Out of surface:** internal Electron / Slack / SQLite tool

**English:** A free plan and one shared KIMDIS ingest (alert within 5 minutes) apply to every plan. Region filtering, the procurement-thread screen, the participation checklist, expiring contracts, and a thin price memory follow the practical scope below. Διαύγεια is an ADA link on the same act. Authority-site crawls, micro-procurement sites, and ΕΣΗΔΗΣ submission stay out. TED has a code adapter (env-gated) but is not a core marketing promise.

## Decisions

- **Free plan**, no card, no expiry. The 7-day Pro trial is a separate «Δοκίμασε Pro» action. It does not replace Free.
- Scans are faster than competitors who promise minutes or 1–3 emails a day: one shared ingest of new KIMDIS acts. Target: in-app and push within 5 minutes of the act appearing in Open Data.
- Followed threads are checked on that same cycle. This is not a full KIMDIS rescan per organization.
- Basic stays €4.99. Pro stays €9.99. No Business plan.
- The app organizes and records. It does not email authorities and it does not submit to ΕΣΗΔΗΣ.

## Plans

- **Free — €0, no expiry.** 1 seat, 1 saved search, 5 follows. Shared KIMDIS check every 2 minutes. ≤1 weekly summary email when there is new content (one recipient). Push and in-app without weekly delay. Region filter. Thread screen within the 5 follows. No company docs, outreach, submission recording, PDF checklist, or private bid price. Expiring contracts: count only. No AI.
- **Basic — €4.99 / month.** 1 seat, 5 searches, 30 follows. Digest at up to 2 chosen hours/day, or immediate email for followed-tender developments. Company docs, outreach, submission recording, PDF checklist (rules + citations), expiring list, award history, private bid price note.
- **Pro — €9.99 / month.** 3 seats, extra seat €2.49. 15 searches, 100 follows. Digest at up to 6 hours/day; optional immediate for high-match new opportunities. Everything in Basic. Upcoming-deadlines email. No AI.

Manual KIMDIS search stays on every plan. Refresh is not how new acts arrive. The shared ingest brings them.

## F1 — Sources

- System of record for discovery and for the thread: **KIMDIS Open Data** (REQ, PROC, award, contract).
- **ΕΣΗΔΗΣ:** no separate crawl and no submission. Acts that are published into KIMDIS are picked up from KIMDIS.
- **Authority websites and micro-procurement platforms:** out of scope.
- **Διαύγεια:** F10, a link on the same act.
- **TED:** out until a customer pursues EU tenders. No filter, screen, or landing promise.

## F2 — Speed

Replaces per-organization periodic scan quotas as the discovery mechanism.

- One worker reads new and recently updated KIMDIS acts every **1–2 minutes**.
- When an act matches a saved search: in-app and push immediately, on every plan. Email follows the plan (Free 1/day, Basic digest, Pro immediate) and does not delay in-app or push.
- Each followed thread is checked on the same cycle for a related act and for a deadline. A new development, or a deadline inside 48 hours, creates in-app and push on that cycle.
- No full historical scan per organization on each cycle. Matching runs on acts that just arrived, plus a targeted check of followed threads.
- If Open Data is down, the product says «τελευταίος επιτυχής έλεγχος στις …». It does not present a stale result as fresh.
- Acceptance target: at most **5 minutes** from Open Data availability to in-app/push in normal operation.

## F3 — Availability and the free plan

The commercial answer to competitors who are already live, often for free, is public signup on Free.

Staging, backup, and a tested restore in [production-readiness-plan.md](./production-readiness-plan.md) stay launch gates. They are not a user-facing feature.

## F4 — Region

Watch profiles offer a multi-select of Greek NUTS 2 regions:

Αττική, Βόρειο Αιγαίο, Νότιο Αιγαίο, Κρήτη, Ανατολική Μακεδονία και Θράκη, Κεντρική Μακεδονία, Δυτική Μακεδονία, Ήπειρος, Θεσσαλία, Ιόνια Νησιά, Δυτική Ελλάδα, Στερεά Ελλάδα, Πελοπόννησος.

- No selection means all of Greece.
- Match only the official NUTS field on the KIMDIS act. Do not guess a region from the title. NUTS 3 codes map to their NUTS 2 parent.
- If the user selected regions, an act with no region does not enter the feed. A counter shows «Χ χωρίς δηλωμένη περιοχή», with a choice to include them.
- The filter is on Free, Basic, and Pro.
- The same rule applies to search, expiring contracts, and price memory.

## F5 — Thread and message

One screen per tender, in this order:

1. Πρωτογενές αίτημα
2. Πρόσκληση
3. Προθεσμία υποβολής
4. Κατακύρωση

- A new related act shows **Νέα εξέλιξη** with a link. Organization actions look different from KIMDIS publications.
- An early REQ is an opportunity as soon as it is published. The product does not wait for a PROC.
- Monitoring continues after a recorded submission until award or «Διακοπή παρακολούθησης».
- Landing leads with the early request and watching that tender until award. The steps on the page follow αίτημα → πρόσκληση → προθεσμία → κατακύρωση.

## F6 — Participation checklist

Basic and Pro only.

From the notice PDF, structured fields, not an AI chat and not a bid / no-bid verdict:

- deadline
- guarantee amount and type, when stated
- award criterion
- lots
- required documents

Compared with company vault documents. These three are named when missing:

- φορολογική ενημερότητα
- ασφαλιστική ενημερότητα
- ΓΕΜΗ

Each line is present in the vault, missing, or not required by this notice. A field that is not in the text says **Δεν εντοπίστηκε** and stays empty. A scanned PDF without text says «Δεν διαβάστηκε το PDF» and links to the official file.

## F7 — Expiring contracts

A list, not a market dashboard.

- Window: contracts ending in **3 to 9 months**.
- Filter: CPVs suggested from the company KAD, and the organization's selected region.
- Each row: authority, title, CPV, end date, link to the KIMDIS act.
- One button: **Παρακολούθηση**. It counts against the plan's follow limit.
- Free sees only the count. The list and follow are Basic and Pro.
- No competitor ranking, win rate, or award census.

Contracts are those KIMDIS has published into the stored corpus (recent ingest, plus a daily sweep of the open-data publication window for the organization's CPVs). End date is the official `endDate` field. There is no separate end-date query on the Open Data API.

## F8 — Price memory

A panel on the followed tender. Basic and Pro. Not an Analytics section.

- Same CPV and same region as the tender.
- Recent winners from KIMDIS awards for that pair, with date and award amount when present.
- One ratio: award amount to budget, only when both amounts exist.
- A thin sample says «λίγες κατακυρώσεις». One result is not shown as a market price.
- Free does not see it.

## F9 — Followed cadence

Not a second scanner.

- Follow limits stay 5 / 20 / 100.
- Every followed thread is checked on each shared-ingest cycle.
- A deadline in 0–2 days pushes on that cycle, on whichever plan holds the follow. The daily deadline-radar email stays Pro.

## F10 — Διαύγεια

On the same tender screen, when a Diavgeia act references the ADAM, show the **ΑΔΑ** next to the ΑΔΑΜ and a link.

There is no Diavgeia search, no Diavgeia saved search, and no separate inbox.

The ADA stored on a KIMDIS contract (`contractRelatedADA` / `decisionRelatedAda`) is shown. A lookup against the Diavgeia open-data search for that ADAM fills the same fields when it returns a decision.

## F11 — TED

Out of this PRD until a specific customer asks for EU tenders.

## Out of scope

- Automatic sending and ΕΣΗΔΗΣ submission
- AI chat over the PDF and a bid / no-bid score
- Crawls of authority websites and micro-procurement platforms
- A separate market-statistics product
- Changes to the internal TEKIA desktop

## Launch

Public Free signup waits on green staging, backup, and restore gates. Those gates are not implemented by this feature set.
