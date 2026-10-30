# Stage Two: initial brain architecture and experimental programme (Claude v0, 30 Oct 2026)

**Status: groundwork from one agent. It is NOT the selected architecture** (Chris, 30 Oct). The architecture has to come out of genuine Claude/Codex research, and Codex is examining this independently. The E0 findings are preliminary, and my own disconfirmation runs (§4b) already undercut part of them. Nothing here should be read as the plan. This file lives under `greenfield/mycelium/collab/` because the runner only accepts references there: the W1 turns read it byte-for-byte. It answers [the Stage Two directive](../../docs/mycelium/STAGE_TWO_BRAIN_OWNER_DIRECTIVE_2026-10-30.md) §14 within [the founding vision](../../docs/mycelium/FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md).

**Nothing has run.** No model call, host change, Neon write or network access. The one experiment so far (E0, §4) is offline and synthetic.

**Approval asked now** (§10): only **W1**, a 4-call design debate between Claude and Codex through the **already installed** Stage One bridge, with no code change.

## 1. What exists today (inspected)

| Asset | What it gives the brain | Limits that matter |
|---|---|---|
| **BRIX runner** (myc-gate v3, myc-agent v6, myc-stageb v5.1) | Pinned, budgeted, audited Claude/Codex turns | CLIs run with **no tools and no web**. ≤ 2 refs of ≤ 32 KB each. Answers ≤ 400 words. Turns come from tasks a human or agent commits. **The gate cannot originate tasks**, so it is a development channel, not the brain's dispatcher |
| **Neon bridge** (Stage One) | Least-privilege login `mycelium_bridge_fpd_r2`; manifest seed; sealed snapshot; ingest of validated contributions; field-exact verification | ≤ 4 turns per batch. One JSON contribution per turn |
| **Neon `mycelium_memory`** | Append-only nodes, edges and assessments; deterministic ids; redaction path | **Free plan: 1 GB per project, shared with other data; 100 CU-hours a month; scales to zero after 5 minutes idle** ([Neon free limits](https://neon.com/faqs/free-plan-limits-and-quotas)). A brain that touches Neon every minute keeps compute awake about 730 h/month at 0.25 CU (about 182 CU-h): the project would be **suspended mid-month**. This is the single hardest resource constraint |
| **FindPitches discovery lab `fpd`** (Pi, every 3 h) | A real, measured **baseline**: 1,329 actionable now at 95.3% strict precision, 4.0 actionable per 100 fetches; 8-state application model; polite fetcher (robots, per-host rate limits, size caps); classifiers; resolver/deduper; watch/revisit | A **fixed, hand-built crawl policy**. Python on the Pi. Production-adjacent (feeds V3 shadow) |
| **Stage One memory** | Claude's three-claim verification protocol (`ff353d5b`) and Codex's claim-to-evidence ledger (`411eb722`) | Model-proposed methods, not verified results |

**Consequences:**
- The brain needs its own **reasoning provider** and **evidence senses**.
- The runner stays the team's engineering and debate channel.
- Neon must be touched in **bursts**, never per tick.

## 2. Separation of the parts

```
                ┌──────────────────────── mycelium-brain (one supervised Node process on fpd-prod) ────────────────────────┐
 Mission        │  CORE (domain-free)                                                                                      │
 Control  ◄─────┤   frontier of OPENINGS ── attention policy (§3) ── action executor ── evaluator ── consolidation/sync     │
 (read-only)    │        ▲   generated from graph signals: gaps, contradictions, anomalies, stale claims, cross-branch links  │
                │        │                                                                                                 │
                │  journal: local append-only, fsync'd ops log (state survives restart) ──► Neon in bursts (knowledge+ops) │
                │  governor: budgets, thresholds, pause states, reserve for critical writes                                │
                ├──────────── capabilities (replaceable) ─────────────────────────────────────────────────────────────────────┤
                │  reason: myc-agent v6 REUSED as-is (same CLI flags, billing guard, timeouts, usage parsing), invoked with  │
                │          a brain-admitted job packet; no new CLI wrapper                                                   │
                │  sense:  FindPitches ADAPTER = fpd's fetch/parse/classify/state modules as a bounded local tool              │
                │  judge:  adapter claim model (exists / programme / open now / capacity / eligible / route), Stage One ledger│
                └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**The core knows nothing about pitches.** It manipulates openings, claims, evidence, links, stances and costs. FindPitches supplies:
- a sense (how to look);
- a judge (what counts as evidence for which claim);
- a value function (verified actionable, unique against the fpd baseline, cost).

## 3. Competing mechanisms, as falsifiable hypotheses

All three use the same openings frontier and the same memory. They differ in **how attention is allocated and how it learns**. None of them has a route list: the contexts are the words, sources and claim types that **emerge from evidence**.

**H1: frontier bandit over emergent contexts.**
- Each opening carries the contexts it was found through.
- Thompson sampling estimates the yield per context (verified, unique, cost-weighted), with forgetting.
- A diversity floor and revisit-arms keep it exploring.
- **Learning visibly changes the next choices.**
- Risk: optimising a proxy, and myopia.

**H2: spreading activation ("growth tips").**
- Yield feeds activation to linked and sibling openings. Activation decays. Old yield slowly re-activates, which drives revisits.
- This is the closest to the mycelial metaphor.
- Risk: **cycling**, already shown in E0.

**H3: model-as-planner with memory.**
- A reasoning call reads a bounded recall of the graph and freely proposes the next openings, with reasons.
- Most "open-ended".
- Risk: plausible text without measured adaptation; cost per decision; drift into repeated ideas.

**Claude's provisional leaning, weakened by §4b and not a recommendation:**
- **H3 generates** openings, since branching must not be limited to what code anticipates.
- **H1 allocates** finite attention.
- **Contradiction and stale-claim detectors** (deterministic graph queries) create revisit openings.

These three are only the mechanisms one agent thought of. The research has to stay open to mechanisms neither agent has proposed yet.

## 4. Experiment E0 (done, offline): does attention adapt?

`greenfield/mycelium/brain/experiments/e0-sim.mjs` (tests 3/3). The setup:
- A seeded hidden world of 2,080 pages in 6 hidden families.
- Noisy anchor words are the only hint.
- A **world change at mid-run**: one productive family closes, and openings **reopen on pages already seen**.
- One route (`novel`) is never named by the seeds or the fixed lexicon.
- 20 worlds, 1,500 fetches each, with paired comparison.

| Policy | Unique open per 100 fetches | Unique after change | Reopened caught | From unnamed route | Revisits |
|---|---|---|---|---|---|
| B0 fixed workflow (lexicon + FIFO, fixed revisit schedule) | 15.47 ± 0.9 | 76.6 | 0.0 | 51.0 | 3 |
| B1 bandit, **no cross-session memory** | 14.07 ± 0.9 | 70.0 | 11.9 | 69.3 | 497 |
| **H1 frontier bandit** | **15.66 ± 1.1** | **86.0** | 11.3 | **69.2** | 415 |
| H2 spreading activation (naive) | 7.50 ± 1.1 | 27.0 | 10.9 | 47.4 | **1032** |

**Paired differences** (mean ± standard error):
- **H1 − B0:** after change **+9.4 ± 2.9**; unnamed route **+18.1 ± 1.1**; reopened **+11.3 ± 0.6**; overall yield +0.19 ± 0.16 (not significant).
- **H1 − B1:** after change **+16.0 ± 2.0**; yield +1.59 ± 0.18. Cross-session memory matters.
- **H2 − B0:** yield **−8.0**. Naive activation **cycles into revisits**: 69% of fetches.

**Reading:**
- A learning allocator does not raise steady-state yield over a good hand-built crawl.
- It **does** win where the directive cares: adapting after change, finding a route nobody named, and revisiting when evidence changes.
- Memory across sessions is worth about 10% yield and +23% after change.
- The naive mycelial metaphor fails without a cost-aware revisit control. That negative result is kept.

**Limits:**
- The world, the noise and the change were designed by me.
- E0 shows mechanism behaviour, **not** real-world value.
- H3 is not simulated, because it needs real reasoning calls.

## 4b. E0-D: trying to break E0 (offline, same 20 paired worlds)

`e0-disconfirm.mjs` removes, one at a time, the assumptions I built into the E0 world. Results are paired differences, mean ± standard error.

| Variant | H1 − B0 yield /100 | H1 − B0 after change | H1 − B0 unnamed route | H1 − B0 reopened | H2 − B0 yield /100 |
|---|---|---|---|---|---|
| E0 as published | +0.19 ± 0.16 | +9.4 ± 2.9 | +18.1 ± 1.1 | +11.3 ± 0.6 | −8.0 ± 0.2 |
| No world change | +1.62 ± 0.23 | +10.7 ± 3.7 | +17.9 ± 1.5 | 0 | −8.4 ± 0.2 |
| **Weak evidence (anchors 30% informative)** | **−1.62 ± 0.15** | −0.9 ± 1.9 | +5.3 ± 1.1 | +12.6 ± 0.8 | −6.5 ± 0.2 |
| **Uninformative anchors** | **−1.45 ± 0.22** | −3.0 ± 2.1 | −0.9 ± 1.6 | +5.1 ± 0.7 | −4.9 ± 0.2 |
| **Fixed lexicon already covers the "unnamed" route** | −0.87 ± 0.21 | +8.5 ± 2.9 | **−2.3 ± 0.4** | +11.1 ± 0.6 | −9.0 ± 0.2 |
| **Short run (400 fetches)** | +2.49 ± 0.72 | +13.9 ± 2.1 | +46.8 ± 2.5 | +3.8 ± 0.5 | **+2.77 ± 1.09** |

What this does to the E0 claims:
1. **H1's advantage depends on informative cues, which I designed in.** When the evidence a policy can learn from is weak, the learning allocator does **worse** than the fixed workflow. Nobody knows yet how informative real cues are; only real data (E1) can say.
2. **The "route nobody named" win was a product of my lexicon.** Give the fixed workflow a lexicon that covers that route and the win disappears. It measured my baseline's blind spot, not discovery.
3. **The revisit win is against a strawman.** B0's fixed revisit schedule is far weaker than fpd's real watch/revisit system. Any sensible revisit rule might match H1 here.
4. **H2 is not dead.** It beats B0 on short runs and fails only once it starts cycling. That is a control problem, not proof the mechanism is wrong.
5. **What survives:** memory across sessions helps H1 in every variant (+1.4 to +1.9 per 100 fetches). Even that is only inside a world I wrote.

**Conclusion:** E0 does not support preferring H1. It supports **testing every mechanism on real data and against real baselines** (fpd's actual policy, with its watch/revisit), and building adversarial worlds Claude did not design.

## 5. Experimental programme (each stage falsifiable; each live window separately approved)

| # | Experiment | Kills the design if… | Needs |
|---|---|---|---|
| E0 ✔ | Synthetic attention adaptation (above) | — | — |
| E1 | **Replay world from real fpd data.** Run H1, H3-assisted H1 and B0 against a frozen, read-only copy of fpd's cached pages and labels, offline: `fetch` = cache lookup | H1 finds no more **unique verified** records per fetch than fpd's own policy on the same cache, or does not adapt to a held-out season | Read-only copy of the fpd export/DB from the Pi (approval: Pi read) |
| E2 | **Wondering quality (H3).** Given the graph, can model calls generate openings not in the seed or in fpd's generators, that later yield independently verified evidence? | Fewer than 1 in 5 generated openings lead anywhere a fixed search would not reach; or the ideas repeat | Model calls (window W2) |
| E3 | **P1 live loop** (§6), small budget: real fetches through fpd's senses, a real frontier, real verification | No new branch outside the seed; no measured change of choices after feedback; state lost on restart | W3: service on fpd-prod, egress allowlist, call budget |
| E4 | **Baseline comparison:** P1's verified actionable opportunities **not already in fpd's DB**, per fetch and per call, against fpd over the same days | Fewer incremental verified opportunities per unit cost than fpd, after tuning | fpd export (read-only) |
| E5 | **Fault drills:** Neon near-full or unavailable; allowance exhausted; disk pressure; kill -9 the engine | Any silent stop, lost state, false-live telemetry or retry storm | Host test window |

## 6. First meaningful prototype P1 (what the directive's §13 needs, no more)

**One process, `mycelium-brain`, on fpd-prod.** It runs as its own system user, with its own systemd unit and journal.

**Loop:**
1. Pick an opening (policy).
2. Act: sense **or** reason.
3. Evaluate, producing claims and evidence.
4. Generate openings from what changed.
5. Write to the local journal.
6. Periodically sync to Neon in a burst.

**Durable state:** every step has a deterministic id. The journal records `intent → done`, so a restart resumes. It never repeats a model call or a write: the same `derivedId` and identical-retry rules as Stage One.

**Senses:** fpd's fetcher and classifier, imported as a library on fpd-prod.
- Strict caps: fetches per hour, per-host rate, robots, size caps.
- No forms submitted, no contact, no login.

**Reasoning:** myc-agent v6, unchanged. The brain writes the admitted job packet itself, and the call ledger and allowance are enforced by the governor.

**P1 must show:**
- a branch not in the seed;
- the policy changing after feedback;
- surviving `kill -9`;
- **live telemetry**.

## 7. Mission Control (part of P1, not an add-on)

**Source of truth:** `status.json`, rebuilt every 30 s by the brain from its journal and host probes. Fields:
- state, heartbeat, uptime, pause reason;
- CPU, RAM, disk;
- investigations by state; branch lineage;
- calls, tokens and seconds against the allowance;
- Neon size as of its last burst;
- FindPitches funnel: candidates, verified actionable, unique against fpd, cost per result.

Each field carries an **`as_of`**, so stale data shows as stale.

| Access path | Proposal | Open question for Codex |
|---|---|---|
| **Chris (human)** | A static dashboard page served on fpd-prod **localhost only**, viewed through `ssh -L` from the PC. No new open port, no new credential | Is SSH forwarding acceptable day to day, or is a LAN-bound page with an auth token better? |
| **Claude / Codex / Quinn (machine)** | The only channel all three can reach today is **GitHub**. Publish a compact `mission-control/status.json` to a dedicated branch every 15 minutes, through a narrow writer: a single file, never forced, secrets regex. Claude reads it from GitHub; Codex through its GitHub connector; Quinn **to be tested**, never assumed | Commit noise against freshness; whether a separate deploy key is warranted |

**Watchdog:** independent of the brain and of Neon.
- A timer checks the heartbeat file and the systemd state.
- It alerts through the **existing mycnotify mail route**, with no new service.
- It optionally runs from the Pi or fpd-standby later.

## 8. Resource governor and memory efficiency

**Neon:**
- **Write in bursts**, at most every 30–60 minutes, plus critical flushes.
- Reads come from a local cache.
- Target **< 3 CU-h/day** for Mycelium, measured from Neon's consumption metrics if Chris approves a read-only API key; otherwise estimated from awake time.
- Storage: warn at 60% of the project's 1 GB, critical at 75%, protective stop at 85%, with a reserve held for state and recovery. The current 900 MB admission ceiling is too high: lower it to the protective threshold.

**Evidence:** keep per page:
- a URL;
- a content hash;
- the observation time;
- **one short quoted excerpt per claim**, plus structured fields.

Never keep HTML in Neon. A bounded local cache with LRU eviction holds raw pages for re-parsing. Repeated sources are deduplicated by hash.

**Metrics:** bytes per verified opportunity, and growth per day.

**Models:**
- Calls are allowed only inside an approved window, with caps per hour and per window.
- Rate-limit or auth failure → **pause**, not retry.
- API-equivalent cost is shown as telemetry, never as billing.

**Degradation order:**
1. Trim the local cache.
2. Pause reasoning.
3. Pause sensing.
4. Keep the heartbeat and status alive, explaining why.

## 9. How the team will work (using what exists)

- **Design debate and critique:** BRIX runner batches (W1 now, more later). Turns read sealed memory, including Stage One's verification work, and their contributions are stored as linked design nodes in Neon. Disagreements stay in memory as contradicting stances.
- **Engineering:** the hub as now, with Claude implementing, Codex reviewing and building alternatives, and offline tests.
- **No new collaboration framework.** The runner is not the brain.

## 10. ~~Approval requested now: W1~~ WITHDRAWN (30 Oct)

**Withdrawn.** As drafted, W1 had Codex critiquing my proposal, and its last turn forced a synthesis and a P1 decision after four calls. That anchors the research on one agent's design and manufactures consensus.

A replacement is prepared only after Codex publishes its independent findings, as part of a collaborative research programme:
- both agents develop and test their own hypotheses;
- no decision turn and no forced consensus;
- disagreements are kept in memory.

The original text is kept below for the record.

### Original W1 text (withdrawn)

Exactly the Stage One scope-2 mechanics, on the installed bridge at `13503084`:
1. **Prepare.**
   - Command: `prepare stage-two-design-1 <commit>`.
   - Writes **one seed question node**. Its body summarises this design and the E0 result, so every turn sees it.
   - Takes a READ ONLY snapshot. The search `FindPitches` also recalls Stage One's linked verification nodes, as cross-session reuse.
2. **Descriptors.** Four task files, `MYC-20261030-001`…`004`, committed **after** prepare with that exact digest. Their text is fixed in `runs/stage-two-design-1.turns.json` (§11), so only the digest is filled in.
3. **Turns.** Each turn carries memref plus one ref:
   1. **Codex**, with this document: an independent critique and a **competing design**.
   2. **Claude**, with turn 1's result: its response.
   3. **Codex**, with turn 2's result: its response.
   4. **Claude**, with turn 3's result: a synthesis, the remaining disagreements and the P1 decision.
4. **Run.** `run stage-two-design-1 <Y>`:
   - **≤ 4 calls**, 2 Codex and 2 Claude;
   - ≤ 30 minutes; no retry;
   - ≤ 4 linked contributions, then fresh verification;
   - allowance archived;
   - one database-only recovery if interrupted.

**Expected usage** (from Stage One):
- Claude: about 1.5k output tokens a turn.
- Codex: about 17k input and 0.6k output tokens a turn.
- Subscription only: Claude usage credits OFF, no API keys.

**Exact approval phrase:** "approved: Stage Two W1 design debate".
- It covers the prepare step (1 seed node) and the run.
- Codex reviews the four descriptors before the run.
- The run starts only if they match §11 apart from the digest line.

**Not requested yet** (separate, later, each with exact scope):
- **W2:** wondering-quality calls (E2).
- **Pi read access** for E1/E4.
- **W3:** the P1 service, egress allowlist and call budget.
- **Mission Control** writer, dashboard and watchdog.
- A Neon migration for operational tables, if the debate chooses Neon for ops state.
- A read-only Neon API key for metering.

## 11. W1 turn texts (withdrawn)

The manifest and turn files were removed from `greenfield/mycelium/runs/` so they cannot be prepared by mistake. They remain in history at `b1170595`.

## 12. Risks and honest unknowns

- **Neon compute:** an awake budget can be exhausted by the brain **plus** other users of the project. Mission Control must show the shared figure.
- **Proxy capture:** "verified actionable" depends on fpd's classifier. E1 and E4 must include **human-labelled samples**, as fpd already does.
- **Senses on fpd-prod:** fpd's fetcher is Python on the Pi, so importing it on fpd-prod needs Python and dependencies there, a host change. The alternative is running senses on the Pi, which touches a production-adjacent host.
- **Quinn's access:** unproven. It is designed for, and tested before it is claimed.
- **E0 bias:** I designed the world, and §4b shows how much the headline depended on that. Worlds and baselines need to come from Codex and from real fpd data.
