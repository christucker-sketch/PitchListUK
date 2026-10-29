# Stage One scope 1 receipt: install and setup on fpd-prod (29 Oct 2026)

Chris approved scope 1 twice:
- at `d2d28c06`, after Codex's sign-off;
- at `13503084` (revision 2b), as owner. **Codex has not yet reviewed 2b**; it is asked to review it now, together with these receipts.

These are sanitised excerpts of the terminal output Chris pasted. No password, connection string or token appears in any output. Zero model calls.

## Timeline (UTC)

| Time | Where | Step | Result |
|---|---|---|---|
| 16:30:57 | fpd-prod | file hashes `sha256sum -c` (myc-gate, upgrade-gate.sh, mycelium-bridge.sh at `d2d28c06`) | all OK |
| 16:30:57 | fpd-prod | `upgrade-gate.sh check`, then `install` | **myc-gate v3 installed** (`bca72724623b`). Backup at `/var/lib/myc-stageb/upgrade-gate/prev-20261029T163100Z`. Post-checks: bad command rejected; `MYC-20261025-003 completed` read from history; myc-agent, myc-stageb, myc-decide, mycnotify and hubsync unchanged |
| 16:31:02 | fpd-prod | `precheck`, `setup d2d28c06` | PRECHECK OK. Node v22.23.4; Neon reachable (HTTPS 400 = TLS endpoint answering). User/group `mycmem`; package at `/opt` (root-owned, read-only); store; credential (root:mycmem 0640); one PC copy |
| 16:31:57 | PC | owner `create` at `d2d28c06` | Login **`mycelium_bridge_fpd`** created (limit 20, valid until 2026-12-31T23:59:59Z, runtime only), then **refused by its own verification**. The cause was Neon's automatic creator grant (`neondb_owner`, ADMIN only, INHERIT/SET false). **Fail-closed:** `disable-login`, then `verify-closed` VERIFIED (NOLOGIN, VALID UNTIL 1970, no membership). Password copy absent: True. Grant `d246ad79-952e-4faf-a90a-2f4da29b5aef` retired |
| — | hub | revision 2b, `13503084` | Accept exactly the creator ADMIN-only grant; new login name `mycelium_bridge_fpd_r2`; teardown removes an empty store |
| ~16:45 | fpd-prod | new script hash-checked; `close`, `teardown`, `precheck`, `setup 13503084` | Chris: "all good" (excerpt not pasted). Old credential shredded; old install removed; fresh install at `13503084` |
| ~16:46 | PC | owner `before`, `scp`, `create` at `13503084` | Chris: "all good". Login **`mycelium_bridge_fpd_r2`** created and verified; copy removed |
| 16:48:12 | fpd-prod | `whoami` | Host PC copy shredded. **Boundary OK**: myc and hubsync cannot read the credential; mycmem cannot read the deploy key or CLI sign-ins; no extra groups, sudo or ACLs. **WHOAMI OK** `{"principal":"mycelium_bridge_fpd_r2","other_schema_usage":["public"],"valid_until":"2026-12-31T23:59:59.000Z","connlimit":20}`. No reach into `neon_auth` |
| 16:48:13 | fpd-prod | `prepare stage-one-proof-1 13503084` | Boundary OK. **SEED OK** `b2339ae1-288b-8fa4-bd83-9bac741808fd`, equal to the offline-derived `seedId('stage-one-proof-1')`. **SNAPSHOT OK**: 1 node, 842 bytes, sha256 **`b9f19aa53bb3919ffc0c0882c57fc47dd51b1e54523305e78e4ce792969e028f`**. Batch **PREPARED** |

## State now

**Neon:**
- `mycelium_bridge_fpd_r2` is open: runtime only, limit 20, expires 2026-12-31.
- `mycelium_bridge_fpd` is closed.
- One seed question node was written. Nothing else changed.

**fpd-prod:**
- myc-gate is v3.
- The bridge is installed at `13503084`.
- Snapshot `b9f19aa5…` is sealed, root:hubsync 0440.
- Batch `stage-one-proof-1` is PREPARED.
- No allowlist exists, so no claim is possible.

**PC:** no password copy; grant receipt for r2 present.

**Model calls:** none.

Not pasted, so asserted only by Chris's "all good":
- the 1b close and teardown lines;
- the r2 `CREATE OK` line.

Chris can paste them for the record.

## Next (scope 2: needs Codex review of the descriptors and Chris's separate approval)

The two task descriptors are committed with this receipt:
- `MYC-20261029-001` (claude): memref only;
- `MYC-20261029-002` (codex): memref plus `ref:` to 001's result.

Each carries exactly `memref: sha256:b9f19aa53bb3919ffc0c0882c57fc47dd51b1e54523305e78e4ce792969e028f`. The commit that adds them is **Y**.

The proof is one command on fpd-prod:
```
sudo MYC_BILLING_CONFIRMED=yes bash /opt/mycelium-memory/stage-one/mycelium-bridge.sh run stage-one-proof-1 Y
```

Its limits:
- 2 calls, 30 minutes, no retry;
- ingest at most 2 contributions;
- verification in a fresh process;
- one database-only `ingest` recovery only if needed.
