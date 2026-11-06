# M1/M2 combined offline recovery repair — 6 November 2026

## Status

Offline source repair delivered, NOT live-ready or an approval request. No fifth run, new candidate, larger allowance, host change or model call. Existing 24KB supplied-text, six authorising inputs,64dynamic-tool-call and resource boundaries retained. Historical live-4 scripts still point at their immutable consumed runtime; do not run them on this patch.

## Changes

M1: model argument validation returns unsuccessful tool results rather than rejecting the RPC handler. Applies to invalid top-level values, read fields, publication kind/body/refs, missing/invalid base, invalid/null file entries and unexpected keys. Invalid call outcomes are cached by call ID/signature, just like success: duplicate calls do not repeat reads, mutations or text-budget charging. Definitive coordinator stale-base and submission-refused-before-write outcomes are recoverable; errors are bounded and never echo arbitrary provider/coordinator error text.

Fatal boundaries remain: wrong thread/turn/tool or approval identity, changed payload under an existing call ID, missing trusted runtime capability, unknown/ambiguous broker failure, transport failure and actual hard tool-call limit. No blanket catch-and-continue.

M2: Codex has an explicit myc_inbox dynamic tool over the EXISTING coordinator pull operation. The worker exposes that operation through runtime.pull; no new communication framework. Adapter owns an independent cursor; concurrent inbox calls serialize, existing delivered IDs are filtered, and cursor/seen state advances only after a successful bounded result. Refused oversized deliveries remain available at the same durable cursor. This does not drain or change the worker's steering buffer. No seventh reservation or implicit new inference dispatch.

The tool consumes the existing text and64-call limits and normal provider inference may continue afterward; it is not free plan usage. Existing turn instructions explicitly ask the model to poll after steering pauses. This makes later findings/tests available, not proof a real model will choose to use them.

Context exhaustion: oversized reads/inbox results deliver no partial file/event content. Bounded refusal text is charged. Once even that text cannot fit, return success:false with zero contentItems, allowing an honest terminal completion rather than throwing a worker-killing exception. This is a zero-TEXT receipt, not zero protocol/provider tokens. No automatic compaction, hidden extra allowance or160KB increase. Publish/submit successful durable ACK accounting otherwise retains existing semantics.

## What actually ran here

Node24.19.0, in-memory streams, real CodexRpc and real CodexSession. No model, network, sockets, child CLI or remote service in the combined wire-level rehearsal. Its coordinator publish/read/pull capabilities are explicit stand-ins; this is NOT a complete worker/Git/sandbox PASS.

New combined file7/7:
1. Spend start+five steers, pause intake, receive late peer and latest-test stand-in through inbox; malformed publish/submit/read errors; oversized read refusal; head/selective read; stale refusal; corrected linked submission, duplicate ID acknowledged once; normal completion without a seventh permit.
2. Repeated refusals exhaust supplied-text allowance without crossing cap; zero-text failure receipts and normal terminal completion.
3. Sixteen malformed argument cases remain recoverable and never mutate.
4. Definitive pre-write broker refusal returns one cached unsuccessful result without retry.
5. Concurrent inbox calls serialize cursors; duplicate call IDs share receipt.
6. Oversized inbox retains cursor; later smaller result succeeds; STOP interrupts.
7. Unknown broker outcome and changed duplicate payload still fail closed.

Three targeted combined/argument/exhaustion cases FAIL against original d2ae54fc adapter and PASS patched.

Existing adapter15, read-budget5, notification-burst5, live-regressions10, boundary10, package3, independent lowerbound1:49 existing focused PASS. With7new, **56 focused PASS**. Worker and process-fixture syntax checked; all58 source pins verified. Existing tests expecting model argument/exhaustion exceptions were changed to assert bounded unsuccessful results rather than removed.

## Full process rehearsal supplied, NOT passed here

Run from session root:
node proof/review-tests/recovery-runtime.mjs

Uses actual coordinator, worker IPC, real Git integration, fake CLI fixture and existing unshare sandbox. Exercises six Codex grants, late peer polling, invalid/stale submission recovery, real file integration and actual sandboxed latest-commit test receipt, then clean completion. No model/provider connection.

This workspace lacks working unshare, so test reports **1 SKIP,0PASS**. Do not count skip as evidence. No sandbox bypass. Claude must run it in his already-capable offline development environment and review failures; no BRIX model invocation or new host access is authorized. Also run existing full suite, supplemental timing/accounting checks and verify worker/runtime plumbing. In particular review zero-content unsuccessful receipts against the native CLI's existing protocol contract without inference; scripted transport proves recovery logic, not undocumented CLI behavior.

## Cost and next step

Fourth reported usage remains877,991total inclcached /108,300fresh; no additional live inference from this work. The patch does not make a fresh-token threshold a hard monetary cap.

Next Claude: independently challenge this source, execute full process recovery and full offline suite, report actual PASS/FAIL/limits and exact source acceptance. Keep CURRENT_EXECUTION_ORDER paused. Do not publish or request a fifth live proof until combined recovery is green and unresolved behavior is explained. No budget increase accepted. Owner approval would be separate only if a concrete fifth proof is later requested.
