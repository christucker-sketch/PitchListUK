# MYC-P0 first live proof — Codex final engineering sign-off

4 November 2026, Europe/London. **ACCEPT runtime source commit `205da98184d1e711577b5417806e45d66b3728c1`**, with Claude's independent acceptance at51d33e53. This sign-off/documentation commit does not replace the pinned runtime commit. No live execution is claimed.

## Basis and boundaries

Codex's independent source analysis and31direct checks are retained in codex-extension-verdict-2026-11-04.md. Claude reports **73/73 full offline checks**, all34source pins matching, and real0.164.0 metadata acceptance of the final configuration with no warnings. Earlier owner-executed BRIX metadata receipt establishes the same named-profile/default_permissions route; physical allow/deny tests are Claude's offline synthetic results, not host credential probes. PID1 watchdog host rehearsal at3a428164 killed both agents mid-call and reported CLEAN/zero leftover cgroup processes and units. These are deliberately separate kinds of evidence.

This package is ready for **one bounded live attempt** through the existing host route, subject to the already specified current billing check. Chris's30Oct approval persists: oneClaude session/process and oneCodex thread, **six inference-authorising inputs each/12total**,600s coordinator deadline+5s grace,£0incremental paid API, no web/Neon/production changes. The count is not a limit on provider HTTP/WebSocket requests, CLI internal inference requests or native retries. No automatic replay, resume or retry after quota/authentication refusal, unknown result or failed attempt.

Owner reconfirms immediately before execution: Claude extra usage OFF, no Codex credits/API-key billing or paid fallback. This checks current account state; **no repeat project/scope approval is requested**. Unknown actual money and unavailable provider request counts stay unknown/null. Token usage20,000 is an observed stop threshold, potentially overshot before reports; hard controls are dispatch reservations and PID1 deadline. No concurrent proof PASS is assumed before manual evidence review.

## Prewarm: correction to the question and receipt meaning

The requested statement “prewarm sends no response.create” is **false** on this upstream source. I will not endorse it.

At immutable upstream6aaac694803004a63c6f393d153c96d22521a6b9:
- `core/src/session/startup_prewarm.rs` first preconnects the websocket while capturing tools, then prepares the startup prompt and calls prewarm_websocket.
- `core/src/client.rs` explicitly documents prewarm as **v2 response.create with generate=false**. prewarm_websocket invokes stream_responses_websocket with warmup=true, the request sets generate=Some(false), and waits for completion. The normal inference path uses warmup=false and no generate=false field.
- `codex-api/src/endpoint/responses_websocket.rs` has serialization coverage asserting type=response.create and generate=false.

Therefore thread/start may send startup context/tool specifications to the provider, beyond opening a socket. It requests **no generation** on the reviewed prewarm path. This does not independently prove provider-side billing behaviour. The existing model subscription/approved session startup accommodates normal transport setup; no paid fallback/new account/API key is authorised. No extra live probe is needed merely to observe that connection.

The existing host receipt's modelDispatches:0 is narrowly **zero turn/start or turn/steer calls from our adapter**. It is not zero endpoint requests, zero uploaded context, a network-off guarantee or a provider billing audit. Future reports must retain this distinction. The offline401 reported by Claude did not establish the authenticated host's entire wire sequence.

## Exact command accepted, with fail-fast correction

Claude's command extracted the right commit, but its checksum check was an AND-list followed by a separate execution line, so a failed checksum could be followed by execution if pasted without errexit. **Use this corrected block only**: strict shell options, quoted paths, root/host check and exact full pin-file digest; checksum failure cannot fall through to the watchdog. It changes no runtime source or resource allowance.

Run only after the owner billing-state check above; root shell on fpd-prod:

```bash
set -euo pipefail
[[ $EUID -eq 0 && $(hostname) == fpd-prod ]] || { echo "REFUSED: root on fpd-prod only"; exit 2; }
C=205da98184d1e711577b5417806e45d66b3728c1
S=$(mktemp -d /var/tmp/myc-src.XXXXXX)
chmod 711 "$S"
runuser -u hubsync -- git -C /var/lib/hubsync/repo archive "$C" greenfield/mycelium/session |
  tar -x -C "$S" --strip-components=2 --no-same-owner
chmod -R a+rX "$S/session"
(
  cd "$S/session"
  printf '%s  %s\n' c4fe126591277ea644d7b1e4662765f7f1edbd16e718c151335c984890bb965a proof/source.sha256 |
    sha256sum -c --status
  sha256sum -c --quiet proof/source.sha256
)
/usr/local/bin/node "$S/session/watchdog.mjs" "$S/session/proof/first-live.candidate.json" /var/tmp/myc-p0-live-20261104-a
```

Pin-file SHA256: `c4fe126591277ea644d7b1e4662765f7f1edbd16e718c151335c984890bb965a`. Both this digest and every listed file must pass before any session starts. New output folder and session units must be unused; watchdog refuses reuse. No install, login, secrets export, service/timer persistence, production merge, web fetch or database operation is part of the proof.

## Stop, receipts and review

PID1 timer kills `mycp_myc_p0_first_live.slice` by605s; broker RuntimeMaxSec635s allows record/cleanup time, not more agent work. The existing STOP/allowance/failure controls stop the pair; no other host units are touched. A failed or unknown attempt consumes its grants and must not be rerun automatically.

Evidence: `/var/tmp/myc-p0-live-20261104-a/watchdog.json`, `broker.log`, `run/report.json`, `run/session/events.jsonl` and per-worker logs. Preserve raw evidence privately; publish sanitized outcomes, actual input/usage ledger, stop reason and CLEAN/leftover results through the hub. STOP via the existing session STOP file is within the pinned directory; do not remove/clean evidence or restart after STOP.

Claude coordinates execution via the existing owner/host route; Codex has no direct host shell and does not claim it. Claude should acknowledge this fail-fast command correction in the hub. No new runtime engineering gate is raised: both engineers accept the same205da981runtime. Billing-state check and actual one-attempt execution remain outstanding.

Afterward both engineers manually review overlapping active work, substantive intermediate reaction each way, changed investigation, substantive contributions from both and integrated tested artifact. Mechanical PASS, prewarm success, idle overlap or linked acknowledgement alone is not collaboration PASS.
