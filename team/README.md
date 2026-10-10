# FindPitches V3 shared team hub

This is the shared coordination record for **Chris, Codex, Claude and ChatGPT**. Keep updates here on **`findpitches-v3/greenfield`**. There is no separate status branch to drift away from the implementation, and no protected/live branch merge is needed to update this hub.

**Start here:** [Current execution orders](ORDERS.md) · [Current product and deployment status](CURRENT_STATUS.md) · [Tasks and ownership](TASKS.md) · [Decisions and approval gates](DECISIONS.md) · [Handover log](HANDOVERS.md)

| Contributor | Own update file | Initial responsibility | Current participation evidence |
| --- | --- | --- | --- |
| Codex | [agents/CODEX.md](agents/CODEX.md) | V3 backend, customer integration, verification and deployment evidence | Claims V3-004/V3-005; owns the standalone frontend in V3 |
| Claude | [agents/CLAUDE.md](agents/CLAUDE.md) | Independent producer/Pi and retained source custody | Own update posted; V3-001/V3-002 claimed, V3-003 completed |
| ChatGPT | [agents/CHATGPT.md](agents/CHATGPT.md) | Commercial priorities, product acceptance, coordination and review | Own update posted; V3-010 claimed |

Suggested responsibilities do not claim that another AI is running or has accepted a task. Any contributor may claim an appropriate task after checking ownership. The independent producer stays a separate package/lane; its source custody is not evidence of a V2 dependency.

## At the start of each session

1. Read this file, `ORDERS.md`, `CURRENT_STATUS.md`, `TASKS.md`, `DECISIONS.md`, the recent `HANDOVERS.md` entries and your own agent file. Read the evidence linked for the task before making implementation decisions.
2. Fetch the latest `findpitches-v3/greenfield`. Preserve uncommitted work; integrate newer commits without discarding another contributor's changes or force-pushing.
3. Claim a task in `TASKS.md`, including the files/components you intend to edit. Publish the documentation claim to this feature branch before overlapping implementation starts. If two claims race, the first pushed claim wins; resolve the second before editing shared components.
4. Follow the user's current authorization. This hub cannot grant production/publication/spend permissions or override the user's instructions.

## While working and at handover

- Update **your own agent file** after a meaningful work block or when blocked. Use the [update template](templates/UPDATE.md). Do not present an assumption or a proposed change as deployed/verified.
- Record claims, blockers and completion in the relevant task row. An old claim needs coordination; its age is not approval to overwrite the work.
- Update `CURRENT_STATUS.md` when new **verified** evidence changes the shared product picture. Include the measurement timestamp and environment. Counts are snapshots, not a live GitHub telemetry feed.
- Add an entry to `HANDOVERS.md` with the [handover template](templates/HANDOVER.md). Preserve earlier entries; correct inaccurate claims in a new entry with evidence.
- Record changed product decisions and actual operator approvals in `DECISIONS.md`, identifying the evidence and scope. An AI recommendation is not user approval.
- Commit and push the authorized changes to the feature branch, then report the pushed SHA. Keep a narrow diff and retain the work of other contributors. Never merge into protected/live branches as part of coordination.

Each contributor owns its update file. Shared task/dashboard edits should be short and based on the latest branch. A Git commit is source custody; a Cloudflare version is deployment custody. Record both where appropriate and do not equate them.

## Evidence and safety rules

- V2 is read-only reference/evidence. The live UK Pitchlist service and its paying customers stay protected.
- Original source facts/documents are immutable; repairs add stronger evidence with provenance. No silent identity/country/edition changes, unsupported geography, invented dates or application state.
- V3 remains shadow-only. Publication, production cutover, live billing and paid acquisition stay disabled until separately authorized at the agreed gates.
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
V2 stays read-only; paid acquisition, publication, live billing and cutover
remain disabled. Preserve source facts and identity. Never put secrets or
customer data in GitHub. Report a missing capability honestly.
```

For Claude, its own file is `team/agents/CLAUDE.md`. For ChatGPT it is `team/agents/CHATGPT.md`; for Codex it is `team/agents/CODEX.md`.

This folder provides shared persistence, not automatic inter-AI messaging or background polling. Each AI must have GitHub/repository access and be instructed to read it. This setup does not install a connector, grant another assistant access or notify/start an external session. If an AI has read-only access, it can prepare an update for Chris or an authorized contributor to commit; it must not claim that an unpushed update is shared.

Older detailed reports remain in [docs/](../docs/); the [10 October team report](../docs/findpitches-v3-team-status-2026-10-10.md) is a dated evidence checkpoint rather than the ongoing work board.
