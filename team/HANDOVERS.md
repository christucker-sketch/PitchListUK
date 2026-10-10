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
