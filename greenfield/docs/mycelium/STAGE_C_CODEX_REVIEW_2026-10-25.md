# Stage C revision 2 follow-up — PASS (26 October 2026)

Reviewed Claude commit `f7b18376c4623ba7d16c790ccd43fe6e689554b7`, limited to the three requested corrections. **R1–R3 PASS.** Independently retrieved the exact revision through the GitHub connector and ran `bash greenfield/mycelium/notify/test-mycnotify.sh`: **30 passed, 0 failed**, using temporary local Git, fake curl and a fake clock. All six SHA256SUMS entries match; Bash syntax checks pass. No host execution, credential provisioning, mail or model calls.

- **R1:** MODE=live refuses a missing PIN; candidate admission compares the exact decision key to PIN. Tests verify unrelated outstanding decisions do not send across repeated runs, and a rejected pinned decision does not send. Plan §5 keeps the timer off; a later pinned dummy send and subsequent no-duplicate runs require separate owner approval. Existing durable terminal/uncertain/baseline records prevent re-admission.
- **R2:** per-London-day attempt log is appended and synced before claim/request. Tests reproduce cap 2 with two attempts then defer the third, retain both attempt lines, allow the third attempt after London midnight and enforce the three-attempt maximum.
- **R3:** instructions now require a nonempty string of at most 4096 UTF-8 bytes; result_location must match the exact notify-test task-local path. Numeric, empty, wrong-path and oversized descriptors quarantine even when pinned.
- Local-ledger pilot acceptance stands. Revised documentation explicitly excludes partial deletion and restoring stale ledger copies from its no-duplicate claims.

Verified `mycnotify` SHA256: `b18edfaaaa8d0359ee2eeb9d084cd6f489f83c26b9c40cb8b7ffa1dc50d546fe`. Installer SHA256: `2e7b54535e0a6673dba49dfe4bdc22d244d9c4b21bafe0141594ebf38eb1028b`.

**Next owner decision:** authorize, or defer, the dry-run installation on fpd-prod from a folder containing all six reviewed files plus SHA256SUMS: `sudo bash install-mycnotify.sh`. The installer verifies the bundle and existing HubSync source, creates the isolated account/unit and empty credential placeholders, runs one dry-run poll, and does not enable the timer. This host step is **not yet authorized or executed**; prior approval covered HubSync only. A dedicated key, verified sender/recipient, quota preflight and the single pinned live test are a separate later approval, as specified in the plan. No ongoing live use or Stage D dispatch is authorized.

HubSync remains installed/closed; the completed Stage B manual collaboration is not reopened.

---

## Original revision 1 review (historical; findings resolved above)

# Stage C bounded Codex review — CHANGES REQUIRED

25 October 2026. Reviewed Claude commit `9c2cb9689d2ad5d79358376bef54ac597732e5d1`. One bounded review of the Stage C plan, source and offline verification. No installation, host change, credential provisioning, email or model/API call.

## Result

**FAIL / changes required before host or live-send approval.** Independently ran `bash greenfield/mycelium/notify/test-mycnotify.sh`: **26 passed, 0 failed**. All six `SHA256SUMS` entries match. Additional local/fake-curl probes expose two gaps absent from the maintained suite.

### R1 — single dummy live-send gate is not enforced

Plan §5 enables the timer while dry-run, then sets MODE=live before adding the dummy task. The runtime selects every eligible decision in notify-test/tasks. Any other new awaiting_approval task after baseline can therefore consume the run or cause an additional email before the operator returns to dry-run. One-per-run and five-per-day are not a bound of one approved dummy notice.

Required: keep the timer stopped for the first live check, restrict live admission to the exact reviewed dummy decision/event, and use a durable one-notice gate so repeated manual runs cannot send other decisions. Specify the exact check/cleanup commands. Deduplication checks may use the same pinned decision; ongoing live timer operation remains a separate approval. Do not enable live sending to all test tasks under approval for one dummy email.

### R2 — daily claim cap counts decision files, not claim attempts

`mycnotify` lines 199–212 count ledger files with today's claim_day, but each retry overwrites the same file. Repeating that decision therefore consumes one counted record across multiple actual claims.

Independent reproduction, appended to a local copy of the maintained harness after its 26 checks:
- Advance the fake clock by one day; set MYCNOTIFY_MAX_DAY=2.
- Create one fresh awaiting decision; set fake curl to connfail.
- Poll three times, advancing the fake clock 200 seconds between runs.
- Observed **3 HTTP attempts with daily cap 2**.

Required: persist and enforce the daily attempt count before every request, including retries, without overwriting its history. Add coverage for retries on one day and across the London day boundary. Retain the current maximum-three-attempt rule and uncertain-never-resend rule.

### R3 — malformed five-field descriptors still send

`fold` lines 79–82 check field names, task id, initial status and assigned agent but do not validate instructions or result_location types/content.

Independent reproduction: create an otherwise valid awaiting decision and set `.instructions=42 | .result_location=42`; push to the temporary local bare fixture and poll with fake curl success. Observed **1 mail call, ledger state accepted**, rather than quarantine.

Required: validate the complete agreed descriptor schema, including nonempty string instructions and the exact task-local result_location under the notify-test path, and add negative tests. Keep validation limited to the existing contract; no new orchestration framework.

## Explicit ruling on local claim deviation

**Acceptable for the proposed single-host Stage C pilot**, conditional on fixing the above: an isolated local write-ahead ledger avoids another GitHub write credential and leaves HubSync untouched. It is not a public GitHub send receipt or an exactly-once delivery guarantee. Preserve single-instance locking, durable claims, uncertain-never-resend and refusal after total ledger loss until baseline. Document that baseline may intentionally suppress missed notices; do not claim arbitrary partial ledger deletion or restoring an old ledger can never duplicate a notice.

Anonymous Git reads, separate account/credentials, test-only task path, plain-text notification with “reply is not approval”, and no AI dispatch are appropriate boundaries. Verify dedicated key/sender/recipient and available no-incremental-cost quota before any later separately approved live test; the existence of an account alone does not prove free headroom.

## Next actor and gates

Claude makes the narrow plan/source/test corrections and repins. Source/offline review needs no additional project approval. Do not install a service, provision a key, enable a timer or send mail on this failing candidate. Chris's previous approval was for HubSync rev 3 only; HubSync is installed and closed. Stage B proof remains complete and Stage D remains closed.
