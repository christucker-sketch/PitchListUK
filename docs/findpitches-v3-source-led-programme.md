# Bounded source-led paid programme

The paid source-led lane complements independent structured discovery and direct verification. It has no standing paid scheduler. Every paid query requires an operator-authenticated, expiring shadow programme and a one-query grant. The old city-pilot start endpoint is retired, city bulk acquisition remains disabled, and publication routes remain blocked.

The initial persistent commercial policy permits **25 total V3 paid queries or conservative credit units per Europe/London calendar day**, including older canaries and every other V3 paid lane. The global 4/run, 100/hour and 1,000/day query/credit limits still apply. Query reservations and conservative credits are counted before dispatch; uncertain outcomes retain their reservation and cannot be retried into another provider request. Observed charges exceeding the one-credit reservation latch a pause. The lower limit is enforced by both the atomic reservation statement and a database insertion guard.

GB, CA, AU, NZ and US receive five source-led query slots each per London day, shared across sessions. The reviewed plan rotates through all five markets rather than filling US slots first. Country quotas are targeting budgets, never geographic evidence. Fetched events outside their assigned market are retained as out-of-market discoveries and cannot create entities through this lane. A programme expires after at most three hours or at London midnight. A new programme never resets consumed budget or country quotas.

## Discovery and proof

Search titles, snippets and target countries are immutable discovery receipts. They cannot qualify an event, application route or canonical country. Social pages, directories, visitor tickets, editorial pages and login shells are excluded before verification. Already-known canonical/application routes and recent discovery URLs are deduplicated before fetching. Relevant PDFs and external forms are retained as unsupported discovery until a source-bound verifier exists; dedicated paid PDF searches are deferred until that verifier exists; they cannot become READY through a search snippet or form URL.

Each eligible candidate is fetched directly by the shadow worker without forwarding operator or provider credentials. An entity may be created only when the source itself supplies event identity, country and edition. Evidence includes the fetched document hash, exact source facts and the discovery receipt link. Existing reconciliation and additive authority rules handle identity and selection. The normal source-verification/readiness chain must finish before the next paid query is admitted. No original receipt, source field, country or edition is overwritten.

Supported proof families include Eventeny vendor-ID-bound event/offers/control data and LocalStalls event details linked to unique application/event UUID controls with explicit open state. The initial official organiser verifier requires a single bound event, source country/full venue/dates/organiser, an organiser URL on the source host, and an explicitly open, scoped inline vendor application form. Footer/navigation controls, an application link alone, contact/login forms, tickets, waitlists and unsupported PDFs never qualify. Sources outside these supported patterns remain unverified/WATCH/quarantined. This intentionally limits official-form conversion until measured source-specific adapters justify expansion.

## Stops and telemetry

The programme pauses automatically on:

- Zero new READY after ten settled queries (two round-robin queries per market).
- Fewer than 0.1 new READY per query after that warm-up.
- Duplicate candidate rate above 70% or excluded source mix above 50% after 20 candidate occurrences.
- More than 40 due core jobs, oldest due age above 120 seconds, or more than ten pending candidates.
- A failed/uncertain paid request, failed candidate verification requiring review, a detected false READY promotion, source-integrity failure, customer/publication leakage or bulk enablement.
- The commercial query/credit cap, a country quota, grant expiry, repeated query or a global Serper budget threshold.

Integrity, poor-yield and quality failures latch the persistent commercial policy paused; another programme cannot bypass the pause. Raising limits or resuming after a latched failure requires a deliberate operator database policy change, recorded in policy history. There is no HTTP endpoint that increases limits or silently clears a pause. A calendar reset clears daily usage headroom, not a latched quality pause. Structured reconciliation takes priority over a new paid grant.

`/status.source_led_programme` and authenticated `GET /source-led/status` expose the policy, remaining queries/credits, country slots, sessions, stop reason and yield. Metrics include attempts and observed credits, candidate occurrences/distinct URLs, distinct/created/verified entities, current READY and READY gained, duplicates, WATCH/quarantine, country/source breakdowns, READY per 100 queries and queries/credits/cost per READY. New READY excludes entities with an earlier proved READY history. Unsupported/unproved discoveries remain visible without inventing canonical geography. Unknown monetary pricing and cost with no READY are `null`, never zero.

## Operator workflow

Use the existing secured Cloudflare/operator bindings; do not copy credentials into reports or producer-host files. From the repository with Node 22 and pinned tooling:

```sh
node operations/findpitches-v3/source-led-pilot.mjs \
  --credentials /tmp/findpitches-codex-cloudflare.env \
  --state-dir /workspace/.pitchlist-cloud/v3-remote \
  --out-dir /workspace/.pitchlist-cloud/v3-remote/source-led-pilot
```

The runner snapshots immutable facts/receipts and entity identity, grants one query, verifies eligible candidates, settles the shadow pipeline, checks custody before further spend, and finally pauses the programme. Private source documents remain in the private state directory/D1; publish only the aggregate readiness report. It never reads or writes V2.

The Raspberry Pi independent-producer host remains an external installation/delivery dependency. Its secure ingestion/replay/recheck path and 15-minute delivery configuration remain primary. This programme does not claim that the host is live or redirect the producer through paid search.
