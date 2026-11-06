# Third-proof independent review and fourth-proof repair — 6 November 2026

## Verdict and ownership

Third run remains mechanical FAIL; substantive two-engineer collaboration is demonstrated by the published evidence, including both models' integrated executable contributions. C1 is a real Codex transport bug. Fixed offline here; malformed-attribute parser counterexample also fixed in a separate recovered-artifact copy. Original evidence remains untouched.

Chris explicitly said “ok fix it and approved 4th run”. ONE fourth attempt is already approved within the same limits; DECISIONS records it. No repeated scope approval needed. Final source/command must get Claude's independent review and the existing current billing guard before launch. Nothing has run under the fourth grant here.

## C1 minimal transport fix

Previously both inbound tool requests and every notification occupied the same eight-work-item allowance, including notifications ignored by the adapter. The relevant handler awaited durable coordinator ACKs. A normal wire burst could exhaust eight before that await completed. The independent 100-notification blocked-handler regression fails against the original transport with RPC inbound work limit.

Keep outgoing request limit8 and inbound server-request limit8. Notification backlog now has its own bound:256 active/queued notifications and1,048,576 serialized bytes. Existing per-frame65,536 bytes, input-chunk burst limit and fail-closed write backpressure remain. Relevant notifications are sequential in wire order. Responses and server requests remain independent of that queue. Handler/broker errors stop the transport; queued notification handlers do not continue after closure. No retry, extra inference, credential/tool change, sandbox widening or budget increase.

CodexSession synchronously filters only methods its existing handler ignores. turn/started, thread/tokenUsage/updated and turn/completed always remain eligible for the ordered handler. This drops no used semantic event. Filter defaults to accept-all in generic CodexRpc.

Five new tests cover100 blocked-handler notifications with responsive request/response, independent notification count/byte overload, unchanged nine-request flood refusal,1000 ignored deltas around ordered relevant notifications, and broker-handler failure preventing later notification effects. This repairs tested ordinary bursts, not an unlimited queue or a guarantee any workload cannot hit a genuine overload.

## Exact offline checks

Node24.19.0 managed workspace, no model/network/host calls.
- New codex-rpc-burst5/5.
- Existing codex-adapter15/15, codex-read-budget5/5, codex-live-regressions10/10, codex-boundary10/10, proof-package3/3:48 focused PASS including new tests.
- Independent lowerbound-coverage1/1 PASS (49 total focused checks).
- Watchdog suite6PASS/4FAIL here; rerunning unchanged pre-patch candidate/test source gives the SAME6PASS/4FAIL. These process/fixture results are not a full-suite PASS and need Claude's capable-environment rerun before launch. Existing managed process execution limitations remain. Watchdog source itself is unchanged; only live-4 expected names updated.
- All55 source pins verified.
- Whole process suite NOT certified here; request Claude full existing suite and supplemental rerun on final source.

## Parser counterexample and repair

Original final069e3894 drops /real after <span don't>ignored</span>. Quote tracking opened on an apostrophe in an attribute name and consumed the rest of the page. Quotes now open only in the before-value state after equals, not in names or unquoted values.

Preserved-copy repair at proof/repairs/live-3, with provenance README. Original evidence unchanged. All original6fixed+16Claude+3Codex tests PASS on original archive. All25 retained tests and2new quote tests PASS on repaired copy. New malformed-name/unquoted-value regression FAILS before repair; genuine quoted values with embedded > and fake anchors remain covered. Reruns used Node read-only filesystem permissions/no subprocess grants, not an OS sandbox or in-session execution. The repaired copy is NOT preloaded into live-4 fixture; no canned collaboration success.

## Independent third-run evidence

Verified117 sanitized events: contiguous sequence numbers, backwards references, timestamp offsets; reanalysis matches published report for overlap, usage/fresh/qualifications, grants, newest integration and all criteria. All6 archived file hashes verified. Fixed oracle byte-equal to unchanged scenario fixture.

Confirmed active overlap197,414ms;12grants; latest integration069e38947d7bb006aff6a4b46bff7e394c37412a tested at88 after merge87. Claudefinal suite contribution24, negotiated division17→42→49, Codex implementation63/peer-linked changes86 and two-phase receipts66/88 show actual shared work, not independent parallel assignments. Newest in-session tests cover both fixed and supplemental suites. Stop and worker failure remain false criteria; no retrospective mechanical PASS.

Reported total Claude250,483 / Codex386,209; fresh30,298 /48,801. Claude explicitly lower-bound, so “observed below threshold” is valid, exact actual Claude consumption is not certified. Published watchdog clean=true, fired=false, leftovers0/0/empty/0; receipt consistency checked, not independent host inspection. Raw private stream not inspected.

## Fourth candidate and handoff

Candidate idmyc-p0-live-4; fresh output must be /var/tmp/myc-p0-live4-a. Same300kfresh observed stop/agent,6authorisinginputs each/12total,600s+5s/PID1605sagents635sbroker; two test phases60seach within overalldeadline; £0paidAPI/subscription only/no paidfallback. No web, Neon, Pi, production, new credentials or unrelated configuration changes. Do not reuse third grant/output/script.

Candidate SHA256 b7996653cd3d1b4dc9cd6260cf2943971f67f29cdac664d000fcb9f7b4a3dd8e;55-entry pin-file SHA256 a02652395fb4471221fa0174d686d75b5e014026d6bc2c683e7a04f0f0e6daeb.

Claude: independently challenge source and run full suite plus supplementals and repaired-artifact tests; publish exact runtime acceptance. An immutable live-4-command follows this source commit and must be syntax/hash reviewed. Execute once through existing Claude/Chris route after both source sign-offs and current billing guard. Owner's fourth approval persists; do not ask again for same scope. No fifth attempt/retry after failed or unknown fourth result.
