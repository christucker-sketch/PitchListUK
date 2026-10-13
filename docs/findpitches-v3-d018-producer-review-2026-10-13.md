# D-018 producer review: where the Pi discards usable-route evidence (Claude)

- **Date:** 2026-10-13
- **Answers:** [ORDERS](../team/ORDERS.md) 13 Oct queue, Claude items 1–2, under [D-018](../team/GLOBAL_USABLE_ROUTE_POLICY.md).
- **Scope:** producer only. This does not duplicate Codex's V3 gate work, and nothing is promoted on the Pi.

## 1. Review: where producer behaviour loses D-018-valid evidence before V3 sees it

| # | Discard point | Effect | D-018 relevance |
| --- | --- | --- | --- |
| A | **Trader email routes are dropped at export.** The classifier records `mailto:` routes only when the link context is trader-specific (stall, trader, book, apply). The exporter then skips them because the v1 schema needs http(s) route URLs. | Records reach V3 as ENQUIRY_AVAILABLE **with no route at all**, or V3 never learns of the trader email that sits beside an https route. | D-018 explicitly counts *"a trader/vendor/stallholder email address explicitly published for applications or enquiries"*. |
| B | **Explicit trader contact instructions are never stored.** Text such as "email us to book a stall" is detected (`contact_instruction`), but it has no URL, so it is dropped before the routes table. | The state can say "Enquiry route only" with nothing for V3 to check. | D-018 counts *"an event or organiser page that explicitly instructs prospective traders to contact or enquire through a named current route"*. |
| C | **Watch/UNKNOWN records with an organiser route are never delivered.** The feed carries `current` plus lifecycle records only. A standing or organiser-wide intake page with no dated edition is classified UNKNOWN (usually missing `current_dates`) and stays on the Pi. | V3 cannot re-evaluate them under standing-route semantics. | Standing registration and organiser-wide intake are now valid routes; V3 decides whether the date/ongoing proof is enough. |
| D | Held for proof reasons (`geography_unverified`, `event_name_is_organiser_only`, `event_name_not_usable`, insecure URLs) | **No change proposed.** These are identity, geography or URL proof layers, not route semantics. | D-018 does not relax them. |

## 2. Prepared producer changes (source committed; **kit not yet published**)

- **(A) `trader_email` routes.** The route points at the https page that publishes the address; the address and its context go in the label. There is no schema change (`route_type` is free text). Invalid addresses are skipped.
- **(B) `contact_instruction` routes** are stored against the page that states them, with the instruction text as the label. This affects pages assessed from now on.
- **(C) Opt-in route candidates in the V3 feed.**
  - **What is delivered:** watch records with `application_state=UNKNOWN`, at least one route, every URL https, no past date, and a valid schema.
  - **How:** as `channel=watch`/`WATCH`, never customer-visible, capped at 500.
  - **Default:** **OFF**. It takes effect only after `sudo fpd-v3-feed candidates-on`, and should be switched on only once Codex confirms that V3 ingests new watch-channel ids as non-visible candidates.
  - **Manifest:** reports `route_candidates` by country and route type.
- **Tests:** 105 Python tests pass, 2 of them new: trader-email export, and candidates off by default and only as watch.

**Local measurement** (copy of the producer database from 9 Oct; indicative only):

| Measure | Result |
| --- | --- |
| Current records gaining a `trader_email` route | 32 |
| ENQUIRY_AVAILABLE delivered with no route | 15 → 2 |
| Route candidates | 40 (US 12, GB 11, CA 8, AU 6, NZ 2, IE 1) |

**Before any kit:** Chris runs the read-only `d018-measure.sh` on the Pi to get exact current numbers. The kit is published only with that measured expected effect, per the 13 Oct orders.

## Asks

- **Codex:**
  1. Confirm V3 treats `route_type` `trader_email` and `contact_instruction` as evidence to verify. The source page is the URL; the address is in the label.
  2. Confirm you want new watch-channel route candidates (C). If so, give a cap you are comfortable with.
