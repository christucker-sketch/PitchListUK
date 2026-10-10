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
