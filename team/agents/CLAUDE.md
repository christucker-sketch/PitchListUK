# Claude status

Author: Claude (Cowork session with Chris; replaces the placeholder Codex created)
Updated: 2026-10-10T12:37:13+01:00
State: WORKING
Branch: findpitches-v3/greenfield
Task IDs and published claims: V3-001, V3-002 (CLAIMED); V3-003 DONE (see [TASKS.md](../TASKS.md)).
Files/components owned: the independent producer (`fp-discovery-lab` engine plus the `deploy/pi` host kit) on `fpd-pi`; the `findpitches-v3-web` Build 4 package as handed over (Codex owns it in V3 from now on); `team/agents/CLAUDE.md`.

## Access, stated plainly

- I have **no direct shell on the Pi**. Every host measurement below comes from commands Chris ran (`sudo fpd-status`, installs) and pasted back. Host changes reach the Pi as a kit that Chris installs.
- The producer source (engine plus Pi kit) is now in this repo at [`producer/`](../../producer/README.md) (V3-003, approved by Chris as D-011). Its hashes match the copy the Pi kit was built from.
- I have no Cloudflare, D1, Stripe or Serper access, and I have not used any.

## Completed

- Producer delivery moved from the PC to the Pi (`fpd-v3-delivery`, every 15 min). The ingest-only token is readable only by the `fpdv3` user. The PC host is retired.
- **Lifecycle feed built and installed, switched OFF:** `/srv/fpd/export/v3/feed.jsonl`. It holds current records plus watch/held/retired records for ids that left current within 45 days, in the same v1 schema. The switch is `sudo fpd-v3-feed enable|disable|status`. Codex confirmed the three cloud semantics in [the 9 Oct confirmation](../../docs/findpitches-v3-producer-feed-confirmation-2026-10-09.md), so only Chris's host command remains.
- **Audit corrections installed on the Pi on 10 Oct:**
  - platform names removed from the organiser field;
  - AUTHORITY_ONLY names held (event-like names exempt);
  - ROLLING records past their deadline or season end become CLOSED_CURRENT_CYCLE;
  - the EntryThingy lane suspended;
  - Marketspread cancelled dates ignored;
  - Eventeny non-trading forms rejected.

  Tests passed: 87 plus 1 skipped on the Pi, and 88 in my workspace.
- Host tooling added:
  - `fpd-evidence` (a read-only evidence pack that aborts if the token appears);
  - `fpd-offsite-setup` and `fpd-offsite-backup` (rclone, kept 14 days, with `RESTORE.txt`). These are installed but no-ops until a remote is configured.
- Handed Codex the standalone Build 4 frontend package (`findpitches-v3-web`) plus handoff docs 00–08. Codex now serves it as the customer preview.

## Current work

- **V3-001 (installed, finishing):** the paging kit was installed about 12:26 London.
  - First delivery: `pending_rechecks` 1,390 (all pages), 2,044 accepted / 0 rejected, 16 acks.
  - Codex's cloud check of the first feed: 119/119 EXACT_MATCH, 113 advanced, 0 customer-visible, 6 equal-clock conflicts held. See the [lifecycle checkpoint](../../docs/findpitches-v3-lifecycle-cloud-checkpoint-2026-10-10.md).
  - Left to do: record the first discovery cycle on the new handoff; get fresh refetches for the 6 conflicts (needs V3 recheck requests for those entities).
- **V3-002 (evidence published, decision pending):** see the [UKCraftFairs access note](../../docs/findpitches-v3-ukcraftfairs-access-2026-10-10.md).
  - The 520 comes from malformed IIS headers.
  - 159 enquiry-only records with retained HTML and hashes.
  - Options: A, ask UKCF to fix the headers; B, producer-supplied documents verified by V3. Plus V3's enquiry-only policy. Waiting on Chris's decision.
- Acknowledged: Codex owns V3-004 and V3-005 (V3-005 blocked on browser trust); ChatGPT owns V3-010.

## Evidence and commits

- Producer source custody: `producer/fp-discovery-lab/` with `producer/SOURCE_SHA256SUMS` (81 files) and a [custody README](../../producer/README.md).
- Handoff docs 00–08 were supplied to Codex outside GitHub (handover ZIP). Cloud side of the feed: [Codex feed confirmation](../../docs/findpitches-v3-producer-feed-confirmation-2026-10-09.md).

**Deployment version and environment:** the producer runs on the Pi only (`fpd-pi`, systemd). The audit-fix kit was installed on 10 Oct. **Nothing was deployed to Cloudflare by me.**

## Checks performed

- Unit and integration suite (88 in my workspace; 87 plus 1 skipped on the Pi).
- Read-only `fpd-status` output supplied by Chris.

**Not performed:** I have not seen the post-install rebuild results, and I have not run a planned reboot test.

## Metrics: Pi `fpd-status`, about 2026-10-10T10:24+01:00, run by Chris

| Item | Value |
| --- | --- |
| Current records | 1,925 |
| Watch records | 1,871 |
| Last delivery | 1,925 accepted, 0 rejected |
| Recheck handling (last cycle) | 63 already fresh, 35 queued, 2 with no known URL |
| Feed lifecycle records | 119 (built, **not delivered** while the feed is off) |
| Power | `throttled=0x50005` (live under-voltage). Chris is replacing the PSU. |
| Off-site backup | Not configured |

**Correction:** my earlier "337 rechecks acknowledged in 20 h" came from the Pi's own delivery log, not V3's ledger. Codex's ledger figures supersede it. Don't add the two together.

## Blockers and dependencies

- Feed enable needs Chris to run `sudo fpd-v3-feed enable` on the Pi.
- UKCF access policy: V3 needs to decide whether to accept Pi-retained evidence or find another legitimate route.
- PSU replacement.
- Off-site backup remote (S1).

**Next action and owner:** Claude does the recheck-runner cursor upgrade (V3-001) and the UKCF evidence sample (V3-002). Chris enables the feed.

**Approval required:** none outstanding for my tasks (D-011 granted the source commit). No publication, cutover or billing gate has been reached.

**Paid queries, messages, publication or production changes made:** none. No Serper calls, no emails, no Stripe or Cloudflare changes, and V2 untouched.

**Source mutations, identity changes or leakage:** none by me. The token is not in any file, log or update I produced.
