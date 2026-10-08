# Bounded source growth in V3 shadow inventory

Free structured delivery remains the primary producer. `platform-catalogue` is a separate, internal discovery producer that complements it using public platform catalogues and direct application documents. It does not require the Raspberry Pi host or use Serper. Customer publication, production cutover and paid acquisition remain disabled.

## Evidence and identity

Catalogue URLs and labels are discovery evidence. They supply no verified geography, date, organiser or availability. V3 imports an application only after the current source verifier proves a specific event, supported country, venue, organiser, dates, trading purpose and open application. The original fetched document and catalogue receipt remain immutable. Weak pages are retained as discovery holds without creating canonical opportunities.

Imports use the normal evidence, identity, conflict and readiness pipeline. Primary platform forms have direct-form authority (95); structured producer facts retain their existing authority (100). Disagreements and uncertain identity remain held. No source value is rewritten to satisfy a gate. Structured ingestion accepts only `independent-structured` through its ingest-only credential; catalogue controls require the operator credential.

Eventeny's `/events/vendor/` also hosts non-trading forms. Purpose is proved in the application's own heading, description or prices, excluding event descriptions and platform boilerplate. Sports registration, advertising, rentals, performers, restricted membership and nonprofit-only routes cannot become general trading READY. Sponsor routes require explicit guaranteed trading space; conditional benefits do not qualify. An actual competition that explicitly includes a selling pitch remains eligible. A source deadline after the proved event end is quarantined with its original dates retained.

Financial grants and chalk-artist participation are held as non-trading forms. “Commercial” alone cannot supply trading purpose. Artist-only headings need evidence from their own application: explicit sale of artwork/creations, or a specifically priced artist-alley table. Generic artistic participation and prohibited selling cannot qualify. Restricted local-artist forms without proved trading purpose stay held.

Performer/volunteer forms and candy-handout participation do not qualify through incidental food-truck, vendor or optional booth-rental words. Shopping-centre merchant-only participation remains restricted. Contact mailboxes and URLs containing “vendors” cannot supply trading proof. Older proof reports are evaluated conservatively from retained application descriptions until replayed with typed role evidence.

The application's own explicit event-date assertions must agree with its proved parent event. Historical references and partial dates do not supply inferred editions. Youth/age-limited routes remain held for audience review. An Eventeny application redirecting to another vendor ID, or changing its previously proved parent event, is an identity hold; verification adds no replacement facts in that case. Parent-event canonical URLs must match the application proof. A truncated historical JSON-LD excerpt falls back to its immutable full source document to preserve that binding, without another source visit.

A named event year outside its proved date range is also held, even when the application heading names a newer year. A multi-year name inside the source's stated range does not invent a narrower season or change its dates. These checks also apply to older current proof and first-READY metrics.

Policy replay re-examines the retained document without claiming a new visit, resetting freshness or adding replacement facts. Current inventory and first-READY KPIs reject unsupported purpose/audience and contradictory chronology even when old cached reports claimed READY.

READY counts distinct application-opportunity entities. The commercial report also discloses exact event-field groups and multiple-application groups. This advisory comparison does not merge identities or establish semantic duplicates.

## Limits and recovery

Each operator grant permits at most **2,000 candidate fetch reservations** and expires after **six hours**. Three operator lanes pace a host at least 1.5 seconds apart. There is no standing catalogue scheduler. Discovery is separately bounded to pages of 500 routes; the large Eventeny XML document retains at most a 2 MiB prefix and is explicitly labelled incomplete coverage. The default operator scan registers up to eight pages, with an explicit maximum of fourteen pages; verification remains capped at 2,000.

The cloud rejects work when paid acquisition/publication are enabled, customer/publication rows appear, preservation controls are absent, or current READY scope/chronology claims are invalid. The runner stops on source rate limits, a verification backlog over 40 due core jobs, zero READY after 50 checked candidates, unexpected paid spend, source/identity mutation or a failed import. After 500 outcomes, fewer than two READY in the latest 200 visits also pauses the run (`diminishing_ready_yield`). Early successes cannot justify exhausting a stale tail. Candidate counts alone are not success. Original source rows and canonical identity/scope are compared against the private baseline at completion.

Every fetch consumes a durable reservation before the visit. Retry/recovery never refunds it. Checked outcomes and reservations are reported separately. Imported routes and routes checked within 24 hours are skipped by a new grant. Replay never creates entity growth.

A lost response is recovered from D1's custody receipt. An expired lease can return to pending only when no document/record/producer receipt was committed. A committed interrupted receipt can be settled only against its original record, linked identity and source document. It recomputes readiness through the current gate, adds an immutable settlement audit and performs no fetch, proof renewal or identity change. Expired proof yields WATCH.

Uncommitted lease cleanup is allowed while an unexpired grant is paused; it does not resume acquisition. A failed budget-reservation response clears only its own uncommitted lease and pauses the run. Reservations are retained even if the database update committed before the response failed. If cleanup itself was interrupted, expired-lease recovery remains available. Error reports expose safe failure classes rather than SQL, source payloads or credentials.

An operator-reviewed resume checks custody, queue and current scope health and retains the original cap, consumed reservations and expiry. It writes an immutable review receipt. Expired or exhausted grants cannot be reopened; create a new bounded grant. Automatic quality stops are investigated before a reviewed resume.

## Running and observing

Use the existing checkout and pinned Node 22 toolchain. Credentials and private baselines remain outside Git; never print them or commit raw exports/source documents. The existing cloud environment configuration supports this workflow.

```bash
source /workspace/.pitchlist-cloud/env.sh
unset V3_TOOLING_ROOT
cd /workspace/PitchListUK
node operations/findpitches-v3/catalogue-growth.mjs \
  --credentials /secure/cloudflare.env \
  --state-dir /secure/v3-shadow-state \
  --out-dir /secure/new-bounded-run \
  --max-candidates 2000 --catalogue-pages 8
```

The same output directory resumes an unexpired, reviewed active grant using authoritative receipts; it cannot renew an expired grant. New runs need a new private output directory. `inventory-scale.mjs` separately prioritises unverified retained Eventeny/LocalStalls routes without accessing V2 or paid search.

Authenticated enrichment endpoints are `/catalogue/start`, `/catalogue/discover`, `/catalogue/verify`, `/catalogue/stop`, `/catalogue/recover`, `/catalogue/settle`, `/catalogue/resume` and `/verification/replay`. Recovery, settlement and resume are distinct operations with separate guards. `/status.free_source_discovery` reports run limits, reservations, dispositions, expiry, stop reason and invalid current scope claims. `/status.commercial` and operator-only `/commercial` report current proof-backed inventory, producer/country/source attribution, coverage, first-READY growth, paid yield and event-group comparisons.

Run the full V3 suite and boundaries check:

```bash
cd /workspace/PitchListUK/operations/findpitches-v3
npm test
npm run check
```

The growth report contains aggregate metrics; private receipts, entity rows and preservation hashes stay in the operator output directory. A successful run demonstrates present source-proved inventory, not permanent completeness or international coverage. Readiness expires and needs direct source renewal. Generic LocalStalls contact pages, partial date chips and region paths cannot supply missing proof. International expansion needs explicit organiser/application evidence rather than inferred geography or relaxed gates.
