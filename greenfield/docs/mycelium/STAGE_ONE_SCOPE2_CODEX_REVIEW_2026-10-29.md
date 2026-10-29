# Codex: scope1 receipt / revision2b / scope2 review — 29 October2026

**PASS: revision2b source and the scope2 descriptors are suitable for the bounded proof. Scope1 accepted on the recorded evidence; scope2 execution awaits Chris's separate approval.**

Reviewed installed-source commit `13503084e4bf87ec823fa243862aef627444fd8d`, [setup receipt](STAGE_ONE_SETUP_RECEIPT_2026-10-29.md), and task/manifest commit **`53f529feb48e1912fd3d9f091500d2b81fd031a5`** (Y).

## Setup and creator-grant correction

The receipt reports the initial login creation stopped safely: verification refused the automatic creator membership, then the login was closed, password copy removed and grant receipt retired. The correction accepts zero or one grant **of the bridge login to neondb_owner**, ADMIN=true, INHERIT=false, SET=false. This is the direction of owner administration, not a grant of owner privileges to the bridge. Any foreign member or INHERIT/SET capability remains refused. The bridge still inherits only the runtime template, with no ADMIN/SET. New name: `mycelium_bridge_fpd_r2`; the old login remains disabled.

The earlier offline fixture created the role as superuser and missed this PostgreSQL behaviour; that was a review/test gap. Updated tests create it as CREATEROLE neondb_owner and reproduce the automatic ADMIN-only row.

**Independent checks at revision2b: StageOne10/10 PASS; host rehearsal44/44 PASS.** Drift tests cover foreign grants and altered creator INHERIT/SET. Empty-store teardown/reinstall is exercised. No need to replay unchanged successful runner/gate proofs or reinstall anything.

The recorded live output establishes gatev3, boundary/WHOAMI pass for r2, finite expiry2026-12-31/limit20, seed and PREPARED snapshot. Some r2 close/reinstall/CREATE output was not pasted; the receipt correctly labels those steps as Chris's “all good” report. Codex has not directly inspected fpd-prod/Neon or independently reproduced Windows tests. Chris's separate approval of2b is recorded by Claude in the hub; this review does not invent an approval in this chat.

## Snapshot and descriptors checked

Independently reconstructed the reviewed manifest's seed and snapshot **offline**, yielding exactly:
- seed `b2339ae1-288b-8fa4-bd83-9bac741808fd`;
- **842 bytes**, one question node;
- SHA256 `b9f19aa53bb3919ffc0c0882c57fc47dd51b1e54523305e78e4ce792969e028f`.

This corroborates the sanitized receipt without accessing credentials or exporting live memory.

At commitY:
- `MYC-20261029-001` assigned Claude; one memref.
- `MYC-20261029-002` assigned Codex; the same memref plus 001's result reference, within the two-ref bound.
- Each has only its creation event0001, pending. No claim/result is present at this commit.
- Instructions ask for a testable FindPitches verification method, explicit failure modes, no invented organisers/dates/fees, and one validated contribution each. Codex must respond substantively to Claude and link `@MYC-20261029-001`.
- This is a memory/collaboration proof over a seed question, **not real opportunity discovery or evidence of an autonomous exploration engine**.

## Exact next decision

**Next Chris:** approve/decline scope2 at **`53f529feb48e1912fd3d9f091500d2b81fd031a5`**.

Suggested concise approval:
`approved: Stage One proof run at 53f529feb48e1912fd3d9f091500d2b81fd031a5`

This permits:
- exactly two native CLI/model invocations at most: Claude001 then Codex002;
- existing subscription/billing confirmation and runner allowlist; 30minute window, no automatic retry;
- at most two validated linked contributions, append-only, then field-exact verification in a fresh process;
- mandatory allowance archival on success/STOP; retain receipts/usage;
- one database-only exact-batch recovery if interrupted at CALLS_STARTED or stopped at INGEST_PENDING, with no model call; incomplete turns remain HELD.

The reviewed host command, **only after that approval**, is:

```bash
sudo MYC_BILLING_CONFIRMED=yes bash /opt/mycelium-memory/stage-one/mycelium-bridge.sh run stage-one-proof-1 53f529feb48e1912fd3d9f091500d2b81fd031a5
```

No new preparation/seed, credentials, login rotation, install or configuration change is needed. Existing scope1 combined-identity/BRIX-only recovery limits remain. Do not alter services, timers, production/FindPitches data, Neon Auth or paid resources. StageTwo requires its own allowance.

After approval, Claude coordinates the existing Chris-command/sanitized-log route; Codex reviews actual two-call, ingestion, fresh-verification and allowance-closure receipts. Current state: **setup complete / proof not run**. This engineering review is not the owner call grant.
