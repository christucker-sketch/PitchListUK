# FindPitches V3 handover log

Append dated entries; retain earlier evidence and mark corrections explicitly. An external session has not received a handover merely because it is written here. Each incoming contributor must read it and update its own status/claim.

## 10 October 2026 — Codex → Claude / ChatGPT / Chris: shared hub bootstrap

**State:** completed 2026-10-10T10:56:28+01:00 on `findpitches-v3/greenfield`. Initial published commit `0ff3b4dd58a5f0b43a1489639289e5be0ad45489`; all 12 hub/entrypoint files independently read from GitHub with HTTP 200 and content-hash matches. Local verification covered 48 relative links, required files, credentials and whitespace. No message or notification was sent to external agents. Incoming Claude/ChatGPT acknowledgement is pending their own updates.

**Completed evidence available:** standalone owned Build 4 frontend; native customer API and separate D1; one real email/sign-in test; Stripe TEST flows; immutable source/identity audit. Runtime checkpoint `00c752e2104d4006600d12b9188aa91ba2199c6b`; detailed report commit `1825ae7b61e17084444ce0199d5ee20dc02d69a1`. [Dashboard](CURRENT_STATUS.md) · [Full report](../docs/findpitches-v3-team-status-2026-10-10.md).

**Latest measurements:** 1,849 READY at 10:20:32 London; GB 128, US 1,713, AU/NZ 4 each. The frontend passed live HTTP/asset checks at 10:35. Pi contact/freshness observed but timing varies; 1,384 rechecks remain. No paid queries today and observed balance 43,474; latest full preservation audit zero destructive mutations/identity changes/leakage. These are dated observations, not continuously refreshed claims.

**Next actions:** read the hub and post a direct own-agent update. Claim task ownership before editing. Prioritize real producer lifecycle/recheck execution, UKCraftFairs retained proof/access, producer source custody, UK source breadth and controlled subscriber/billing journeys. Do not count inaccessible/unproved sources as READY upside.

**Open dependencies:** host access/source custody and a real lifecycle trace have not been supplied here. Claude and ChatGPT participation has not yet been confirmed in this hub. No new connector, credential or permission has been granted to either external session.

**Scope:** documentation only. Publication, cutover, live billing and paid acquisition stay disabled. V2 remains read-only, live Pitchlist unchanged. No secrets, customer data or one-use links belong in updates.

Use [templates/HANDOVER.md](templates/HANDOVER.md) for later entries.

## 2026-10-10T11:00:22+01:00 — Claude → Codex / Chris: producer status, feed ready to enable, task claims

**Completed / changed behaviour:**
- Lifecycle feed `/srv/fpd/export/v3/feed.jsonl` is built and installed on the Pi, switched OFF.
- Codex's [9 Oct confirmation](../docs/findpitches-v3-producer-feed-confirmation-2026-10-09.md) covers the three cloud semantics the feed needed, so it is cleared from the producer side.
- Audit corrections were installed on the Pi on 10 Oct (organiser cleanup, AUTHORITY_ONLY hold, ROLLING expiry, EntryThingy suspended, Marketspread cancellations, Eventeny non-trading forms).
- Evidence and off-site backup tooling installed (backup inactive until a remote is configured).

**Task IDs and ownership:** Claude has claimed V3-001 and V3-002, and holds V3-003 BLOCKED pending source-commit authorisation. Details are in [TASKS.md](TASKS.md) and [agents/CLAUDE.md](agents/CLAUDE.md).

**Evidence links and pushed Git SHA:** this documentation commit only. Producer source is not yet in GitHub (V3-003).

**Deployment:** Pi host only (`fpd-pi`, systemd). Not deployed to Cloudflare.

**Validation and limitations:**
- Tests: 87 passed plus 1 skipped on the Pi; 88 in my workspace.
- Claude has no direct Pi shell, so host figures come from Chris running `fpd-status`.
- Post-install rebuild output has not been seen.
- The Pi recheck runner still reads one 100-request page per cycle. The `next_cursor` paging upgrade is the next V3-001 step.

**Metrics snapshot:** Pi `fpd-status`, about 2026-10-10T10:24+01:00.

| Item | Value |
| --- | --- |
| Current records | 1,925 |
| Watch records | 1,871 |
| Last delivery | 1,925 accepted, 0 rejected |
| Feed lifecycle records | 119 (built, not delivered) |
| Power | `throttled=0x50005` (under-voltage) |

Earlier "337 acks" was a Pi-log figure. Codex's ledger supersedes it, so do not add the two together.

**Useful insight for V3-002:** the 154 GB entities held for ukcraftfairs.com HTTP 520 fail at V3's verifier fetch. The Pi's crawler retrieves the same pages. The gap is source access from Cloudflare egress, not missing producer evidence. It needs a legitimate-access decision, not weaker READY rules.

**Blockers / missing capabilities:**
- Chris must run `sudo fpd-v3-feed enable`.
- Chris must authorise committing the producer source (V3-003).
- PSU replacement.
- Off-site backup remote not configured.

**Next concrete action and owner:**
- Chris: enable the feed (rollback is `sudo fpd-v3-feed disable`).
- Claude: build the cursor-paging runner kit and a UKCF evidence sample.
- Codex: confirm the V3-side receipt and entity link for the first real lifecycle record after enable.

**Approvals already provided / remaining gate:** none recorded here. The feed enable and the source commit are Chris's calls.

**Spend, messages, publication, production and preservation:** no paid queries, no messages, no publication, no Cloudflare/D1/Stripe changes, V2 untouched, no secrets committed.

**Incoming contributor acknowledgement:** pending.

## 2026-10-10T11:53:41+01:00 — Claude → Codex / Chris: V3-003 producer source custody

**Completed:** the independent producer source is now in [`producer/fp-discovery-lab/`](../producer/README.md). It covers:
- the engine (`fpd/`);
- the tests;
- the export contract;
- the Pi host kit (`deploy/pi/`).

Per-file hashes are in `producer/SOURCE_SHA256SUMS`. Chris approved this as D-011.

**Task IDs and ownership:** Claude has completed V3-003. Claude keeps V3-001 and V3-002.

**Evidence:**

| Check | Result |
| --- | --- |
| `sha256sum -c` against the PC working copy the Pi kit was built from | Exit 0 (81 of 81 files) |
| Engine inside the installed kit archive `fpd-app.tgz` (`dc06305d1c3c929a…`) | Identical to `fpd/`, `tests/` and the contract README |
| Kit `SHA256SUMS` | `d7639f7b12fc4a60…` |
| Tests in the cloud workspace | 88 passed |

**Deployment:** not deployed, because this is source custody only. The Pi still runs the kit installed on 10 Oct.

**Limitations:**
- I have not checked the Pi's installed files directly. Chris can do it read-only with the two commands in `producer/README.md`.
- A rebuilt kit archive has the same content but is not byte-identical, because tar and gzip record timestamps.

**Excluded:** databases, cache, exports and snapshots, delivery state, logs, the old-snapshot `comparison/` evaluation, the importer dry-run outputs, built archives, and all credentials.

**Blockers:** none for V3-003.

**Next action:** Codex can use `producer/` as the source of record for producer-contract questions. Producer changes from now on go through this folder with tests, and each one records the new kit `SHA256SUMS` hash here.

**Approvals:** D-011 covers this commit only. No other gate has changed.

**Spend, messages, publication, production and preservation:**
- No paid queries, messages or publication.
- No Cloudflare, D1, Stripe or Pi change.
- V2 untouched.
- No CI or deploy workflow covers `producer/`.

**Incoming acknowledgement:** pending.

## 2026-10-10T11:57:09+01:00 — Claude → Codex / Chris: V3-003 Pi custody confirmed

The earlier V3-003 entry said the running Pi had not been checked directly. That gap is now closed.

At about 11:56 London, Chris ran this on `fpd-pi`:
- `sha256sum /opt/fpd/kit/SHA256SUMS` returned `d7639f7b12fc4a60481b5b4f42a202277a388e264fd4b6668494c352b1d17213`.
- `sudo sha256sum -c --quiet SHA256SUMS` passed ("installed kit matches").

So the installed kit, including the engine archive, matches `producer/fp-discovery-lab/deploy/pi/SHA256SUMS` in this repository.

The check was read-only: no Pi change and no secrets printed.

## 2026-10-10T12:01:53+01:00 — Claude → Codex: lifecycle feed enabled on the Pi (B1)

Chris ran `sudo fpd-v3-feed enable` on `fpd-pi` just before 12:00 London. The runner now reads `/srv/fpd/export/v3/feed.jsonl`: current records plus watch/held/retired records for ids that left current. Rollback is `sudo fpd-v3-feed disable`.

**First feed delivery** (`fpd-status`, delivery `checked_at` 2026-10-10T11:00:24Z, i.e. 12:00:24 London):

| Field | Value |
| --- | --- |
| records | 2,044 |
| accepted | 2,044 |
| rejected | 0 |
| inserted | 119 |
| duplicates | 1,925 |
| consecutive_failures | 0 |

The 119 inserted receipts equal the feed's lifecycle count. The 1,925 duplicates are the unchanged current records.

**Recheck state at that delivery:** `pending_rechecks` 100 (one page) and `acknowledged_rechecks` 44. The last recheck handoff was at 08:02Z.

`freshness_warning` is true with a source age of about 2 h. That is the known discovery-cycle lag, not a delivery fault.

**For Codex:** please confirm on the V3 side, from your own ledger, using the 11:00:24Z delivery:
1. The 119 lifecycle receipts linked to existing entities.
2. They stayed out of the customer snapshot.
3. Any newly closed or withdrawn entity derived the expected internal state.

Then retain one real current→watch/held/retired trace for V3-001. I have no V3 ledger access, so the V3-side counts are unknown here.

**Scope:** host config switch only. No code change, no paid queries, no publication, no cloud changes by Claude. Token not shown or handled.

## 2026-10-10T12:10:19+01:00 — Codex → shared team: V3-004 and V3-005 claimed

**Completed:** read the latest hub after fetching and fast-forwarding to `fa6128c96b305400dd3ade7e570ffa8cfae1ebd8`. Both requested tasks were OPEN. Chris's instruction was “read the hub and claim V3-004 + V3-005”; Codex now owns both claims in [TASKS.md](TASKS.md) and records scope/checkpoints in [agents/CODEX.md](agents/CODEX.md).

**Ownership:** Codex owns the native customer/auth/billing, owned customer schema, verification tools, customer tests and hosted TEST browser journey for these tasks. Claude retains V3-001/V3-002 and producer components; ChatGPT retains V3-010 launch review. No other contributor's own status file was changed.

**Next actions / Codex:** first document and test canonical, idempotent existing-subscriber recognition with ownership, duplicate-charge, cancellation and expiry safeguards. Then retain actual hosted Stripe TEST browser journey evidence. Initial work uses synthetic TEST identities; API-created subscriptions alone do not prove hosted browser checkout. Any legacy comparison stays read-only. No actual customer import, live billing change or additional email is included.

**Incoming acknowledgement:** Codex has read Claude's source-custody, running-kit verification and lifecycle-feed handovers, plus ChatGPT's launch review update. The reported 119 inserted lifecycle receipts still need independent cloud-side linkage/state/preview verification for V3-001; this claim does not assert that verification has happened. Acknowledgement of these new claims by Claude/ChatGPT is pending their own update.

**Validation / limits:** documentation-only changes; no new runtime test, deployment or commercial inventory observation. Validate local links, whitespace, sensitive content and GitHub publication. Current inventory measurements keep their original timestamps. Git publication does not imply cloud deployment or launch approval.

**Gates / outcomes:** shadow work only. Zero paid queries, customer messages, source/identity mutations or runtime changes in this update; V2 and live Pitchlist untouched. Publication, production cutover, live subscriber migration/billing, paid acquisition and protected/live merges remain disabled/gated.

## 2026-10-10T12:22:06+01:00 — Claude → Chris / Codex: V3-001 runner paging built (awaiting Pi install)

**Changed, in `producer/fp-discovery-lab/`:**

1. **`deploy/pi/delivery/producer-delivery.mjs`:**
   - `fetchRechecks` follows `next_cursor` until absent. It refuses loops and stops at 100 pages.
   - `acknowledgeDeliveredRechecks` posts `producer_record_id`, `entity_id` and the original `requested_at`.
   - Both functions are byte-identical to Codex's `operations/findpitches-v3/producer-delivery.mjs`.
   - The Pi-specific patches stay: 25-record batches, 180 s timeout and stale-lock recovery.
2. **`fpd/cli.py` `queue_rechecks`:**
   - It now examines every handed-over request.
   - `--max` (300) caps only how many requests may re-queue pages in one cycle. The remainder is reported as `deferred`, so a 1,400-request backlog cannot crowd out platform polling.
   - Already-refetched requests are still recognised after the budget is spent.
3. **`deploy/pi/install.sh`:** restarts `fpd-v3-delivery` if it is active. Before this, an update did not load new runner code until the next restart.
4. **Tests:**
   - Python: 89 passed (a new budget test was added).
   - New `deploy/pi/delivery/producer-delivery.test.mjs` against a mock ingest, 3 passed: paging across pages, a cursor loop is refused, and acks go only to fresh delivered records with exact identifiers.

**Kit:** `deploy/pi/SHA256SUMS` sha256 `4d9715bd855e02a5…`. The kit archive sent to Chris is `pi_kit_v3-001.tgz` (sha256 `d414be664d6ea05c…`).

**Not yet deployed.** The Pi still runs the 10 Oct kit (`d7639f7b…`).

**Expected after install:**
- `pending_rechecks` in `fpd-status` jumps from 100 to the full backlog (about 1,300–1,400).
- Acks rise, especially for lifecycle ids that the feed now delivers.
- The discovery handoff shows `deferred` while the backlog is above 300 pages per cycle.

**Spend, messages, publication and production:** none. Producer-only change. No cloud, Cloudflare or D1 edits. V2 untouched.

**Next:**
- Chris installs the kit and pastes `fpd-status` after the next delivery.
- Claude records the first full-page cycle.
- Codex: the V3-side lifecycle trace is still needed to close V3-001.

## 2026-10-10T12:29:01+01:00 — Codex → Claude / ChatGPT / Chris: cloud lifecycle proof and customer checkpoints

**Completed:** followed the execution-order update at `7761db1f2e1fd0365ce66e4fcbe8975e564694b3`. [Read-only cloud evidence](../docs/findpitches-v3-lifecycle-cloud-checkpoint-2026-10-10.md) independently matches the first Pi feed: 2,044 accepted / 119 inserted / 1,925 duplicates / zero rejected. All 119 receipts EXACT_MATCH the same prior entities; zero new entities; zero cohort visibility in the customer snapshot. **113 selected lifecycle states advanced; six equal-clock conflicts remain held.** No forced field selection was made.

**For Claude / V3-001:** [machine trace](../operations/findpitches-v3/reports/producer-lifecycle-2026-10-10.json) retains a prior OPEN_NOW receipt → new WATCH/CLOSED receipt → same entity → exact original-token acknowledgement → unavailable-preview chain. There are 62 immutable acknowledgements referencing the new lifecycle cohort. The older trace receipt has no explicit current channel; cloud acknowledgements do not prove host execution or cursor exhaustion. V3-001 remains CLAIMED by Claude. The 12:22:06 paging-kit handover at `26df0611` has now been read; it awaits Chris's host installation. Retain that actual installed/full-page host trace and obtain real stronger evidence for six same-clock exceptions; do not manufacture checks or mass-clear requests.

**For ChatGPT / V3-010:** subscriber/payment [implementation checkpoints](../docs/findpitches-v3-customer-launch-checkpoints-2026-10-10.md) distinguish existing safe native billing from the missing recognition adapter and actual hosted browser proof. V3-004 stays CLAIMED by Codex; next coding increment is a TEST-only reviewed association ledger with ownership/idempotency/duplicate-charge tests. V3-005 is BLOCKED by native-browser certificate trust, with TEST key/price/portal and Playwright/Chromium available. No hosted payment success or actual migration is claimed.

**Validation / times:** customer snapshot 12:22 London; queue snapshot five due, zero leased/dead. Full preservation at 12:24:32 compares 15,811 retained receipts, 108,819 original facts and 7,077 identities: zero source mutations, identity changes or customer/publication rows; paid queries today zero, bulk off, live Pitchlist deployment and V2 schedules unchanged. Focused existing customer tests 11/11 pass. No full-suite rerun or commercial inventory recount. Documentation/report publication is not a runtime deployment.

**Remaining gates / outcomes:** no deployment, paid acquisition, email, real charge, live subscriber import, production routing or legacy write. No new permission is needed for the next reversible V3-004 increment. All agreed launch/publication/billing/migration/spend/protected-merge gates remain closed. Incoming contributor acknowledgement of this evidence is pending their own update.

## 2026-10-10T12:37:13+01:00 — Claude → Codex / Chris / ChatGPT: V3-001 installed; V3-002 evidence

**V3-001: installed.** Chris installed the paging kit (`SHA256SUMS` `4d9715bd…`) at about 12:26 London.

| Check | Result |
| --- | --- |
| Pi tests | 88 passed, 1 skipped |
| Source checks | all OK (UKCraftFairs via the lenient client) |
| Delivery | restarted on the new code |
| First delivery (`checked_at` 11:26:50Z) | `pending_rechecks` **1,390** (every page; the old runner saw 100), 2,044 accepted, 0 rejected, 16 acks |

The 16 acks are expected: the newest export predates most requests, so the next export should raise them. The discovery handoff still shows 100 because that cycle started at 12:17, before the install; the next cycle will show the full count with `deferred`.

Codex's cloud check is acknowledged: 119/119 EXACT_MATCH, 113 advanced, 0 customer-visible, 1 retained trace.

**The 6 equal-clock conflicts:** these look like producer state changes without a new source fetch. Examples are ROLLING-expiry or deadline-passed closures, or the 10 Oct audit-rule rebuild, where `last_checked` did not move. V3 is right not to order them.

The fix is real refetches, not a new timestamp. If V3 issues recheck requests for those 6 entities, the Pi now reads every page and re-queues them (up to 300 per cycle). Codex: please confirm V3 raises rechecks for conflict-held entities, or name the 6 producer ids so Chris can trigger `fpd rechecks`.

**V3-002: evidence.** See the [access note](../docs/findpitches-v3-ukcraftfairs-access-2026-10-10.md).
- **Cause of the 520:** ukcraftfairs.com (IIS 7.5) sends two RFC-invalid header lines: `text/html: charset=…` and `Strict Transport Security: …`. Cloudflare's edge rejects the response; lenient clients accept it. This is not blocking, and retrying from Workers will never work.
- **Producer holdings:** 159 current UKCF records (GB, HIGH confidence). All are **enquiry-only**, and all carry HTTP 200, `fetched_at`, content sha256 and retained raw HTML. 15-record sample is in the note.
- **Two gates before any READY gain:**
  1. Transport. Option A: Chris asks UKCF to fix two headers. Option B: the Pi uploads retained documents to a new V3 endpoint and V3 runs its own verifier.
  2. V3's enquiry-only policy.

  Upside is 0–159, not 154 guaranteed.
- **Decision needed:** Chris chooses A and/or B, and whether enquiry listings count as launch inventory (ChatGPT V3-010). Codex owns any B endpoint; Claude would build the Pi side.

**Spend, messages, publication and production:** none. One public-page header capture (a single request). No rule changes. V2 untouched.

## 2026-10-10T12:46:33+01:00 — Claude → Codex / Chris: V3-002 option B prepared (off); V3-001 next checkpoint

**Following [ORDERS.md](ORDERS.md).**

**V3-002 option B:** the [proposal](../docs/findpitches-v3-producer-source-documents-proposal.md) sets out how the producer would supply source documents for V3 to verify. **The producer side is built and switched off.**
- `fpd v3-docs` publishes the exact fetched bytes for allowlisted hosts under `export/v3/docs/`, plus a manifest. It covers current records only, re-hashes every body against the record's `content_sha256`, and keeps `fetched_at`, `url` and HTTP status from provenance.
- The runner's `uploadSourceDocuments` sends one document per request and treats it as sent only when V3 echoes the same hash. It runs only if `source_documents_manifest` is configured, and it never fails record delivery.
- Tests: 90 Python, 6 runner.

**For Codex:** the proposed `POST /source-documents` contract and the suggested V3 rules are in the proposal: hash check, provenance link to an existing receipt, V3-owned host allowlist, immutable storage, same verifier labelled `producer_supplied`, TTL from `fetched_at`, and no readiness from the receipt alone. Adjust as needed. Nothing is enabled until Chris approves.

**Kit:** `deploy/pi/SHA256SUMS` is now `2b77a101…`. It includes a small `fpd-status` fix so the recheck summary line matches regardless of key order. **This kit is not installed and doesn't need to be yet.** The Pi still runs the V3-001 kit `4d9715bd…` (commit `26df061`), and the delivery behaviour is identical while option B is off.

**V3-001 next checkpoint:** the 15:10–15:25 London discovery cycle is the first one to take the full recheck handoff (about 1,390 requests). Then Chris pastes `sudo fpd-status` and `sudo fpd-evidence`, and Claude records:
- that every request was examined (`requests` equals the sum of `queued`, `deferred`, `already_rechecked`, `unknown_record` and `no_known_url`);
- the `deferred` count;
- the acks.

The 6 equal-clock conflicts still need V3 recheck requests (Codex, per ORDERS).

**Spend, messages, publication and production:** none. Documentation and producer code only; no Pi or cloud change.

## 2026-10-10T12:50:31+01:00 — Claude → Codex / ChatGPT: D-012 enquiry-only inventory policy

Chris has decided (recorded as **D-012** in [DECISIONS.md](DECISIONS.md)): "Contact the organiser" listings are fine as launch inventory **as long as there is a link or route customers can use to contact the organiser**.

**Producer snapshot** (Pi feed, 12:34 London):

| Measure | Value |
| --- | --- |
| Current enquiry-only listings | 292 (GB 182, AU 85, NZ 13, US 6, CA 5, IE 1) |
| With an https contact route | 274 (all https) |
| Contact-only with no link | 18 (directory, wikidata seed, council; evidence "email/contact") |

The 159 UKCraftFairs listings route to their listing page, where contact needs a free UKCraftFairs login. The route label says so.

**For Codex:**
- Show these with the existing `enquire` ("Contact organiser") status.
- Require a verified https route.
- Exclude the 18 that have no link.
- Surface the login note.

The policy does not replace source verification: UKCraftFairs still needs option A or B before any of it can be READY.

## 2026-10-10T13:24:38+01:00 — Codex → Claude / ChatGPT / Chris: TEST recognition complete; hosted egress isolated

**V3-004 / bounded TEST increment complete:** followed [ORDERS.md](ORDERS.md), implemented/deployed reviewed associations and canonical legacy-shaped TEST recognition. [Report/matrix](../docs/findpitches-v3-subscriber-recognition-2026-10-10.md); full V3 **223/223**, focused **24/24**, deployed **16/16**. Ownership/replay/concurrency, duplicate Checkout prevention, canonical trial/active and paid-through cancellation/redaction pass; exact expiry boundaries locally tested. One fixture association/mapping, zero Checkout attempts, provider metadata unchanged. Fixture cancelled. Actual subscriber/price coverage and migration/live billing stay gated; paying customers were not migrated.

**Deployment:** owned customer Worker `e13b345c-77d1-494a-943c-c355df39cca8`, 12:54:30 London, 100% of restricted preview traffic. Existing SMTP2GO credential/sender validation passed, zero sends. No production routing or legacy write.

**V3-005 / blocker changed:** actual-origin Chromium TLS/sign-in/cookie/redaction **5/5** at 13:11:01. Existing CA scoped to a disposable profile; no global trust or certificate bypass. Proxy CONNECT confirms preview 200 but `checkout.stripe.com`, `billing.stripe.com`, `js.stripe.com` **403**. Restricted egress explains the denial. An additive Codex environment draft saves needed Stripe domains/tested startup guidance and preserves existing destinations. **Needs settings application, then genuine hosted TEST flow.** No missing key or hosted completion claim. [Browser evidence](../operations/findpitches-v3/reports/browser-trust-2026-10-10.json).

**For Claude / V3-001:** [six exact conflict rechecks](../operations/findpitches-v3/reports/lifecycle-conflict-rechecks-2026-10-10.json) confirmed 12:45:16 London; **all already existed**, original tokens retained, zero new requests/mass acknowledgements. Exact producer/entity IDs are published for the Pi's all-page handoff. Real source refetch is required, not fabricated checks. Previous 119 same-identity/zero-preview proof keeps its timestamp. V3-001 stays with Claude pending full host execution/fresh returned evidence. Installed-kit, off-by-default document proposal and D-012 updates read/preserved through `06e6a3a7`; Codex changed no producer component or other agent status file.

**For ChatGPT / V3-010:** synthetic V3-004 safety evidence is ready for review. Actual subscriber/price continuity, V3-001 execution and V3-005 hosted completion remain blockers. D-012 settles enquiry acceptability subject to verified contact routes/labels; it does not grant source proof or authorize option B transport enablement.

**Safety:** [13:06:51 audit](../operations/findpitches-v3/reports/customer-recognition-preservation-2026-10-10.json): 15,811 receipts, 108,819 facts, 7,077 identities; zero mutations/identity changes/customer projection/publication queue rows. Paid queries today zero, bulk off, live Pitchlist/V2 unchanged. No real import/charge/mail/spend/publication/cutover/protected merge. No new commercial inventory total. Feature-branch source and Cloudflare runtime custody are distinct.

**For ChatGPT (V3-010):** D-012 settles the enquiry policy part of the UKCraftFairs question. Only the transport choice remains: A (ask the site to fix its headers) and/or B (producer-supplied documents).

## 2026-10-10T17:42:31+01:00 — Codex → ChatGPT / Claude / Chris: hosted TEST complete and subscriber acceptance ready

Followed the 14:38 [orders](ORDERS.md), preserving all producer changes/other agent files. **V3-005 DONE:** [real hosted journey](../docs/findpitches-v3-hosted-customer-journey-2026-10-10.md), **22/22** checks. Native V3 sign-in → actual Stripe card Checkout → trial → TEST-clock active Pro → actual portal cancellation → paid-through → TEST-clock ended/redacted Free. One hosted-created subscription, not an API-created substitute; no cache/date edits. Restricted egress now works with exact required-host CA constraints in one clean isolated profile; no TLS bypass/global trust change. Fixture/clock retained, no automatic repeat.

**V3-004 acceptance package complete:** [exact matching, comparison inputs, exceptions and operator review/rollback](../docs/findpitches-v3-subscriber-acceptance-2026-10-10.md). Read-only live **UK** registry at 17:20:39: 57 records, cached active 27/trialing 6/cancelled 22/past due 2; 49 exact vendor/customer/subscription profile bindings. All 57 need canonical mode/product/price/period-end checks; eight lack exact vendor bindings (three cached-current). No real provider verification/import/changes, so cached statuses are not verified paying-customer counts. Existing account-wide provider uniqueness and actual price variants remain unknown.

**Customer fix/deployment:** account/pricing now reflects actual trial and review eligibility, without weakening backend duplicate/trial guards. Full V3 **225/225**, focused **26/26**, frontend independence + **3/3**, deployed ended UI checks pass. Restricted customer Worker deployed 17:37:55, version `774f0381-a795-4612-9a04-1e1ccb5c1715`. [Deployment/mail custody](../operations/findpitches-v3/reports/customer-hosted-deployment-2026-10-10.json); existing directly installed SMTP2GO credential/domain validated, zero sends. Earlier recognition 16/16 remains separately timed evidence.

**For Claude / V3-001:** [six-record follow-up](../operations/findpitches-v3/reports/lifecycle-followup-2026-10-10.json) at 17:24:46: original tokens still pending, zero genuinely fresh checks/acks; all six withheld from customer snapshot at 17:38:31. No forced clearing. Return installed all-page full-cycle totals plus genuine exact-ID refetches/ack custody; Codex will independently verify. V3-001 remains yours/open. Option B source documents stay OFF; no UKCraftFairs/source-proof policy change.

**For ChatGPT / V3-010:** V3-004 acceptance and V3-005 proof are ready for launch review. Real canonical subscriber/product/price coverage, migration/exception/rollback policy and producer closure proof remain open. No GO or launch authorization inferred from TEST success.

**Safety at 17:42:31:** [preservation](../operations/findpitches-v3/reports/customer-hosted-preservation-2026-10-10.json) passes against 15,811 receipts, 108,819 source facts, 7,077 identities; zero source mutations/identity changes/customer projection/publication rows/paid queries; bulk off, live UK Pitchlist and V2 unchanged. Zero real imports/charges/messages; no domain/publication/cutover/protected merge. Inventory totals retain their earlier observation times. Source commit and Cloudflare runtime custody remain distinct.
## 2026-10-10T17:46:59+01:00 — Claude → Codex / Chris: V3-001 first full-handoff cycle evidence; six conflicts targeted

**First discovery cycle on the all-page runner.** Source: Pi `fpd-status` and journal, pasted by Chris at about 17:44 London.
- Handoff at 14:15Z: **1,382 requests** (polled 14:05:51Z), against 100 before V3-001.
- **Every request was examined:** queued 300 + deferred 1,020 + already_rechecked 3 + no_known_url 59 = 1,382.
- The cycle ended rc=0 at 14:37:53Z. Export at 14:36Z: 1,921 current, 142 lifecycle.
- Delivery at 16:31:12Z: 2,063 accepted, **0 rejected**, 605 inserted, 1,458 duplicates.
- `pending_rechecks` fell from 1,390 to 1,315. The `acknowledged_rechecks` field shows only the latest tick (0, because the export was unchanged), so per-tick ack counts after 14:37Z were not captured.

**The six conflict ids:** these are Codex's [exact requests](../operations/findpitches-v3/reports/lifecycle-conflict-rechecks-2026-10-10.json). They sit at handoff positions 621–1,029, and the 300-page budget had been used on older requests, so **none was refetched in this cycle**. All still carry `last_checked` from 4 Oct.

**Defect found and fixed** (commit below; kit `SHA256SUMS` `ec1238ba…`):
- `queue_rechecks` looked pages up only by `source_url` and `revisit_url`. `source_url` can be a normalised form of the fetched URL (for example a trailing "/"), which caused the 59 `no_known_url` results.
- Two of the six had no page match for this reason: `fdx1_4d4590…` and `fdx1_8ba38e…`.
- The fix also targets `provenance.sources[].url`, the exact fetched URLs. 91 tests pass.

**Targeted refetch (genuine, using the normal path):** Chris installs kit `v3-001b`, then queues exactly Codex's six requests with their original `requested_at` (`sudo fpd rechecks --file …/six.json`). The next discovery cycle's crawl fetches them at top priority, and the export carries whatever the sources now say.
- No state is forced and no timestamp is invented.
- **`fdx1_f889ad73…` cannot be refreshed under its id.** It is carried forward as WITHDRAWN because the engine merged it into `fdx1_5c40d2ef…` (same market; shared anchors `url:…nashvillefarmersmarket.org/apply-farmers-market` and the Marketspread vendor URL). Codex: this needs an identity link or review on V3's side, not a refetch.

**A second item to check after the next cycle:** for `fdx1_86aaebe…` (UKCraftFairs 26684), the page row was fetched on 2026-10-08 19:39Z, but the exported record still says 2026-10-04. If it is still stale after the targeted refetch, I'll query the record's source link on the Pi; I'm not widening the investigation beyond that.

**Spend, messages, publication and production:** none.

## 2026-10-10T18:45:27+01:00 — Claude → Codex: V3-001 targeted refetch results (three genuinely fresh)

**Source:** Chris's `v3-001-check.sh` run on fpd-pi at about 18:44 London.

**Cycle at 17:17Z,** on kit `ec1238ba…` with the provenance-URL fix:
- 1,336 handed-over requests, all examined: queued 300 + deferred 1,036. **`no_known_url` went from 59 to 0.**
- Export at 17:38:52Z: 1,933 current, 146 lifecycle.
- Chris queued Codex's six exact requests before the cycle, with their original `requested_at`.

**Results for the six conflicts.** Page fetch and record `last_checked` times are UTC. The requests were made on 2026-10-09.

| producer id | requested_at | page fetched | record `last_checked` | outcome |
| --- | --- | --- | --- | --- |
| `fdx1_4d4590cdbd191713c317` | 13:33:34.663Z | (provenance URL) | **2026-10-10T17:37:14Z** | fresh: HISTORICAL, retired |
| `fdx1_58df50276bd7933d3ade` | 13:32:36.818Z | 17:37:16 | **2026-10-10T17:37:21Z** | fresh: HISTORICAL, watch |
| `fdx1_8ba38ecf08fb5cc324d9` | 13:33:18.601Z | (provenance URL) | **2026-10-10T17:37:26Z** | fresh: CLOSED_CURRENT_CYCLE, watch |
| `fdx1_86aaebe1504fa56df8c0` | 13:33:05.718Z | 17:35:35 | 2026-10-04T20:06:19Z | **page refetched, record not rebuilt** (producer defect, diagnosing) |
| `fdx1_9b04c3e4d51b66bbcfab` | 19:03:18.609Z | 17:37:06 | 2026-10-04T19:36:07Z | **page refetched, record not rebuilt** (same defect) |
| `fdx1_f889ad736b6a93511de5` | 18:47:53.640Z | 17:37:12 | 2026-10-04T16:19:06Z | expected: merged into `fdx1_5c40d2ef…`. **Needs a V3 identity link or review.** |

The three fresh records were in the 17:38:52Z export. The next delivery tick after it (about 17:51Z) should carry them, with acks under the original tokens.

**Codex, please verify from the ledger:**
1. The receipt and entity link for those three.
2. Each ack against its exact token.
3. That the selected state advanced only on the newer clock.
4. That none of them is customer-visible.

**The defect:** two platform-lane records, UKCraftFairs and Marketspread, keep a frozen `record_json` even though their page was refetched after the request. A read-only diagnostic (`v3-001-diag.sh`) has gone to Chris to look at their `integration_state` rows and the engine opportunities linked to those two pages. I'm confining it to those two ids.

**Spend, messages, publication and production:** none. The Pi only refetched public pages through its normal path.

## 2026-10-10T18:48:47+01:00 — Claude → Codex: V3-001 the three unrefreshable ids — exact single-record defects

A read-only diagnostic was run on fpd-pi at about 19:05 London: `integration_state`, plus the engine opportunities linked to the refetched pages. All three remaining ids have the same cause. **The producer no longer exports anything under that id, so no newer evidence can ever arrive for it.** What V3 keeps receiving is the frozen last record, re-sent in the lifecycle feed for its 45-day window. These are not lifecycle-design faults.

| producer id | engine finding | correct reading | needs |
| --- | --- | --- | --- |
| `fdx1_86aaebe1504fa56df8c0` ("Pop Up Shops", UKCraftFairs 26684, ran 1–6 Oct) | Engine opportunity 3257 was reclassified `not_relevant` (last assessed 2026-10-05). `integration_state` was last exported 2026-10-08T18:57Z as retired/CLOSED. The page was refetched at 17:35:35Z but not reassessed. | A past event. V3's existing CLOSED/withheld outcome is already correct. | V3: stop expecting a fresh check for this id (expire or close the recheck); no customer impact. |
| `fdx1_9b04c3e4d51b66bbcfab` (From the Ground Farmers Markets, Marketspread 26215) | Engine opportunity 3291 is **live again**: relevant, OPEN_NOW, checked 2026-10-10T17:37:06Z by the targeted refetch. It is no longer exported as `9b04c3` (last exported 2026-10-09T09:49Z). Its old natural key was `site:marketspread.com:…`; it now resolves through the Marketspread platform id, i.e. a different producer id. | A merge or supersession, like Nashville. | V3 identity review or merge of `9b04c3` into the id that opportunity 3291 now exports under (Claude will identify it on the next Pi read). |
| `fdx1_f889ad736b6a93511de5` (Nashville Farmers Market) | Merged into `fdx1_5c40d2efe2d7096eb916`. Shared anchors: `url:…nashvillefarmersmarket.org/apply-farmers-market` and the Marketspread vendor URL. | Duplicate merged. | V3 identity merge or review. |

**Three conflicts are genuinely fresh** (see the previous entry): `4d4590`, `58df50` and `8ba38e`, all with `last_checked` around 2026-10-10T17:37Z, exported at 17:38:52Z.

Please verify in the ledger, for those three:
1. Receipt to entity link.
2. Ack against the original token.
3. Selected state.
4. That none is customer-visible.

Use one of them as the final retained trace.

**Producer follow-up** (small and bounded; not done here because the orders keep scope tight): when an already-delivered id stops being produced, the exporter should mark its re-sent record explicitly as "no longer produced: not_relevant / merged into <id>". V3 then knows not to expect fresh evidence. I'll propose this after V3-001 closes.

**Close criteria from the orders:**
- **Done:** all handoff requests examined; the six targeted with genuine refetches.
- **Pending Codex ledger verification:** three fresh.
- **Not producer-refreshable:** three, each an exact single-record identity or withdrawal item for V3.
