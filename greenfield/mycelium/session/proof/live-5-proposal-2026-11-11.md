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

- **Prompt:** unchanged, plus "This is a short session: aim to finish within about three minutes, so the final shared tests can run before the hard limit. Once the shared tests pass on the latest integration and you have reviewed it, finish your turn." The instruction is **advisory, not a completion guarantee**.
- **Test time:** `testMs` is **30 s per phase** (was 60 s), so a final two-phase test takes at most 60 s. Observed phases in runs 3 and 4 took under 1 s. A finish at about 3 minutes leaves about 2 minutes for the final tests and wrap-up inside 300 s.
- **Unchanged:** fixture, fixed oracle, the billing guard (`myc-run`), the Codex named-permission boundary, the watchdog, the sandbox, and "no web, Neon, Pi, production or credentials".

## Exposure (configured worst case, not a forecast; revised after Codex review e1de86d)

**No expected saving is claimed.** The earlier "roughly half or less" was unsupported and is withdrawn.

| | Live-4 actual | Live-5 configured ceiling |
|---|---|---|
| Wall time | 438 s | **305 s** hard (PID1); broker 335 s |
| Model-authorising inputs | 12 | **8** |
| Observed **total** tokens incl. cached | 877,991 | stop at **1,000,000** combined. This is *higher* than live-4's actual total, and it can overshoot between reports. |
| **Fresh** tokens | 108,300 | stop at **100,000 per agent (200,000 combined)**. This is *higher* than live-4's actual fresh, and it can overshoot. |

- In practice the 305 s wall time is the binding limit. Token use depends on how hard the agents work in that time, which can't be predicted.
- Claude's in-turn usage is a lower bound until its turn result.
- How the subscriptions weight cached against fresh tokens is unknown.
- Money is £0 incremental through the existing subscription logins; plan allowance is still consumed.
- The delta-read replay measured serialised read bytes, not provider or subscription tokens.
- A wall-clock stop at 300 s counts as `noStop: false`.

## Pins (revised)

- **Runtime:** `31d043fc725c72f14781252fc59de48a57103eb1`.
- Pin file sha256 `c9ddc096518d8a79e403bebb90168d75dedf9fd4f5e28866b207af0802fe24ab`.
- Candidate sha256 `5ef3939df58d955565830b7e346d2bb943f6f40e690b1cff7243ba5daaa0c7ed`.
- **Command:** `proof/live-5-command.sh`, sha256 `22c74b4c4b5734d6ef0dea43d1956374864e81ad1a4ec6a1be1a65e27e0ec5eb`. It is the same fail-fast form, with output `/var/tmp/myc-p0-live5-a`.
- **Checks at 31d043fc:**
  - full suite 139/139;
  - recovery-runtime 1/1;
  - r1-r2 6/6, terminal-error 1/1, claude-read-budget 1/1, claude-budget-recovery 6/6, claude-inbox-envelope 1/1, fresh-runtime 2/2, lowerbound-coverage 1/1.

**One attempt. No retry or restart after a failure or an unknown result.**
