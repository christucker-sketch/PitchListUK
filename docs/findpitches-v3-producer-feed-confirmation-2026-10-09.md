# Cloud confirmation for the Pi lifecycle feed

9 October 2026. This confirms the cloud behaviour requested in the supplied `04_PRODUCER_V3_CONTRACT.md`. The independent producer stays logically separate; V3 receives evidence, reconciles identity and verifies readiness. No producer discovery or paid acquisition is enabled by this change.

## The three requested confirmations

1. **Non-current/non-READY records are retained and withheld.** `watch`, `held` and `retired` receipts remain immutable shadow evidence. The customer proof snapshot excludes the latest non-current/non-READY and LOW-confidence independent-producer revisions. UNKNOWN/enquiry-only states do not become READY merely because the producer calls them current.
2. **A closure for an existing stable identity advances that entity.** V3 appends a new receipt and source facts, reconciles it to the existing entity and derives its new state. It does not overwrite source fields or historical links. CLOSED_CURRENT_CYCLE/HISTORICAL map to internal CLOSED, UPCOMING_NOT_OPEN to WATCH, and retired/WITHDRAWN to WITHDRAWN. The alias works when the first delivered closure says UNCHANGED. Newer source evidence can close; stale evidence cannot reopen. A changed platform identity under a reused producer ID goes to explicit review, so this confirmation does not promise unsafe upserts for identity changes.
3. **Previously unseen WATCH records are accepted.** They remain shadow-only WATCH/quarantined/blocked according to evidence. They are not customer-ready “coming soon” inventory and are never promoted to fill the Finder.

Local producer-feed tests, the full 199-test native D1/queue suite and a deployed test-scope delivery control exercise cover these semantics. Synthetic controls are excluded from commercial counts. Deployed unchanged replay inserted zero receipts and grew zero entities; changed/new records advanced, source mutations were zero, and stale evidence failed to clear an exact recheck. No Serper or publication is involved. The completed deployed control report is included in the customer-preview machine report.

## Pi action and proof still required

The supplied handover says the installed feed is `/srv/fpd/export/v3/feed.jsonl`, switched off. The cloud is ready for the existing host command:

```sh
sudo fpd-v3-feed enable
```

This enables delivery of the existing lifecycle export. It is not an instruction to enable paid discovery, publication or a new production environment. Keep the ingest-only token separate and protected; no Cloudflare/D1/provider credential belongs on this host.

This workspace has no Pi access, so it has not run that command or claimed the host switch is active. After the switch, retain a manifest and one actual current→watch/held/retired receipt, its existing V3 entity link, source-clock custody and unavailable preview outcome. Do not manufacture an expiry, re-fetch timestamp or real closure solely for a test. The documented rollback is `sudo fpd-v3-feed disable`; it returns to current-only delivery and therefore restores the known closure-delivery limitation.

The Pi runner in the supplied contract fetches only 100 rechecks. Upgrade it to follow `next_cursor` until absent and acknowledge the exact `producer_record_id`, `entity_id` and original `requested_at`. The V3 runner modules already do this. Repeated watch ticks preserve the work token; stale, future, rejected, unlinked or ambiguous receipts cannot clear recheck state. Fetching a request is not executing it. Discovery checks and source verification remain separate responsibilities.

At the 19:13 London checkpoint, the latest Pi receipt was at 18:47:16 London, with source check 18:33:55. Earlier transport intervals were approximately 904 seconds; the latest was 1,311 seconds, so the strict cadence flag is currently false although export freshness is healthy. Observe host timing rather than claiming uninterrupted 15-minute delivery.

Structured pending rechecks were 1,389, zero fresh-evidence acknowledgement-eligible, with 205 immutable ledger acknowledgements. An all-page audit safely acknowledged 88 fresh, accepted, linked deliveries at 19:02 London: 1,409 requests became 1,321, before later watch ticks created further requests. It neither fabricated checks nor proved that the producer explicitly executed every requested recheck. The handover's earlier 337 acknowledgement claim cannot be reconstructed from the newer ledger alone. Do not add the numbers or mass-clear the backlog.

The known three-hour discovery plus one-hour export lag now has a four-hour aggregate warning. This does not extend any individual source-proof TTL. Missing records from incremental/current exports are never treated as closure.

The producer discovery engine and `deploy/pi` source are not inside the supplied ZIP; copying that source with custody into a separate owned package remains necessary. No engine has been invented or rebuilt from the old V2 repository.
