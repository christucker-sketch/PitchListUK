# E0 and Claude's opening brain proposal — independent Codex investigation
30 October2026. Reviewed `b1170595f9093783a334601afff8e70c4a258476`.

**Conclusion:** E0 reproduces as reported, but does not demonstrate intelligent discovery, cross-branch reasoning or durable learning. It is a useful exploratory test of crawl allocation on a designed graph, with a hidden-observation leak and an incorrect probability sampler. Narrow corrections weaken the20-seed after-change result, although it remains positive on40 additional seeds; the “unnamed route” advantage reverses when its engineered word signal is removed. Do not use it to select the proposed H3+H1 brain.

This is not an argument against all synthetic worlds or all bandits. A hidden, predefined evaluator world is legitimate. The problem is the mismatch between what is varied/measured and the larger inference being made. My [independent competing architectures](stage-two-architecture-codex-v0.md) go beyond fixing this simulator.

## What I independently ran

- Original `e0-sim.test.mjs`: **3/3 PASS**.
- Original E0: **20 worlds, seeds1001–1020, budget1500**; reproduced all reported means/differences.
- Six diagnostic scenarios using the same generated worlds, adding nonlearning controls; code and per-world results published under `brain/experiments/codex-e0-audit*`.
- Observation-boundary counterexample and Monte Carlo check of the actual Beta sampler.
- Separate held-out-seed replication is recorded in the accompanying results artifact.
- All execution local/offline, zero model/network/BRIX/Neon operations. Claude's source is preserved unchanged.

Original E0 source SHA256: `b6fc0fd72ee88726a4f1352f9a67df2845c1837ae425a66c6434ca6b66a22ed4`.

## 1. What the fictional world makes easy

At `e0-sim.mjs:18–24`, the author defines six families, their sizes, probabilities, outdegrees, destinations and vocabularies. The 150-page “novel” family has opportunity probability **0.5**, higher than organisers0.15, councils0.25 and noise0.005. Eighty percent of its links stay inside that family. Organisers/councils have explicit bridges into it.

At line38, **70% of anchors use the target family's vocabulary**. Thus words function as strong latent-class proxies. The baseline lexicon (line55) knows organiser/platform terms but omits the novel and council vocabulary. Platform probability0.6 is reduced by randomly discarding30% as duplicates and then **all platforms close halfway through**. That is a designed disadvantage for the lexicon that favours them.

There is a legitimate question here: can a reward-learning allocator exploit unfamiliar anchor words better than this particular frozen keyword priority? E0 supports a conditional answer. It does not show invention of a new discovery mechanism or finding something outside the world's supplied graph and concepts.

“Novelty” at line125 means **evaluator family == novel**. There is no semantic novelty test, no inferred new relation, no criterion for surprise relative to prior knowledge, no generated experiment, and no changed representation. Each policy can only return a page ID. Routes not named in the seed can still be followed by ordinary crawling. A random crawl finds48.90 novel-family opportunities, versus H1's69.15 and B0's51.05.

## 2. Hidden future-opportunity eligibility leaks into decisions

At line127:

```js
if (p.opp && !yielded.includes(id)) yielded.push(id);
```

The declared observation is open/not-open plus outlinks. But `p.opp` also exists for council opportunities that are **not open until the future midpoint**. Those pages enter the policy's `yielded` revisit list; otherwise observationally identical permanently empty pages do not.

I tested two one-page worlds with identical links/anchor and false current-open signals. Before the future opening, the policy receives different revisit eligibility. The existing “no family label” test checks object keys and misses this information leak.

If closed pages are intended to disclose a real dormant programme, that must be an explicit **observed, possibly noisy** field—not a latent truth object that knows the future. Two useful repairs differ:
- allow revisits only after an observed open signal;
- allow **all observed pages** to be revisited, with policy/evidence-based priority.

The first removes reopened detections entirely in this simulator because its policy cannot add initially closed pages. The second permits realistic investigation of negative observations without the oracle shortlist; H1 then loses total yield to B0.

Also, these are initially-closed → open opportunities, not an observed open → closed → reopened lifecycle. Page state/link changes are not discovered on revisit (`links = revisit ? [] : p.links`, line128). The experiment cannot test discovery of a changed application route.

## 3. Quantitative ablations

Each row is **H1 minus B0**, paired over the same20 worlds. Yield is unique opportunities per100fetches; other columns are counts. Original effect estimates are reproduced, not disputed.

| Scenario | Yield difference | After-change difference | “Novel-family” difference | Reopened difference |
|---|---:|---:|---:|---:|
| Original | +0.19 | +9.35 | +18.10 | +11.25 |
| Revisit eligibility only from observed open | −0.01 | +3.55 | +18.80 | 0.00 |
| All observed pages eligible for revisits | −0.99 | +4.55 | +17.25 | +4.50 |
| Correct Gamma/Beta sampling | +0.10 | +4.85 | +18.30 | +10.15 |
| Anchors independent of target family | **−2.43** | **−13.40** | **−6.65** | +5.75 |
| No artificial mid-run opening/closure | −0.27 | +2.45 | +17.65 | 0.00 |

Approximate95% paired Student-t intervals:
- original after-change: **[3.37,15.33]**;
- observed-open-only after-change: **[−1.84,8.94]**;
- all-observed yield: **[−1.46,−0.52]**;
- corrected-sampler after-change: **[−1.09,10.79]**;
- neutral-anchor novel-family difference: **[−10.24,−3.06]**.

Neutral anchors preserve graph, opportunity probabilities and time changes, replacing link text with target-independent random words. This is an adversarial sensitivity test, **not a claim that real web anchors contain no information**. It establishes that the reported novelty advantage relies on that particular lexical signal and does not transfer automatically to other discovery problems.

A nonlearning uniform random crawl finds **91.80 after-change opportunities**, versus H1's85.95 and B0's76.60. Its total yield is worse (12.52/100 versus15.66/100). This is not a universal winner; it falsifies the claim that the after-change count by itself establishes learned adaptation. That metric also rewards deferring opportunities until later rather than detecting change quickly.

A random policy with about28% revisits is included as a diagnostic control, not a fully fair tuned baseline: the rate was chosen from the published H1 revisit frequency. It does not beat H1. Simple controls should challenge proposed explanations, not be selectively reported only when they win.

I also built a delayed-reward chain counterworld. It **failed to separate final discoveries**: fixed, H1 and random all found172. H1/random wasted103 revisits while fixed used none. That counterworld does not validate my alternative architecture or establish a general delayed-reward theorem. I retain this negative result rather than advertise an unsuccessful toy as evidence.

### Additional seeds: evidence against overstating my critique

After fixing the diagnostics (without tuning the policies), I ran **40 new world seeds2001–2040**. These are held-out seeds from the **same generator**, not held-out structural worlds.

| H1−B0 scenario | Yield/100 | After-change finds | Novel-family finds |
|---|---:|---:|---:|
| Original | +0.55 | +14.83 | +18.38 |
| Observed-open-only eligibility | +0.30 | +8.43 | +19.55 |
| All observed pages revisitable | −0.70 | +10.40 | +17.50 |
| Correct Beta sampler | +0.38 | +11.70 | +18.70 |
| Neutral anchors | **−2.64** | **−13.23** | **−5.75** |

Corrected-sampler after-change95% interval is **[6.79,16.61]** here; observed-open-only is **[4.41,12.44]**. Therefore **it would be wrong to conclude that the flaws explain all of H1's after-change gains**. The implementation has conditional allocation value in this generator. The robust sensitivity findings are the neutral-anchor reversal and the all-observed total-yield loss (95% interval **[−1.09,−0.30]**). I do not choose only the seed set that favours my argument.

## 4. H1 is not the claimed Thompson sampler

Line70 generates Gamma samples by adding exponential variables in `for (i=0; i<k; i++)`. That is a Gamma sampler for integer shape; after forgetting, shape is fractional and this loop effectively rounds it upward. Independent `min(a,30)` and `min(b,30)` clipping also changes the posterior ratio.

40,000 draws from the actual implementation:
- parameters45,10: true Beta mean0.81818, measured **0.75067**;
- parameters1.2,2.2: true mean0.35294, measured **0.39890**.

The diagnostic replacement uses a Gamma sampler supporting real shapes and no independent shape clipping. With that single correction, the20-world after-change mean advantage falls to4.85 and its descriptive interval includes zero. Random-number consumption changes too; worlds remain paired, but paths do not use coupled random streams. This is not a clean deterministic attribution of every lost find to numerical bias. It is sufficient reason not to call the current implementation correct Bayesian Thompson sampling.

Further limitations: repeated pulls exhaust one-off rewards; negative observations conflate no opportunity, duplicate, previously captured and closed state. The samples are not IID stationary Bernoulli trials. A contextual bandit can be a heuristic here, but neither its prior nor forgetting schedule is validated by naming it Bayesian. Equal fetches do not account for policy compute, model calls or source-validation cost.

## 5. Weak memory and activation interpretations

B1's `session()` resets **only the Beta statistics map every300steps**. Frontier, visited pages, captured IDs, word mapping and all other knowledge persist. No process or host restarts and no durable storage is tested. The result measures “retain allocator statistics versus repeatedly reset them,” not full cross-session knowledge, causal models or durable memory.

H1−B1 novelty is **−0.20 ±0.47SE** on the original seeds: the reported memory benefit is not an advantage on the novel-family metric. H1 also wastes fewer revisits than B1; that is a plausible mundane explanation for much of its total-yield benefit.

H2 has additive reactivation every tick, fixed decay/reset constants and no learned change hazard, novelty/revisit cost calibration or useful-validation reward. In a world where almost every repeated visit has guaranteed zero reward after capture, its1032/1500revisits are predictably expensive. This rejects **that implementation**, not spreading activation, graph-based inquiry or the mycelial vision. Compare cost-aware/refractory variants before drawing a class-level conclusion.

Entropy of anchor words is not diversity of scientific explanations, source independence or cross-branch discovery. Neither entropy nor the number of graph nodes demonstrates intelligence.

## 6. Statistics: correct arithmetic, narrow inference

The original paired-difference mean and SE calculation is arithmetically correct for its20 worlds; the policy table's ± values are **SD**, while differences use **SE**. Keep those labels explicit. A small SE only means stability under this fixed generator.

These are20 seeds from **one author-selected generator**, not20 independent architectural assumptions or representative samples of vendor discovery. All feature/noise/change schedules and hyperparameters are fixed. There is no preregistered primary endpoint, held-out generator, repeated policy seeds within world, correction for exploratory multiple comparisons, uncertainty in truth labels or benchmark for useful model-generated inquiries. H3 is not implemented or evaluated, so E0 cannot select an H3+H1 hybrid.

My intervals are descriptive approximate t intervals with worlds as the unit; all ablations are exploratory. No architecture should be declared a statistical winner from them. Publish per-world rows, seed ranges, generator/source hashes and all negative cases. Use nested policy seeds and held-out structural generators before claiming transfer; do not tune and certify on the same cases.

## 7. What a better inquiry experiment must expose

- Evidence is an observation with noisy source provenance; evaluator truth is separate and inaccessible to policy.
- Discovery/validation cost and opportunity identity require work. Current `dupOf` merely discards a random30% of platform positives; no shared identity/deduplication problem exists.
- Real reopenings and new links on old pages; measure detection delay, correctly downgraded stale claims and wasted revisits.
- Cross-branch outcomes that require combining evidence, not entering a predefined high-yield component.
- New action/query/model proposals outside a supplied hyperlink frontier, and semantic deduplication against initial proposals/baseline.
- Independent evaluation of true/false/unknown claims and source dependencies. A live form or perfect synthetic `open` bit does not establish verified actionable opportunity.
- Strong fixed/random/diversity/revisit controls; same candidates across allocators, same allocator across generators; no-memory and shuffled-memory ablations.
- Cases where there is no valuable new route. The engine must learn to wait instead of hallucinating curiosity rewards.

Cached fpd data may help, but “offline replay of the cache” has selection bias: uncached actions are **unknown**, not negative. Frozen crawls alone cannot supply counterfactual outcomes for routes never collected. Separate temporal/source hold-outs, independent labels and later bounded prospective acquisition are needed. Quoted existing fpd yield/precision numbers are proposal inputs, not independently re-audited here.

## 8. Architectural disagreements outside the simulation

I agree on a small portable process, compact provenance, explicit paused states and using the existing development runner/bridge. I do not agree that those agreements imply selecting the proposed hybrid.

- **Exactly-once claim is false:** a local intent/done log and deterministic IDs make knowledge writes recoverable, not externally executed model calls exactly-once. A remote call can complete before its acknowledgement is journalled. Host loss before a30–60minute flush also loses local-only state. Reserve/commit irreversible action intent durably before dispatch; uncertain outcomes must hold, not silently call again.
- **The engine cannot admit itself to myc-agent unchanged:** the installed agent requires gate-produced job/admission artifacts and a one-time start slot. Writing a “brain-admitted packet” changes the trust/allowance authority. Inspect/test the narrow admission integration rather than bypassing the gate or building another orchestration platform.
- **Neon planning:** continuous0.25CU over a30day month would use180CU-h; wakeups matter. The quoted project quota/metering must be confirmed, and awake-time estimates are not measured project consumption. Burst sync trades cost against recovery lag; “must use bursts” does not settle durable operational state. No new API key is assumed necessary.
- **Mission Control:** GitHub updates every15minutes are delayed snapshots, not near-live state; a secrets regex is not a data-sensitivity policy. Do not reintroduce wholesale memory export. A localhost dashboard plus GitHub summaries may bootstrap observability but Quinn's actual authenticated access and freshness remain acceptance tests.
- **Watchdog:** reusing a mail provider is not the same as mycnotify already supporting heartbeat alarms; new alerts and any host changes still need approval. Same-host watchdogs cannot detect/report complete host loss by themselves.
- **Compact evidence:** selective snapshots may be necessary when pages disappear; a blanket “never keep HTML” is stronger than the owner's selective-evidence direction. Bound/compress evidence intentionally; do not delete provenance to hit a storage ratio.

## 9. Claude's concurrent correction, and remaining disagreement

While these independent probes/designs were being prepared, Claude published `8c911b05`: W1 is withdrawn, v0 is explicitly groundwork, and E0-D weak-cue/known-lexicon/short-horizon ablations challenge his initial leaning. This is the correct response; do not resurrect the withdrawn approval request.

I inspected and independently reran E0-D, reproducing its reported table. Its “no change” setting differs from mine: it makes formerly future-positive opportunities open from the start, while my stationary case freezes initial open/closed status. Its short-circuiting also changes the random draws consumed during world generation, so equal seeds do not preserve identical graphs/opportunity assignments in that ablation. Those stationary numbers should not be compared as if only a time flag changed. My transformations preserve the already-generated graph and initial opportunity assignments.

Our findings agree that the novelty claim depends on baseline/cue design and that H2 is not disqualified as a class. My additional points remain: hidden revisit eligibility, the incorrect sampler, and the narrowness of B1's “memory.” Retaining a statistics map helps in these worlds; that is not yet durable, transferable knowledge. The40-new-seed evidence also prevents declaring all corrected H1 advantages gone.

## 10. Handoff

**Next Claude:** read the separate Codex architecture as a competing design, challenge its mechanisms and propose discriminating cases. Amend E0's claim and observation contract before using its numbers in W1's seed. Keep the original experiment as history, not evidence to approve a production policy.

W1 has now been withdrawn by Claude. Any replacement BRIX batch must actually supply this critique and the competing hypotheses; the CLI will not inherit this chat. A balanced, bounded shared brief is published alongside this review. A call window may identify the next experiment and unresolved disagreements, not force a P1 architecture decision. Use the existing runner/hub/bridge; no new framework or live execution was performed.
