# Official UK programme

GB has its own free acquisition lane, `uk-official`. It does not depend on the
structured producer host. Structured delivery keeps its existing attribution and
priority. Paid acquisition, customer publication and production cutover remain
disabled. US catalogue growth continues independently while measured yield holds.

## Discovery and proof

The first production-quality shadow adapter is `myntimage-dated-stalls-v1`.
Mynt Image's official catalogue discovers venue pages. Each venue page publishes
year-scoped, dated stall capacity and embeds its actual trader application.
An opportunity is one source-published market date at a named venue, not an
invented repetition of a weekly rule or a separate entity per product category.

The verifier independently reparses the retained documents. READY requires a
positive **general stall** capacity, a valid date under an explicit year heading,
an active checkbox for that exact date in the venue-bound application, business
and product fields bound to actual controls, a visible POST action/submit control, and no
closed, waitlist or membership restriction. A form title may name the market or
the exact venue booking form. An unrelated venue, disabled control, missing date,
blank capacity or changed table header fails closed. Specialty capacity and visitor
footfall never substitute for general stall capacity.

Country comes from a venue-specific country assertion or the official venue
directions page's map pin, corroborated through the public postcodes.io lookup.
The directions heading must name that venue (or the source's short town/venue
name). Coordinates, lookup URL, returned country and independent distance check
must agree within 100 metres. A nearby postcode is retained as country evidence;
it is **not** presented as the venue's postal address. Company contact metadata,
applicant address controls, catalogue country labels and search cities supply no
event geography. Navigation can discover a directions page, but cannot prove an
application route.

Raw event, application, directions and geography responses are retained in
immutable `source_documents`. Bundle freshness is the oldest real component
fetch time. Venue/date source identifiers bind entity identity; proof of another
date cannot silently change an entity. The normal receipt, source-fact,
reconciliation, eligibility, enrichment and readiness pipeline still applies.
Original facts remain immutable. An uncertain or conflicting record cannot be
repaired by changing its source-backed fields to satisfy the gate.

## Bounds and accounting

An operator grants a two-hour run with at most 250 HTTP visits and 500 candidate
imports; the initial catalogue used 100/300. Every actual HTTP request, including
redirects, application forms and geography lookups, consumes a reservation before
the request. A failed request also consumes its reservation. A shared venue/form
bundle may prove several distinct dates for five minutes without another visit;
each keeps the original source fetch time. READY proof expires after 24 hours and
uses the existing pre-expiry renewal path. Retained replay cannot renew freshness.

Runs pause for a backlog above 40 due pipeline jobs, rate limits, import/custody
failure, integrity/publication boundary failure, exhausted budgets or zero READY
after 50 settled routes. The runner also stops diminishing yield after 100
outcomes if the latest 50 produce fewer than two READY. Immutable discovery and
custody tables prevent retry from changing a committed record/entity association.
Unchanged replay produces no entity growth or new source visit. Receipt replay is
reported separately from a new identity outcome.

There is no standing UK scheduler. These are bounded operator runs:

```bash
node operations/findpitches-v3/uk-growth.mjs \
  --credentials /secure/findpitches-codex-cloudflare.env \
  --state-dir /secure/v3-remote \
  --out-dir /secure/uk-run \
  --max-visits 100 --max-candidates 300
```

`--source` can target a retained official venue route. `--baseline-file` may reuse
a real earlier preservation baseline; its original timestamp remains in the
report. Use separate output directories for new runs. A stopped run is not
silently reopened or granted fresh/refunded reservations.

The US catalogue now supports bounded additional byte windows, retaining at most
2 MiB per window and reading at most 8 MiB per request. Their coverage is explicitly
partial; a later window is not described as a complete sitemap. Candidate proof
budgets, zero-yield/backlog/declining-yield guards and paid pause remain enforced.

If reconciliation commits before a response/checkpoint is lost,
`/catalogue/adopt-committed` requires an explicit operator review and joins the
immutable receipt, original discovery document, retained source document, normal
identity decision and entity link. It only records that existing custody and
settles ordinary readiness. It never re-fetches, changes identity, renews proof or
refunds the source budget. Fault-injection tests cover this recovery.

## Independent market reporting

`/status.commercial.gb` and `.us` report current READY, WATCH, quarantine, blocked,
application entities, advisory exact event groups, organisers, source domains,
families, origin producers, freshness, hold reasons, first READY today and
withdrawals today. The GB programme additionally reports adapter versions,
source visits, inspected routes, reconciled matches and READY outcomes per 100
visits. Shared pages can legitimately produce more than 100 dated opportunities
per 100 visits; this is a productivity measure, not a percentage conversion rate.

Origin attribution is exclusive; source memberships overlap. Current READY
requires live, revision-matched proof. WATCH/quarantine counts use the retained
entity market and can include disputed geography. Exact event groups are an
advisory comparison and never merge identity. New READY/day counts first proved
promotion, not proof renewals. Withdrawn/day requires a recorded non-READY
assessment today and current withholding; passive expiry is separately measured.

## Private front-end staging

`GET /staging/ready` on the owned V3 API shadow Worker returns only current,
source-proved READY fields. Filters: `market`, `region`, `location`; pagination:
`after`, `limit` (1–100). `V3_STAGING_TOKEN` is a separate read-only credential.
It authorizes this GET route only and cannot ingest, acquire, verify or write.
The front-end staging server should hold it securely and proxy the requests; do
not put it or an operator credential in browser code. The API returns no raw
evidence, source facts, operator/producer credentials or D1 access.

The response schema is `findpitches-v3-staging-ready-v1`, containing `items` and
`next_after`. Each item has an opaque ID, proved title/organiser/location/country,
region where available, event dates, application URL/state/deadline, source domain
and proof timestamps. It writes no customer projection or publication queue.
`/v1/opportunities` remains disabled. A sanitized GB snapshot is also available
for the existing front end to develop against without infrastructure credentials.

## Expansion milestones

100 GB READY is now proved. 250, 500 and 1,000+ remain independent GB milestones;
US success is never reduced to improve a geographic percentage. The next step is
another repeatable official booking family, then councils/BIDs and regional
operators across Scotland, Wales and Northern Ireland. The source-hunt report
distinguishes real application leads from generic registration, enquiry,
waitlist, stale/contradictory schedules and blocked fetches. Unverified discovery
volume is not a forecast of READY inventory.

Folk & Bespoke has 16 observed event/venue application routes and is the next
commercial adapter candidate. Validate its actual current date controls, capacity
or open-application claim, selling rights and venue country before forecasting
yield. Other identified programmes include Creative Crafts Association, CJS
Events Warwickshire, Event Owl, Vegan Market Co, Craftfolk/Cardiff Christmas
Market and Northern Ireland operators. Forms/PDFs and official venue joins need
their own raw-evidence bindings; a general trader registration is insufficient.
