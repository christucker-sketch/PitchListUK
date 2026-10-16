**Latest verified checkpoint — 2026-10-16T20:09:05+01:00:** [Second measured performance release](../docs/findpitches-v3-proof-read-model-2026-10-16.md). CatalogueAPI2.84→1.23s; filter3.17→1.43s; country useful-content3.23sdesktop/3.40smobileviewport. Full498/public29before+after/browser18 pass. API-only release; customer/billing, other7source Workers, routing and PitchList preserved.1,784READY at20:06:21London; paid0/off, sourcepublication0. **V3-029 remains ACTIVE:** sub-second goal open; next market/listing read scoping and request-owned SEO reuse. Storage48/72h due17/18October, then French proof, upcoming/Save.

**Latest verified checkpoint — 2026-10-16T19:43:13+01:00:** [Native billing DONE; first performance release LIVE](../docs/findpitches-v3-performance-2026-10-16.md). Desktop country18.7→5.5s/category22.0→5.4s/listing11.7→4.7s; full485/public29/browser18perphase pass. Public/sign-in/Checkout/recovery on; sourcepaid/publicationoff, PitchList/V2 preserved. **V3-029 remains ACTIVE**: API2.3–2.7s, sub-second goal not met. Then storage48/72h due17/18October, French proof, upcoming/Save. [Exact resume queue](agents/CODEX.md).

**Latest customer checkpoint — 2026-10-16T19:12:24+01:00:** [V3-030 native billing LIVE/DONE](../docs/findpitches-v3-native-billing-2026-10-16.md); public/sign-in/Checkout/recovery on. Full482/localbrowser38/genuineStripeTEST/public29before+after/publicbrowser6 pass; PitchList/shared Stripe preserved. V3-010 owned functional acceptance DONE. **V3-029 performance ACTIVE**, followed by scheduled17/18October storage, French proof, upcoming/Save. Earlier Portal-choice-pending/ACTIVE billing text below is superseded.

**Current priority — 2026-10-16T18:53:05+01:00:** [Native FindPitches Billing approved](FINDPITCHES_NATIVE_BILLING_PAGE_ORDER_2026-10-16.md); Codex V3-030 ACTIVE. [Strict ordered backlog](CODEX_OPEN_TASK_CONSOLIDATION_ORDER_2026-10-16.md). Earlier Portal-choice-pending text is superseded; owned LIVE acceptance is complete.

# FindPitches V3 shared team hub

**Current customer checkpoint, 2026-10-16T16:26:37+01:00:** [Owned LIVE signup/cancellation confirmed; scoped Checkout branding live](../docs/findpitches-v3-checkout-branding-2026-10-16.md). FunctionalV3-010 acceptance passed, full474/public29/hostedTEST pass; public/sign-in/Checkout/recoveryon. Portal account branding still needs [a direction](STRIPE_BRANDING_DECISION_2026-10-16.md), preserving PitchList. Paid/source publication off.

Latest measured continuation, 2026-10-16T10:42:07+01:00: [1,842 READY; French proof/upcoming intake validated; storage follow-up](../docs/findpitches-v3-hub-continuation-2026-10-16.md). V3-026/027 complete; V3-020/022 broader follow-ups active. Paid off, customer runtime unchanged.


This is the shared coordination record for **Chris, Codex, Claude, ChatGPT and Hal/OpenClaw**. Keep updates here on **`findpitches-v3/greenfield`**. There is no separate status branch to drift away from the implementation, and no protected/live branch merge is needed to update this hub.

**Start here:** [Current execution orders](ORDERS.md) · [Current product and deployment status](CURRENT_STATUS.md) · [Tasks and ownership](TASKS.md) · [Decisions and approval gates](DECISIONS.md) · [Handover log](HANDOVERS.md)

**Latest completed Codex order — 16 October, 09:38 London:** [V3-025 recovery](../docs/findpitches-v3-source-renewal-recovery-2026-10-16.md) / [compact ingestion heartbeat](INGESTION_LOG.md). **1,842 READY;82 safely restored using117 source requests/0Serper.** Source retry/date fixes deployed, full451/public29/custody0 pass. Customer app/Checkout remain LIVE; no customer/Pi/V2/routing/paid changes. Older failed-proof audit V3-026, French proof V3-020 and storage monitoring V3-022 remain open. Older dated checkpoints below retain their observation dates.

**Team alignment, 14 October:** [ChatGPT coordination report](ALIGNMENT_REPORT_2026-10-14.md), acknowledged by [Codex at09:05 London](agents/CODEX.md). Next source experiment: official structured organiser calendars plus current trader intake. Claude owns the bounded source sample; Codex reviews the 78 withheld route candidates and retains proof/control ownership. Candidate switch remains OFF pending review. Older peer statements about an unpublished US scorecard or an unprepared kit are superseded by the dated alignment report.

**Latest Codex checkpoint — 14 October, 11:54 London:** [Current status and six withdrawals](CURRENT_STATUS.md) · [Fresh runtime evidence](../operations/findpitches-v3/reports/commercial-status-2026-10-14-midday.json) · [Earlier complete release/source report](../docs/findpitches-v3-us-learning-map-readiness-2026-10-14.md). Eligible READY **1,888**; public browsing and LIVE Checkout enabled; Pi active; paid acquisition manually paused/0V3queries today. The US growth target,78-candidate review, final Free/Pro rule and genuine owned LIVE billing acceptance remain open. These are timestamped measurements, not automatic live hub telemetry.

| Contributor | Own update file | Initial responsibility | Current participation evidence |
| --- | --- | --- | --- |
| Codex | [agents/CODEX.md](agents/CODEX.md) | V3 backend, customer integration, verification and deployment evidence | V3-004/005/008/015/016 complete; V3-017 growth claimed; V3-010 runtime owner, owned LIVE acceptance pending |
| Claude | [agents/CLAUDE.md](agents/CLAUDE.md) | Independent producer/Pi and retained source custody | Own update posted; V3-001/V3-002 claimed, V3-003 completed |
| ChatGPT | [agents/CHATGPT.md](agents/CHATGPT.md) | Commercial priorities, product acceptance, coordination and review | Own update posted; V3-010 claimed |
| Hal / OpenClaw | [agents/HAL.md](agents/HAL.md) · [onboarding](HAL_ONBOARDING.md) | Requested provider configuration; V3-010 provider subtask complete | Own saved-state verification14:54London: CustomersNone→Write only, other151permission rows/key/policy preserved; Codex native checks pass and Checkout restored; real customer acceptance separate |

Suggested responsibilities do not claim that another AI is running or has accepted a task. Any contributor may claim an appropriate task after checking ownership. The independent producer stays a separate package/lane; its source custody is not evidence of a V2 dependency.

## At the start of each session

1. Read this file, `ORDERS.md`, `CURRENT_STATUS.md`, `TASKS.md`, `DECISIONS.md`, the recent `HANDOVERS.md` entries and your own agent file. Read the evidence linked for the task before making implementation decisions.
2. Fetch the latest `findpitches-v3/greenfield`. Preserve uncommitted work; integrate newer commits without discarding another contributor's changes or force-pushing.
3. Claim a task in `TASKS.md`, including the files/components you intend to edit. Publish the documentation claim to this feature branch before overlapping implementation starts. If two claims race, the first pushed claim wins; resolve the second before editing shared components.
4. Follow the user's current authorization. This hub cannot grant production/publication/spend permissions or override the user's instructions.

## While working and at handover

- Update **your own agent file** after a meaningful work block or when blocked. Use the [update template](templates/UPDATE.md). Do not present an assumption or a proposed change as deployed/verified.
- **Push that checkpoint to the shared branch immediately after the meaningful work block. Do not leave a completed checkpoint only in a local/Cowork workspace waiting for Chris to sync it manually.** The shared branch is the cross-agent handoff boundary.
- If the current working tree is awkward to rebase/push safely, use `team/tools/hub-sync.sh` to publish a narrow status/evidence update from an isolated temporary clone. Example: `team/tools/hub-sync.sh "Claude: lifecycle checkpoint" team/agents/CLAUDE.md team/TASKS.md docs/example.md`. The helper never stores credentials and requires the environment to already have GitHub push authentication.
- Record claims, blockers and completion in the relevant task row. An old claim needs coordination; its age is not approval to overwrite the work.
- Update `CURRENT_STATUS.md` when new **verified** evidence changes the shared product picture. Include the measurement timestamp and environment. Counts are snapshots, not a live GitHub telemetry feed.
- Add an entry to `HANDOVERS.md` with the [handover template](templates/HANDOVER.md). Preserve earlier entries; correct inaccurate claims in a new entry with evidence.
- Record changed product decisions and actual operator approvals in `DECISIONS.md`, identifying the evidence and scope. An AI recommendation is not user approval.
- Commit and push the authorized changes to the feature branch, then report the pushed SHA. Keep a narrow diff and retain the work of other contributors. Never merge into protected/live branches as part of coordination.

Each contributor owns its update file. Shared task/dashboard edits should be short and based on the latest branch. A Git commit is source custody; a Cloudflare version is deployment custody. Record both where appropriate and do not equate them.

## Evidence and safety rules

- V2 is read-only reference/evidence. The live UK Pitchlist service and its paying customers stay protected.
- Original source facts/documents are immutable; repairs add stronger evidence with provenance. No silent identity/country/edition changes, unsupported geography, invented dates or application state.
- Follow the current user approval recorded in `ORDERS.md`/`DECISIONS.md`. D-014/D-016 authorize controlled **public FindPitches + new-customer LIVE billing only**; the unused source publication pipeline remains shadow-only. Paid acquisition, customer alerts, legacy migration, UKCraftFairs Option B, destructive changes and protected/live merges remain closed.
- No secrets, customer exports or emails, raw receipts, cookies, one-use sign-in links, tokens or credential files in this hub. Link sanitized repository reports, aggregate metrics and custody hashes instead.
- An access/export/recheck acknowledgement is not proof of current source verification, customer readiness or execution of every producer request. Preserve that distinction.
- Do not trigger deployment or paid workflows to update status. This hub is documentation only and adds no scheduled acquisition or publication.

## Give the other AI this instruction

```text
Use the FindPitches V3 shared team hub in christucker-sketch/PitchListUK,
branch findpitches-v3/greenfield, folder team/.
Read team/README.md, CURRENT_STATUS.md, TASKS.md, DECISIONS.md,
recent HANDOVERS.md entries and your own team/agents file before starting.
Update only your own AI status, claim task ownership before overlapping work,
link evidence/commits, and push authorized updates to the feature branch.
After every meaningful checkpoint, push the status/evidence immediately so the
other agents can see it without Chris manually syncing the workspace. If the
working tree is inconvenient, use team/tools/hub-sync.sh for a narrow isolated
push. V2 and live PitchList stay protected. Follow the exact D-014/D-016 authorized
FindPitches public/new-customer LIVE scope and latest ORDERS; paid acquisition,
customer alerts, legacy migration, UKCF Option B, destructive changes and
protected/live merges remain closed. Preserve source facts and identity. Never put secrets
or customer data in GitHub. Report a missing capability honestly.
```

For Claude, its own file is `team/agents/CLAUDE.md`. For ChatGPT it is `team/agents/CHATGPT.md`; for Codex it is `team/agents/CODEX.md`. Hal/OpenClaw starts with [the onboarding/access guide](HAL_ONBOARDING.md) and creates `team/agents/HAL.md` after his own acknowledgement.

This folder provides shared persistence, not automatic inter-AI messaging or background polling. Each AI must have GitHub/repository access and be instructed to read it. The checkpoint-push rule plus `team/tools/hub-sync.sh` removes the need for manual status-file copying **when that AI environment has GitHub push authentication**. If an AI environment has no GitHub write credential, that one-time capability still has to be configured; the helper deliberately does not embed or create credentials. If an AI has read-only access, it can prepare an update for Chris or an authorized contributor to commit; it must not claim that an unpushed update is shared.

Older detailed reports remain in [docs/](../docs/); the [10 October team report](../docs/findpitches-v3-team-status-2026-10-10.md) is a dated evidence checkpoint rather than the ongoing work board.
