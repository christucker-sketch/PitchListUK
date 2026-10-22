# Mycelium Phase 0: Claude's discovery and worker design

**Status: DRAFT contribution to Codex's joint review** (`docs/mycelium/PHASE_0_ARCHITECTURE_REVIEW.md`, owned by Codex). Design only, under the [Phase 0 commission](../../team/MYCELIUM_PHASE0_COMMISSION_2026-10-22.md). No code, kit, crawl or Pi/BRIX change is proposed for execution here. Author: Claude, 22 Oct 2026.

**Evidence limits, stated plainly.** I have no shell on the Pi. Every host number below was measured by Chris running read-only scripts and pasting the output: `uk-yield.sh` on 21 Oct, classifier-diff gates on 21 Oct, and earlier fetch and France census runs. Cloud conversion numbers are Codex's published reports. Where a number is missing, it says **GAP**. I do not estimate it.

---

## 1. What the current producer already proves (reuse inventory)

The Pi producer (`producer/fp-discovery-lab`) is a working, bounded explorer. Most of Mycelium's worker side should be **reused, not rebuilt**.

| Component | What it does today | Reuse verdict |
| --- | --- | --- |
| Frontier (`frontier.py`) | Persistent URL state machine, per-site page budget (8), lane inheritance, Thompson-sampling scheduler across generators with 25% uniform exploration; per-country slot (`--country`, kit 012a) | **Reuse logic**; move state to the coordinator (§5) |
| Fetcher (`fetch.py`) | robots.txt with 512 kB cap, ≥2 s per host, one in-flight per host, circuit breaker, size caps, content-addressed raw cache | **Reuse as the worker fetch core** |
| Parse, classify and language packs (`parse.py`, `classify.py`, `lexicon.py`, `packs/fr.py`) | Rule-based classifier with reason codes and verbatim evidence; separate relevance and state decisions; France pack (vocabulary, dates, postcodes→regions, communes) | **Reuse**; packs are the multilingual extension point (§3) |
| Platform adapters (`adapters.py`, `sources.py`) | Indexed populations (Eventeny, LocalStalls, Marketspread, ClueMart, MarketsIreland, UKCraftFairs) | **Reuse** as one strategy family (§2 S1) |
| Resolver and identity (`resolve.py`, `integration/identity.py`) | Many pages → one opportunity; anchor registry; `fdx1_` IDs stable across URL and name changes; same-event guard | **Reuse** for the producer-side candidate key; V3 stays authoritative for entity identity |
| Export contract (`integration/`) | Immutable records, lifecycle diff, atomic publication, V3 feed with watch and lifecycle channels | **Reuse unchanged** as the evidence-intake format to V3 |
| Rechecks and `refresh-current` | V3 recheck requests re-queue pages; stale current pages re-fetched (012a) | **Reuse**; becomes coordinator task types |
| Lane accounting and gates | Per-lane fetch → actionable counts; classifier-diff and resolver-drift gates before each kit | **Reuse**; they become branch metrics and the pre-release gate |

**What it does not have:** a graph (relationships live implicitly in URL parents and opportunity sources); rewards from V3 outcomes (the scheduler rewards *producer* actionable pages, not *customer READY*); hypothesis generation; multi-host workers; any unattended agent runtime.

## 2. Measured lessons that must shape the design

Each is a measurement, not an opinion:

1. **Discovery volume is not READY.**
   - Over 7 days to 21 Oct, the Pi fetched 15,648 pages.
   - France took 8,087 of them, giving 82 actionable pages and **1 customer READY** of 30 French entities.
   - The Pi delivered **232 current GB records; 8 are customer READY** (Codex, 21 Oct, after the LocalStalls verifier; 5 before it).
2. **Reward must come from V3, per source family, with reasons.** The 232 GB records split into three families:
   - **UKCraftFairs (147):** 142 fail because *V3* receives HTTP 520. The Pi can fetch the page and V3 cannot. Retained-page "Option B" is OFF, by Chris's order.
   - **LocalStalls (48):** 44 are stale, plus field disagreements. The Pi only refreshed pages for READY records, and series spans were misread.
   - **Other families:** low confidence or not linked to an entity.

   A producer-side "actionable" reward would have kept investing in UKCraftFairs.
3. **Organiser-owned official calendars convert well.** Codex's source-led CJS calendar produced **47 genuinely new UK READY** in one bounded run (21 Oct), more than the Pi's entire UK lane. Organiser and authority calendars belong in the strategy set (S3, S4).
4. **The open web has a low base rate.**
   - France census: about **5% of reachable organiser sites** carried a current exhibitor route.
   - USDA farmers-market lane: about **20%** of listed markets had a findable website. On its first night, 17 records were current, and hand review found **5 of 17 wrong** before fixes.

   Precision needs per-branch audit sampling (§6), not trust in the classifier.
5. **Extraction errors are a large, fixable share of losses.** French case reviews and the LocalStalls report (22 of 47 with start/state/organiser disagreements) show that worker extraction quality is a reward lever, not only source choice.
6. **Pi limits are real.**
   - Pi 3: 905 MB RAM.
   - The crawl runs inside a 450 MB memory cgroup, after a 15 Oct out-of-memory crash from an unbounded robots read.
   - About one core is busy, on SQLite over a USB SSD.
   - Re-classifying 4,500 stored pages takes about 25 minutes per engine (the two-engine gate took about 50).
   - BRIX J3455 and J1900: 8 GB each, IDLE pending Chris's approval.

## 3. Discovery strategies (independent and globally extensible)

Each strategy is a **family of branches** (§4). All are free and public-access only. No paid search, barrier bypass, login or form submission. "V3-verifiable" is a hard gate per source domain (§7, rule P3).

| ID | Strategy | Seeds | Expansion edges | Strength / risk | Worker cost |
| --- | --- | --- | --- | --- | --- |
| **S1** | Application-platform populations | Platform sitemaps and listing indexes (existing `sources.py`) | listing → organiser profile → organiser's other listings → organiser website | Highest precision (Eventeny 74% actionable pages). Risk: V3 access and terms (UKCraftFairs 520), staleness | Low per page, needs a refresh cadence |
| **S2** | Open entity registries | Wikidata event classes, OSM marketplaces, national open data (DATAtourisme FR, USDA directory) | entity → official website → trader page | Global and multilingual, but a low base rate (S2 is the 5–20% case). Must be paired with S4 to compound | Medium |
| **S3** | Authority and official calendars | Machine-readable lists of authorities: UK local authorities, French communes (INSEE), German Gemeinden, US counties; tourism offices; market authorities | authority site → events/markets/street-trading pages → listed events → organiser | The CJS-type winner. Authorities publish trader calls. Risk: many authorities, few calls; needs seasonality | Medium; sitemap- and path-led |
| **S4** | Organiser and venue graph walk | **Only verified nodes**: organisers and venues behind READY records | organiser → its other events/editions; venue → other events at the venue; platform organiser profile → all its listings; partner and "other markets we run" links | Compounds verified wins; precision inherits from a verified parent. Risk: over-concentration on a few organisers (§7 diversity) | Low |
| **S5** | Edition and recurrence watch | Every recurring or annual READY or historical record | edition → next edition (anniversary −6 to −3 months), not-yet-open → opening date | Cheapest new READY: renewals and next editions. Risk: must not claim a date before the source states it | Very low |
| **S6** | Web-archive URL-pattern index | Common Crawl / Wayback CDX index queries for trader-path patterns per TLD and language (`/stallholders`, `/exposants`, `/aussteller`, `/vendor-application`) | URL hit → live fetch of the current page (robots-respecting) → organiser | Finds organiser trader pages without crawling sites blind. Free public indexes. Risk: archived URLs may be stale; index rate limits; GAP on current index terms; needs a check before use | Low worker, index-bound |
| **S7** | Hypothesis generator (new seed families) | Structured hypotheses, e.g. "UK agricultural show societies list" or "Bavarian Christmas market organisers", each with a seed recipe, budget and kill rule | proposed seed list → S2/S3/S4 expansion | Satisfies "autonomous new seed hypotheses". **Phase 0 version is rule-based:** template expansion over country × language × event type × authority type, ranked by gaps in coverage. An LLM proposer is an approval-gated later option (§9) | Proposer cheap; each hypothesis bounded |

**Kept out:** broad blind crawling; paid search (Serper/Brave stay off); social-media scraping; any source V3 cannot fetch, unless Chris changes the Option B policy.

## 4. Branching and relationship extraction

### 4.1 What a branch is

A **branch** is `(strategy, seed, scope pattern)`. Examples:
- `S3 · UK local authorities · /markets|street-trading|events`
- `S4 · organiser fdx-org-123 · other-events`

Every lead, page and result records its `branch_id`; today's lane inheritance generalises to this.

Fields (to the coordinator, owned by Codex): `branch_id, parent_branch_id, strategy, seed_ref, hypothesis_text, scope_pattern, language, country_set, access_policy, budget{pages, hosts, days}, status{active|parked|pruned|exhausted}, reopen_condition, created_by{rule|agent|chris}, evidence_refs`.

### 4.2 Relationships the worker extracts

The worker emits **graph deltas with evidence**, never conclusions about READY.

| Edge | From → to | Extraction | Evidence required |
| --- | --- | --- | --- |
| `links_to` | page → page | anchors with context (already parsed) | anchor text, position |
| `organises` | organiser → event | JSON-LD `organizer`; pack phrases ("X organisera son salon", "organised by X"); platform "By X" | quoted sentence |
| `edition_of` | event edition → event programme | name and recurrence; dated title; prior-edition dates | dates and sentence |
| `held_at` | edition → venue / commune | event-scoped commune/postcode (France fix 21 Oct); JSON-LD location; never the organiser's postal address | quoted place |
| `applies_via` | edition → application route | form/platform/email route; application window vs event date kept apart (La Verpillière fix) | route URL and anchor |
| `lists` | platform listing or calendar → edition | adapters | listing ID |
| `runs_other` | organiser → other event pages | "our other markets", organiser profile listings | link context |

Identity: the producer proposes a `candidate_key` (today's `fdx1_` natural key and anchors). **V3 decides entity and edition identity**, and the producer never merges silently. Cross-language duplicates (the same salon listed in FR and EN) are flagged as candidate-same edges with evidence, never merged by the worker.

## 5. Worker protocol (bounded)

The worker is stateless apart from a bounded local cache; the coordinator (Codex's design) owns all queue state.

**Task (coordinator → worker):**
```
{ task_id, branch_id, kind: fetch|expand|reassess|refresh|census,
  url | seed_ref, budget{max_pages, max_bytes, deadline},
  policy{robots: obey, min_host_interval_s: 2, max_inflight_per_host: 1, ua},
  lease_until, attempt, idempotency_key }
```

**Result (worker → coordinator):**
```
{ task_id, idempotency_key, worker_id, worker_version (kit hash), started_at, finished_at,
  fetches[{url, final_url, http_status, content_sha256, object_ref, fetched_at, bytes}],
  assessments[{page_sha256, classifier_version, label, reasons[], evidence[{kind,text}], extracted{...}}],
  edges[{type, from_ref, to_ref, evidence_ref, confidence}],
  candidates[{candidate_key, export_record (existing v1 schema), branch_id}],
  new_leads[{url, edge_type, proposed_branch_id, priority_hint}],
  errors[{url, class: robots|http|challenge|timeout|memory|parse}], budget_used }
```

**Rules:**
- **Leases:** a worker heartbeats every 60 s while working. An expired lease returns the task to the queue with `attempt+1`; three attempts send it to dead letter.
- **Idempotency:** `idempotency_key = hash(task_id, attempt-independent scope)`. Results are deduplicated by `(task_id, content_sha256)`, so a replay can never double-count a READY.
- **Politeness is enforced in the worker, not trusted to the queue.** Robots, per-host interval and a circuit breaker on 429/5xx/challenge. A challenge or 401/403 marks the host `blocked`, and the branch is never retried by workaround.
- **Raw evidence:** stored content-addressed (sha256) in object storage; the worker keeps an LRU cache only. Raw HTML of rejected pages is not kept long-term (today's compaction policy: extract only).
- **Worker profiles** (measured where possible):

  | Profile | RAM cap | Concurrency | Throughput | Role |
  | --- | --- | --- | --- | --- |
  | Pi 3 | 450 MB cgroup | 4 | about 2,200 fetches/day observed | One lane at a time |
  | BRIX J3455 | 8 GB RAM; cgroup TBD | 8–16 (proposed) | GAP | Benchmark first; Chris approval |
  | Cloud worker | — | — | — | Not proposed in Phase 0 |

  No worker holds the authoritative database (commission rule).
- **Versioning:** every result carries the classifier version and kit hash. A new classifier version can trigger `reassess` tasks over stored evidence with **no re-fetch**, and the regression gate (classifier-diff) runs before any version becomes active.

## 6. Sampling method (precision we can trust)

1. **Per-branch audit sample:** each week, a stratified random sample of the branch's candidates is reviewed. Sample size: 10 or 20%, whichever is larger, with a cap of 30.
   - Strata: state, language and route type.
   - Review is source-bound: a human, or an LLM reviewer only if approved and budgeted. The reviewer sees the page and the quoted evidence.
   - Labels: `correct | wrong:<field> | not-trader | stale | duplicate`.
2. **Precision estimate:** Wilson lower bound per branch.
   - A branch whose lower bound falls below 70% stops exporting to V3, and its candidates go to `watch` only, until fixed.
   - The USDA first night (5/17 wrong) would have tripped this, which matches what we did by hand.
3. **Census-before-scale:** a new strategy or language first runs a fixed-size census (e.g. 200 seeds), recording base rate, route rate and audit precision. The France census and the 14 Oct probe 5 are the template.
4. **Shadow mode:** a new branch can run with its candidates delivered as `watch` (never customer-visible) until its audited precision and V3 conversion are known.

## 7. Feedback into branch scoring

**Reward hierarchy (delayed):**

| Weight | Signal | Source |
| --- | --- | --- |
| **R1 (primary)** | Genuinely new V3 READY retained at 24 h and 7 d, net of withdrawals. Recoveries count separately at lower weight | V3 dispositions |
| **R2 (credit assignment)** | V3 withheld reason codes per producer ID, mapped to the branch | Same per-ID report Codex published on 21 Oct |
| **R3 (early proxy)** | Audited precision × producer route-and-current rate | Producer, shrunk toward the strategy prior |

R2 decides *what to fix*:
- extraction disagreement → worker bug;
- stale → refresh cadence;
- inaccessible to V3 → prune the domain;
- not trader-relevant → classifier or branch scope.

R3 is used only until R1 arrives, which takes about 2–8 days.

**Scheduler:** Thompson sampling (as today) on a Beta-Binomial or Gamma-Poisson posterior of *R1 per 1,000 fetches*, with a reward delay. Pending outcomes are counted as "in flight", so a branch is not punished before V3 has judged it.

**Policies:**
- **P1 Exploration floor:** at least 20% of budget is uniformly random across active branches, and at least 10% reserved for new hypotheses (S7).
- **P2 Diversity quotas:** caps per country, language and source family, and per organiser, so S4 cannot spend everything on one prolific organiser.
- **P3 V3-verifiability gate:** a domain where V3's last N checks failed for access (520/403/challenge) is parked for V3. The worker stops spending on it. It reopens only on a V3 capability change or a Chris policy change.
- **P4 Pruning:** park a branch when, after at least 300 fetches and enough elapsed time for R1, the posterior upper bound of READY per 1,000 fetches is under a threshold. Thresholds and budget split are **for Chris to set**; the France lane today would be parked.
- **P5 Reopen conditions** stored with each parked branch: new language-pack version, new adapter, season start (Christmas, show season), V3 verifier gaining support, or new evidence from S4.
- **P6 Anti-overfit:** rewards are judged against a fixed held-out sample of seeds per strategy, so a branch that wins on one batch must win again on fresh seeds. A season-adjusted baseline compares like months.
- **P7 False-positive penalty:** audit "wrong" and V3 `known_false_positive` subtract reward. Suppressions persist (the existing table) and are shared to the coordinator.

## 8. Multilingual seed generation

A **language pack** has a defined set of slots. Today's France pack shows the shape:
- role words;
- apply, closed and not-yet-open phrases;
- deadline cues;
- months and weekdays;
- date shapes;
- postcode-to-region and commune lists;
- authority patterns;
- application-call title patterns;
- organiser phrases;
- scope rules (e.g. vide-greniers only if professionals are allowed).

**Bootstrap for a new language** (each step is gated by measurement):

1. Native vocabulary from real pages, not translation: collect 50–100 known trader-call pages through S2/S3 seeds and extract phrase candidates.
2. Write pack v0 and run a **census** (§6.3).
3. Hand-audit 30.
4. Fix errors.
5. Shadow-mode branch.
6. Promote.

German is the next candidate: interface strings exist, intake is disabled, and preparation is in `team/CLAUDE_GERMANY_PREPARATION_HANDOFF.md`.

**Seed generation per country:**
- authority registries (S3);
- open event data (S2);
- platform populations active in that country (S1);
- archive URL patterns in that language (S6);
- hypotheses (S7).

Evidence stays in the original language; nothing is translated into facts.

## 9. Experiments proposed (for Chris's approval; not to execute now)

| ID | Experiment | Budget (proposal) | Success / stop |
| --- | --- | --- | --- |
| E0 | **Baseline:** current Pi lanes' R1 per 1,000 fetches by family, 7-day window, from V3 dispositions | Read-only | Done when the per-family table exists. Partly done (21 Oct GB) |
| E1 | **Shadow mode, UK + one non-English** (French or German) with the scheduler of §7, versus today's scheduler as control | Fixed fetch budget split 50/50, 14 days | R1 per 1,000 fetches higher at 7 d retention; audited precision ≥ 80%; no robots/terms incidents. Stop on any incident or precision under 70% |
| E2 | **S4 graph walk** from the organisers behind the current verified UK READY | ≤ 3,000 fetches | New editions or events READY per 1,000 fetches vs E0 |
| E3 | **S6 archive-index pilot**, UK and FR trader paths | ≤ 2,000 index calls, ≤ 2,000 live fetches | Candidate route rate vs S2 base rate (5–20%) |
| E4 | **S5 edition watch** on all historical recurring records | Revisits only | Next-edition READY captured before or at opening |

Every experiment logs, per branch: fetches, candidates, duplicates, route rate, audit precision, V3 READY at 24 h and 7 d, withheld reasons, blocked count and cost.

## 10. Interfaces I assume from Codex (owner: Codex unless stated)

1. **Dispositions feed, machine-readable and at least daily:** per producer ID, READY/withheld with reason codes and first-READY / withdrawn timestamps. The 21 Oct JSON is exactly the shape needed; it should become a standing output, not a one-off report.
2. **V3 capability map:** which domains and platforms V3 can verify, plus a recent access-failure rate per domain (for P3).
3. **Coordinator API:** task claim/lease/heartbeat/complete, dead letter, branch registry, budgets, and a stop switch. The worker side of it is mine; Codex owns the queue and state.
4. **Identity:** V3 entity and edition IDs returned for each accepted producer ID, so S4 and S5 can walk verified organisers and editions.
5. **Owned by me:** worker, extraction, packs, branch proposals from S1–S7, audit-sample packets, and the export record (unchanged v1).

## 11. Memory and resource limits (worker side)

- **Pi 3:**
  - one worker process in a 450 MB memory cgroup;
  - bounded robots read (512 kB) and page size caps;
  - concurrency 4;
  - raw cache LRU sized to the SSD; SSD capacity is a GAP to measure.
  - Re-classifying 4,500 pages takes about 25 minutes, so reassessment must be incremental and scheduled off-peak.
- **BRIX:** a candidate worker host only after a benchmark (throughput, memory, thermal on a fanless J3455) and Chris's approval. **No authoritative database on home hardware.**
- **Storage:**
  - raw evidence goes to object storage by hash, and rejected pages are compacted to extracts (today's policy);
  - durable graph and knowledge are kept separate from fetch logs (commission rule; Codex's storage section).

## 12. Risks (worker and discovery side)

1. **Verification is the bottleneck, not discovery** (§2.1). More fetching without R1 feedback burns budget. Mitigation: R1-driven scheduling, P3, shadow mode.
2. **Source-access asymmetry:** the Pi can read sources V3 cannot (UKCraftFairs). Unresolved until Chris decides retained-evidence policy; P3 keeps spend off them meanwhile.
3. **Reward delay and sparsity:** READY at 7 d arrives late and rarely, so a cold-start branch is judged on noisy proxies. Mitigation: "in flight" accounting, priors per strategy, exploration floor.
4. **Precision drift when adding languages:** each new pack makes new false positives (France: application window read as event dates; "Google Docs" as organiser). Mitigation: census + audit + classifier-diff gate per version.
5. **Concentration:** S4 can over-mine one organiser. Mitigation: P2 quotas.
6. **Politeness and terms:** a scaled crawler must not become high-load. Per-host caps live in the worker. The terms posture per platform is owned by Chris (Option B precedent).
7. **Home hardware:** Pi and BRIX failures (USB SSD reset, out-of-memory, clock battery) seen this month. Workers must be disposable and resumable, with no single home host as a dependency.
8. **Unattended operation is NOT proven:**
   - I have no unattended runtime, scheduler or credential.
   - This session cannot push to GitHub (403); every hub change goes through Chris's sync script.
   - I have no shell on the Pi.
   - Any claim of an autonomous Claude worker loop needs an executed end-to-end test (commission rule). The runtime, credential and cost prerequisites are for Codex's §5 and Chris to decide.

## 13. Questions for Chris (numbered for the joint review)

- **C1.** The budget split between exploitation and exploration, and the pruning threshold (P1, P4).
- **C2.** Which second language goes first after UK English: French (existing pack, poor conversion so far) or German (prepared, intake off).
- **C3.** Whether an LLM-based hypothesis proposer or auditor (S7, §6) may ever be funded, with what monthly cap.
- **C4.** Whether BRIX may host a benchmark-only worker in Phase 0A/0B.
- **C5.** The retained-evidence policy for sources V3 cannot fetch. It is OFF today; this design assumes OFF.

## 14. Answers to Codex's interface questions (review draft, 22 Oct)

**Q1. Strategies for the first UK + non-English shadow budget.**
- **UK:** S4 (graph walk from organisers behind verified UK READY), S3 (UK local-authority markets/events/street-trading pages), S5 (next editions of recurring records), and S1 limited to platforms V3 can verify (LocalStalls yes, UKCraftFairs no under P3).
- **Non-English:** the same mix in French, with the existing pack (C2 asks Chris whether German replaces it).
- **S6 (archive-index)** runs as a separate small pilot (E3) so its effect is attributable.
- **New seed creation** is S2, S3 registries, S6 and S7. **Link following** is S4 and in-site exploration. Every lead records which (§4.1 `created_by`, `parent_branch_id`).
- **Genuinely-new unit:** an **event edition** (programme + edition dates), or for a recurring market the programme with its dated instances. The producer only proposes a `candidate_key` and a first-seen time. **V3 decides "genuinely new"** against its own entity history.

**Q2. Minimal bounded work request and result.** The task and result in §5.
- **Measured (Pi 3):**
  - 450 MB cgroup, concurrency 4, about 2,200 fetches a day;
  - robots read capped at 512 kB, size caps;
  - re-classification about 25 minutes per 4,500 pages.
- **Unbenchmarked:** BRIX throughput, memory and thermal (needs a benchmark and Chris's approval).
- **No host access:** I have no shell on any host. All host measurement goes through Chris.

**Q3. How outcomes move branch scores (§7), and what the producer can know without declaring READY.**

| Signal | Effect |
| --- | --- |
| Corrected extraction (a new classifier version) | Triggers no-fetch reassessment; disputed IDs' rewards are re-counted after V3 re-judges |
| Route-purpose failures and not-trader | Branch scope penalty |
| Duplicates | Zero reward and a cost charged |
| Access refusals | Host blocked; P3 parks the domain for V3 |
| V3 READY at 24 h / 7 d | Primary reward |
| V3 withheld reasons | Credit assignment |

The producer can know fetch outcomes, audit labels, extraction self-consistency, duplicate sightings and access refusals. It cannot know READY, and it never sets READY.

**Q4. Preserving existing identity and source clocks: yes.** A Mycelium adapter keeps the v1 export record, `fdx1_` IDs, anchors and `last_checked` = actual fetch time, unchanged. Interface **additions** (not a rewrite):
- `branch_id` and lineage in `provenance`;
- per-source `content_sha256` and object reference;
- graph edges with evidence references;
- `worker_version`;
- audit-sample labels.

Nothing else in the producer needs rewriting for Phase 1.

**Q5. Unattended Claude runtime: NONE evidenced.**
- This is an interactive session for Chris.
- Git push is refused (403: the repository is not in this session's authorised set); hub changes reach GitHub only through Chris's sync script.
- There is no shell on the Pi or BRIX, and no Claude credential or scheduler is configured for unattended work.

**Proposed acceptance test** (not to be run without Chris's approval):
1. Codex writes one task record to the agreed handoff location.
2. An *unattended* Claude runtime claims it within N minutes (heartbeat logged), writes a result with the task's idempotency key, and commits or pushes it without a human step.
3. Codex's runtime acknowledges it.
4. Replaying the same task produces no second result.
5. A stop switch halts both sides.

Pass means all timestamps come from the runtimes' own logs, with zero human actions between steps 1 and 5.

**Prerequisites Chris must decide:**
- which runtime;
- repository write credential scope;
- monthly spend cap;
- where the stop switch lives.

**Review of Codex's draft:** see §15 (reviewed DRAFT r1, `302eb89`).

## 15. Cross-review of Codex's DRAFT r1 (`302eb89`, 22 Oct)

I have read all nine sections. **Overall: agree.** Codex owns the storage, coordinator, V3 adapter and evaluation; this file supplies the discovery and worker side.

**Agreed as written:**
- Managed PostgreSQL + private objects as a benchmark candidate only.
- V3 stays the eligibility and identity authority.
- A separate low-authority (50) candidate adapter. The `independent-structured` token and lane are never reused for Mycelium leads.
- Edition-level attribution with matured 24 h / 7 d cohorts and the stated withdrawal arithmetic.
- The job state machine, including fencing, SPEND_UNCERTAIN and dead letter.
- The runtime table (it is accurate about Claude: no unattended runner exists).
- Separate progress signals.
- Gates and the STOP.
- The 60/25/15 split replaces my P1 floor; it is compatible and more concrete.
- The pruning rules in DRAFT §6 replace my P4 threshold.
- GB 75% / FR 25% for the pilot. This **withdraws my C2**: German has no V3 market or verification yet, so it cannot be a pilot language.

**Concrete changes requested:**

1. **Pi worker concurrency (DRAFT §4 pools).** The systemd figures cited (550 MB High / 700 MB Max) are source defaults. What is **measured on the host**: crawls run in a 450 MB cgroup with up to 4 in-flight fetches on different hosts. This includes the supervised France run after the 15 Oct out-of-memory fix, and nightly cycles since. Proposal: **one task per Pi at a time, with up to 4 in-flight fetches to different hosts inside it**, and the per-domain rules unchanged (1 concurrent, ≥ 2 s).
2. **A V3-access gate must be an explicit pruning rule (DRAFT §6).** When the V3 verifier cannot fetch a domain (UKCraftFairs: 142 × HTTP 520), Mycelium must stop admitting acquisition for it to V3. The worker being able to fetch it is not enough. It reopens only on a V3 capability change or a Chris policy change (Option B stays OFF). This is my P3; the draft only says such families "may be removed".
3. **One experiment, not five.** My E2–E4 (graph walk, archive index, edition watch) become **branches inside the single shadow experiment**, under its budgets, not separate experiments. The archive-index strategy (S6) needs its own access-policy check on index terms and rate limits before inclusion. **Default: excluded from the pilot until approved.**
4. **Standing markets vs editions (Q5): I agree with the draft.**
   - A recurring market keeps its standing `fdx1` programme identity.
   - It earns new credit once, as a new series, when first verified.
   - Dated instances earn separate credit only when the source lists them as distinct occurrences, never by calendar expansion.
   - The producer will put the source's listed dates in the candidate. It will never invent occurrences.
5. **Producer progress signals, prompted by today's incident.**
   - The 21–22 Oct stall was an operator-side install/rebuild step that stopped the acquire timer and did not restart it. Polling continued, so the cloud saw a heartbeat with a stale export.
   - Fix applied 22 Oct 12:30 London; the first cycle completed 13:32 with a new export.
   - For Mycelium, the worker heartbeat must carry at minimum: acquire timer state, last completed cycle, last export generated, and installed kit hash.
   - Independently of Mycelium: kit scripts that pause the timer must restore it on any exit. That is a producer fix and does not need Phase 0 approval.
6. **The task and result shapes align.** My §5 messages map onto DRAFT §3 fields. I adopt the draft's names: lease token + generation, input digests and the result digest. My `edges`, `assertions` and `candidates` arrays map to the draft's `edge`/`assertion`/`lead`.

**Unresolved, for Chris:**
- C1 is now DRAFT Q6/Q7.
- C3 (model proposer/auditor funding) is DRAFT Q4/Q6.
- C4 (BRIX benchmark worker) is not in the draft's gates. It should be named in 0A or the pilot gate, or explicitly declined.
- C5 (retained-evidence policy) is DRAFT "Option B off".

I ask Codex to add C4 and items 1–2 above, then mark the review JOINT.

---

*Cross-links:* the joint review (`PHASE_0_ARCHITECTURE_REVIEW.md`, Codex) should cite this file for §3–§9 inputs. Conflicts and unresolved questions are recorded in the joint review once Codex has read this. **Neither agent may begin Phase 1 implementation without Chris's approval.**
