# Upcoming producer feed: intake and customer-display contract

Claude’s 011q/011r request is supported by the existing v1 envelope: `channel=watch`, `export_readiness=WATCH`, `application_state=UPCOMING_NOT_OPEN`. V3 retains the exact raw record, including state evidence and `applications_open_on`, and internally aliases the application state to WATCH. Opening dates are evidence, not scheduled instructions to grant availability.

## Intake safeguard

A regression test exposed that D-018’s standing-enquiry exception could otherwise make an explicitly not-open edition READY. The new guard derives the original state from the currently selected application-state receipt. That edition stays WATCH even when a generic standing trader enquiry exists. The commercial/customer read model independently applies the guard, so an old READY cache cannot bypass it.

No raw record, normalised export format, original fact, authority, identity, source clock or content-hash replay rule changes. Old OPEN receipt replay cannot clear newer upcoming evidence. A genuinely newer producer state change can resume the usual proof rules. Past, closed, identity-conflicted or quality-held records retain those stronger holds. This does not disable D-018 enquiry routes for records whose producer has not explicitly declared the edition not open.

The pre-release native census found no selected UPCOMING_NOT_OPEN records, so this closes the gap before the new feed is enabled. Producer/Pi code and its switch files remain Claude/Chris owned.

## Customer presentation

Chris’s direction is to make genuine future opportunities discoverable and saveable. That requires a separate source-proved **upcoming** view, rather than counting raw WATCH as READY:

- Label **“Applications not open yet”**. Show “Opens [date]” only for an explicitly source-supported complete date; “February” does not become 1 February or an invented year.
- Prove the event identity, edition, country, physical venue and future event date independently. Retain the exact source excerpt announcing a future trader application cycle. A closed 2026 edition plus a 2027 application announcement does not silently become a 2027 event identity.
- Keep READY and upcoming totals separate. Upcoming is not an actionable application and must not improve READY conversion or paid-yield metrics.
- Offer Save through the existing account/list design once the upcoming read model and saved-item validation both support it. Never display an Apply button, send alerts or promise an automatic notification for an unopened route.
- Preserve existing Free/Pro rules and source-language facts. The unapproved broader paywall proposal is not activated by this work.
- If identity/date/geography or the future opening statement is unproved, keep the item internal WATCH/quarantine. Do not expose the full raw watch feed.

The intake confirmation does **not** claim this customer view is implemented. The present customer projection intentionally serves READY only; saved-item validation also needs an explicit extension. No future listings are made customer-visible by this release. Claude can prepare/enable bounded shadow upcoming delivery once the native intake checkpoint is recorded, subject to the existing producer classifier/host gates; no Pi installation is claimed by Codex.

## Other 16 October producer findings

A read-only V3 check at **10:24 London** found all five specifically flagged entities—Aggieland, TaSH, Rocky Butte, Monroe Street and Auburn—already withheld, with **zero in the customer catalogue**. Their source facts and identity were not rewritten. This is a measured five-entity check, not acceptance of all 17 farmers-market exports or the uninstalled producer fixes. The two unexplained Eventeny classifier changes remain Claude’s install gate.
