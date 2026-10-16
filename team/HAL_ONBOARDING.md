# Hal / OpenClaw — FindPitches V3 onboarding and current provider task

Prepared by Codex at Chris's request on 16 October 2026. This is an invitation and handoff, not a claim that Hal has connected, acknowledged or completed anything.

## Hub location and access

- Repository: https://github.com/christucker-sketch/PitchListUK
- Working branch: **`findpitches-v3/greenfield`**, not the default `main` branch.
- Hub: https://github.com/christucker-sketch/PitchListUK/tree/findpitches-v3/greenfield/team
- Direct readable copy of this guide: https://raw.githubusercontent.com/christucker-sketch/PitchListUK/findpitches-v3/greenfield/team/HAL_ONBOARDING.md

Codex verified that the repository is **public** and the hub returned HTTP200 without an Authorization header on16October. Read access needs no invitation or token. You can read the raw links with a normal browser or HTTP client, even before configuring Git.

Write access is separate. Use your existing GitHub login/credential helper on the OpenClaw host; do not copy Codex's credentials or reuse a Cloudflare/Stripe token for GitHub. Your host's authentication has not been tested from this session, and no new collaborator invitation has been issued. If you already authenticate as the repository owner or an authorized collaborator, you can push to this feature branch. Otherwise report your GitHub username and the access error to Chris; he can grant repository Write access through GitHub Settings → Collaborators. Keep tokens out of chat and repository files.

For a new checkout in a new, unused directory:

```bash
git clone --single-branch --branch findpitches-v3/greenfield https://github.com/christucker-sketch/PitchListUK.git
cd PitchListUK
git branch --show-current
git push --dry-run origin HEAD:refs/heads/findpitches-v3/greenfield
```

The dry run checks the existing credential's push path without changing the remote branch. If you already have a checkout, inspect `git status`, the branch and remote first; preserve local work. Do not clone over an existing working directory, discard changes or switch a live deployment checkout to this branch. A separate fresh checkout is sufficient for hub documentation; no application setup or deployment is required.

Fetch before each work block. Some checkouts fetch only `main`, leaving the feature branch's remote-tracking ref stale. This explicitly refreshes the right ref:

```bash
git fetch origin refs/heads/findpitches-v3/greenfield:refs/remotes/origin/findpitches-v3/greenfield
```

On a clean feature-branch checkout, integrate upstream with a fast-forward when possible. Resolve any divergence while preserving peers; never force-push or merge to protected/live branches. If access is read-only, you can still perform the authorized Stripe dashboard change and send Chris a sanitized completion note to relay. Do not describe an unpushed note as a shared hub update.

## What this hub is

The hub is the team's persistent GitHub coordination record. It does not automatically message agents, connect their sessions or grant provider permissions. Measurements have observation timestamps; older status entries are historical, not live telemetry.

Read these before acting:

1. [README](README.md) and repository [AGENTS.md](../AGENTS.md).
2. [Current status](CURRENT_STATUS.md), [tasks and ownership](TASKS.md), [decisions](DECISIONS.md) and [orders](ORDERS.md).
3. Recent [handovers](HANDOVERS.md), including the16October P0 entry. The new [LIVE signup incident](LIVE_SIGNUP_INCIDENT_2026-10-16.md) takes precedence over the older performance order.
4. [Native signup diagnosis and deployed changes](../docs/findpitches-v3-live-signup-incident-2026-10-16.md) and its [sanitized evidence](../operations/findpitches-v3/reports/live-signup-incident-2026-10-16.json).

Responsibilities:

| Contributor | Responsibility |
| --- | --- |
| Chris | Product/operator authority and genuine owned customer acceptance |
| Codex | V3 backend/customer runtime, evidence verification, deployments and native checks |
| Claude | Independent structured producer, Pi/source custody and producer changes |
| ChatGPT | Product priorities, coordination and acceptance |
| Hal / OpenClaw | Requested provider-side configuration using existing operator custody; current task below |

Hal should create **`team/agents/HAL.md`** himself using [the update template](templates/UPDATE.md) when connected. Record actual access, timestamp with Europe/London offset, the exact task accepted, evidence, blockers and next action. Do not edit another AI's own status or claim their runtime work. Before overlapping implementation, publish the scope/claim in `TASKS.md`. For this P0, add a dated provider-subtask acknowledgement under V3-010; Codex retains customer runtime/reopening ownership and ChatGPT retains acceptance coordination.

After each meaningful checkpoint, commit and push your narrow hub update to `findpitches-v3/greenfield` immediately so the team can see it. Documentation updates must not trigger acquisition/deployment. Never commit API keys, env files, customer records/emails, screenshots containing secrets, cookies or one-use links. The repository is public.

## Immediate P0: correct the existing Stripe key's Customers permission

Chris has specifically asked for this correction. There is no request for a new Stripe setup.

At the last native checkpoint, **16October13:53London**, the real user journey had consumed its email link and issued a valid session, returning to its saved pricing path. Checkout failed before a Stripe customer or Checkout reservation could be created. The actual deployed restricted LIVE key returns **HTTP403 `more_permissions_required` for Customers Read and Write**. Product, approved LIVE prices and dedicated Portal configuration reads pass. This is a provider permission blocker, not a failed email or a stuck reservation.

**Your authorized change:** edit the same existing restricted LIVE key used by the production V3 Worker. Set **Customers → Write**, including Read. Preserve every other permission and any IP restriction. Save the change in Stripe. No new key or Cloudflare secret replacement is required for an in-place permission change.

Use your existing secure operator custody to identify that exact key. Cloudflare cannot export a current secret binding, and you should not reveal raw keys to identify it. If you cannot establish the right account/key, report that specific blocker rather than modifying a different credential.

The following identifiers are configuration references, not credentials:

| Item | Existing approved target |
| --- | --- |
| LIVE Stripe account | `acct_1TTp8UEIdSfbjtdo` |
| Product | FindPitches Pro — `prod_VQF2oqHreWwhOj` |
| GBP monthly price | `price_1UPOYoEIdSfbjtdokwYZebsp` — £4.99 |
| USD monthly price | `price_1UPOYoEIdSfbjtdoDVzOaxpQ` — $6.99 |
| EUR monthly price | `price_1UPOYoEIdSfbjtdov30fVN2j` — €5.99 |
| Dedicated Portal | `bpc_1UPOZ7EIdSfbjtdoUSK1A5h9` |
| Cloudflare account | `7e1bec4650ae51a1a429d4449cda169d` |
| Production customer Worker | `findpitches-v3-customer-production` |
| Worker secret binding using the key | `STRIPE_SECRET_KEY` |
| Public customer site | https://findpitches.com |

The source for the approved Stripe references is [the existing handoff](../operations/findpitches-v3/customer-production-stripe-handoff.json). Pricing buys one global Pro entitlement with a seven-day first trial; currency does not restrict geography.

Do not rotate/create keys, create products/prices/customers/subscriptions/charges, change Portal/webhook configuration, replace Worker secrets, modify PitchList/V2, enable paid acquisition, send test/marketing emails or reopen Checkout as part of this correction. No code deployment is needed from Hal.

## What Codex has already done and what follows your change

At the16October13:55London handoff, new Checkout was **closed** while public browsing, sign-in and account recovery remained **on**. Actual owned LIVE trial/Pro/Portal acceptance remains incomplete. Other acquisition/publication/migration gates are unchanged.

Codex deployed safe provider diagnostics, a clearer authenticated pricing notice, an operator-only native capability endpoint and a launch permission gate. Final customer Worker version: `b4fb82d0-7728-49a2-9890-a9883175939d`; implementation commit `67237e20`; completed incident handoff commit `21818b3a`. Full473 tests, final public29 and six local authenticated language/device combinations passed. Native Customer permission checks remained deliberately red. These are dated observations, not a new runtime measurement made by this onboarding guide.

Once the permission edit is saved:

1. Report the actual save time, existing key label if useful, Customers permission before/after, and that other restrictions were preserved. Include **no key value or customer data**.
2. Publish this in your own `team/agents/HAL.md`, append a sanitized handover and a dated provider-subtask note under V3-010. Leave the overall incident open. Push and provide the commit SHA. If push access is unavailable, give Chris the note and state that it has not been published.
3. Codex re-runs authenticated `/ops/billing/capabilities` using its existing securely stored operator credential. Read checks must return successful empty lists; missing-resource write probes do not establish a successful real hosted trial. Do not request or copy the operator token.
4. Codex performs fresh native/public checks and guarded Checkout reopening under the already approved launch scope.
5. Chris repeats the genuine email → authenticated pricing → LIVE hosted Checkout → seven-day trial → global Pro → Portal/cancel/paid-through journey. Do not impersonate him or mark V3-010 complete on a configuration edit alone.

After that, keep using the same hub for requested provider tasks. Independent producer/catalogue work stays with Claude/Codex; commercial/product choices stay with Chris/ChatGPT.
