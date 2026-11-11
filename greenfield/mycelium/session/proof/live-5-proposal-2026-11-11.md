# MYC-P0 live-5: short bounded verification. Proposal for joint review and Chris's grant

11 Nov 2026, Claude. Prepared at Chris's direction ("yep lets do it … so you can actually build the thing I am designing this to build") and following Codex's 384770f requirements. **Not authorised yet**: it needs Codex's review, then Chris's explicit one-attempt grant and pre-run billing check.

## What it must answer (native behaviour no offline test can show)

1. Do both real agents finish **on their own**, without a crash or forced stop? That's `noStop` and `noWorkerFailure`, which failed in runs 1–4 only on harness defects that are now fixed.
2. Does Codex use `myc_inbox` after its steering intake pauses, and does Claude recover from budget refusals, withheld events and stale bases (re-read, delta, resubmit)?
3. Are the newest integration's two test phases tested and passing in-session, with contributions from both agents?

## Bounds (candidate `myc-p0-live-5`)

| | live-4 | **live-5** |
|---|---|---|
| Wall time / PID1 | 600 s / 605 + 635 s | **300 s / 305 + 335 s** |
| Authorising inputs | 6 per agent (12) | **4 per agent (8)** |
| Peer deliveries per agent | 5 | **3** (the inbox tool covers the rest) |
| Fresh-token stop | 300,000 per agent | **100,000 per agent** |
| Observed **total** stop (incl. cached re-reads) | none | **1,000,000 combined** |
| Context per agent | 24 KB | 24 KB (unchanged) |

- **Prompt:** unchanged, plus "This is a short session: aim to finish within about four minutes. Once the shared tests pass on the latest integration and you have reviewed it, finish your turn."
- **Unchanged:** fixture, fixed oracle, two-phase tests (60 s per phase), the billing guard (`myc-run`), the Codex named-permission boundary, the watchdog, the sandbox, and "no web, Neon, Pi, production or credentials".
- Live-4 for comparison: 433 s, about 878k total and about 108k fresh combined. Live-5 should cost roughly half or less.
- **Limits stated plainly:**
  - Token stops are observational and can overshoot between reports.
  - Claude's in-turn usage is a lower bound until its turn result.
  - How the subscriptions weight cached tokens is unknown.
  - A wall-clock stop at 300 s counts as `noStop: false`. Finishing in time is part of the test.

## Pins

- **Runtime:** `232e22dd220d3fd1fede28f556a9044ff72d4a20` (Codex's 384770f plus the candidate change only).
- Pin file sha256 `5fe63f3c989d9c36648150f98c2534e333fa6cb310b104672ef9b02124133e0a`.
- Candidate sha256 `c2f47d5b42e50e91c610b0cf8ce2f6dfd67ade9c1ea369c8e5ec5ce470caa076`.
- **Command:** `proof/live-5-command.sh`, sha256 `96599ca9e965562518f32e203df49ad7cf0a1dfc4ef61391b479f64555ea6b06`. It is the same fail-fast form as live-4, with only C, the two digests and the new output path `/var/tmp/myc-p0-live5-a` changed.
- **Checks at 232e22dd:**
  - full suite 139/139 (proof-package and watchdog tests updated to the new limits and id);
  - recovery-runtime 1/1;
  - r1-r2 6/6, terminal-error 1/1, claude-read-budget 1/1, claude-budget-recovery 6/6, claude-inbox-envelope 1/1, fresh-runtime 2/2, lowerbound-coverage 1/1.

**One attempt. No retry or restart after a failure or an unknown result.**
