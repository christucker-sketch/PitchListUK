# Stage One proof receipt: BRIX-native shared memory works (29 Oct 2026)

**RUN OK.** The run was approved as scope 2 at `53f529fe`, and was run on fpd-prod only, with no Windows step during the run. Claude Code and Codex read one sealed memory snapshot through the existing runner; their validated contributions were appended to Neon and verified field-exactly in a fresh process. Every bound was met.

These are sanitised excerpts of the output Chris pasted. No secret appears in them.

## Turns (from the gate's GitHub events)

| Turn | Run id | Claim commit | Completion commit | Result sha256 (gate) | Time | Usage |
|---|---|---|---|---|---|---|
| `MYC-20261029-001` Claude (claude-sonnet-5-5, CLI 2.1.308) | `MYC-20261029-001-r1793293084-f6af0122` | `4a1b6b80` | `0e650023` | `d5cadd814631452ff97cabb1ea0c400bf647aba1e547d879742b2edd0f23afe6` | 15 s | 1,353 output tokens; API-equivalent $0.027, not billed |
| `MYC-20261029-002` Codex (codex-cli 0.164.0) | `MYC-20261029-002-r1793293126-303e5035` | `13567abf` | `8a727078` | `c436f1c823f64be3610e8244ce5c88525a06ce6a74c80de625df9e5073ce67ee` | 26 s | 16,493 input (12,288 cached), 548 output |

**Grant:**
- **2 claims of 2**, both admitted under the deadline 17:27:34Z.
- No retry. Sign-in pre-flights made no model call.
- The result bytes on GitHub re-hash to exactly the gate's pinned sha256 values.

## Memory

All writes are append-only. They carry the tag `bridge: stage-one-proof-1` and the binding attributes (batch, snapshot sha256, result sha256 and blob, hub commit).

**`ff353d5b-efbe-89d3-aa8d-1dff9896e5c1`** (claude-cli, `verification-protocol`):
- Treats a pitch as three claims: **exists**, **open now** and **actionable**.
- Each claim needs a dated primary or independent source; aggregators are leads only.
- States explicit failure modes.
- `answers →` seed `b2339ae1…`; 1 stance.

**`411eb722-518a-81d3-a06a-50c8b2e61e67`** (codex-cli, `verification-refinement`):
- Challenges Claude's thresholds. Prior-edition coverage proves history only; a live form proves accessibility only; timestamps can be faked; replies can come from an impersonator.
- Proposes a **claim-to-evidence ledger with bounded, trader-specific verdicts**. Claims are recorded as supported, contradicted or unknown, and four states are kept apart: applications accepted, capacity confirmed, waiting list only and pitch awarded.
- `refines evidential thresholds →` **Claude's contribution**; `answers with auditable verdicts →` seed; stance *supports* Claude, weight 0.8.

**Verification:** `VERIFY OK: 2 node(s), 3 link(s), 2 stance(s); all 7 rows identical to the pinned payload`, from a fresh process.

## Batch receipt (fpd-prod, `/var/lib/mycelium-memory/batches/stage-one-proof-1/receipt`)

```
PREPARED → CALLS_STARTED (turns=2, window=1800s, commit=53f529fe) → CALLS_DONE → INGEST_PENDING (batch cf8c5b67…, commit 8a727078) → INGESTED → VERIFIED
```

The allowlist was **closed and archived** before ingestion. No recovery step was needed.

## Success criteria (owner directive / proposal §5)

| Criterion | Met |
|---|---|
| On fpd-prod only, no Windows step in the run | ✔ |
| Least-privilege principal | ✔ `mycelium_bridge_fpd_r2`; boundary and capability checks on every operation |
| The models saw exactly the approved memory | ✔ snapshot sha256 `b9f19aa5…` pinned in both descriptors and verified at claim and admit |
| Claude, then Codex, with Codex responding to Claude | ✔ Codex challenges and refines; linked `refines →` Claude's node |
| Both contributions appended and linked to memory and to each other | ✔ |
| A fresh process retrieves them exactly | ✔ 7/7 rows |
| Re-ingest is a no-op | ✔ covered offline; live `ingest` re-verifies only |
| Usage receipts; allowance archived; no owner credential on the host | ✔ |

## State and limits

- **Login:** `mycelium_bridge_fpd_r2` stays open until Chris's `close`; new password logins stop at 2026-12-31 at the latest. It authorises nothing on its own: any further run needs a new manifest, new descriptors and Chris's approval.
- **Accepted limits:** combined identity; snapshot bytes and receipts on fpd-prod only.
- **What this is:** a proof of memory and collaboration over a seed question. It is not live opportunity discovery.
- **Stage Two:** not started; it needs its own allowance.
