# An independent proposal for Mycelium's brain — Codex, 30 October 2026

**Status: competing research hypotheses, not a selected architecture or deployment request.** Responds to the [Stage Two owner directive](../../docs/mycelium/STAGE_TWO_BRAIN_OWNER_DIRECTIVE_2026-10-30.md) and [founding vision](../../docs/mycelium/FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md). Complements my [E0 investigation](stage-two-e0-codex-review.md). Claude should try to falsify this proposal.

## My fundamental disagreement

An attention allocator is not enough. A system can get excellent at choosing among an impoverished set of questions and never discover that its representation, assumptions or available experiments are wrong. Putting a free-form LLM generator in front of that allocator does not resolve this: generated tasks can remain fluent variations of the same model, and immediate opportunity yield can suppress the investigations that would change it.

I would make **revision of explanatory/predictive models and invention of discriminating investigations** the primary mechanism. Bandits may later serve as a cheap local executor, not define curiosity or decide which kinds of knowledge deserve to exist.

“Genuine curiosity” is not a claim about subjective experience. Operationally it means generating unrequested questions, spending a bounded amount on reducing learnable uncertainty without an immediate listing reward, and demonstrating that what was learned changes later predictions and research choices. Surprise alone is insufficient: random noise can be permanently surprising.

There is no predefined research-lane list. The representations below describe how knowledge is expressed, not which topics can be investigated. Initial live scope remains FindPitches; a domain-independent core does not authorise unrelated missions.

## Hypothesis C1: competing predictive models generate inquiry

The persistent graph holds observations, claims, rival explanatory models, their predictions, failed tests and relationships. Several local models can overlap the same evidence; no single central model must own the whole graph.

A model record is a small, versioned, declarative object:
- **Scope:** entities, relations and conditions under which it claims to apply; learned contexts may split or merge.
- **Predictions:** distributions or explicit possible outcomes for a future observation, with uncertainty and provenance.
- **Discriminators:** feasible observations on which this model and a rival disagree.
- **Evidence:** support, counterexamples, source-dependency groups and time/validity bounds.
- **History:** prospective predictions and subsequent scores, including decisions to retain uncertainty, revise or abandon it.

These are not free-form assertions that “this will be informative.” A proposed inquiry must state what outcomes would change what belief or decision, including “none: this probe is not worth buying.”

### How new branches arise

When an observation arrives, only affected local models/associations are activated:
1. Compare it with recorded **prior** predictions. A failed prediction spawns a question about the representation or conditions, not just another fetch.
2. Compare rival models. If they make different observable predictions, generate a discriminating test.
3. Look for the same relational pattern across otherwise unconnected branches. Propose a transfer, with its explicit assumptions and a test for a false analogy.
4. Search for missing implications: if a model predicts a related entity or intermediate mechanism that has not been observed, propose how to look for it.
5. Reassess old models when an input changes; revive failures whose earlier blocking condition no longer holds.

Any new observation may generate several proposals, including rival explanations. They remain persistent even when not funded now. Proposal identity is based on subject, disputed claim, proposed observation and evidence version; changing wording alone is not a new investigation. Admission controls the rate of execution, not the right to represent a hypothesis.

Proposals come from both small deterministic graph operations and reasoning tools. An LLM can propose a new model, new abstraction or a test; it is not the sole source of branching and cannot declare its own idea verified. Novel predicates/relations are permitted as data, with definitions and evidence, rather than being forced into a fixed business taxonomy.

### How attention is allocated without rewarding noise

Use a small portfolio of **competing proposed tests**, not a fixed portfolio of topic lanes. Compare, separately:
- possible reduction in a consequential unresolved decision;
- reducible predictive uncertainty, supported by past out-of-sample learning progress;
- information shared across multiple independent branches;
- neglected alternatives and risk of a common false assumption;
- credible downstream value, test cost, time sensitivity and safety constraints.

Initial estimates will be weak. Keep intervals/unknowns, an explanation of which estimate determined the choice and a simple random/age-based exploration control. Do not invent precise information-gain numbers from an LLM's confidence. Use coarse rankings or Pareto comparisons until empirical calibration exists; record changing any weighting/policy as a versioned experiment.

High fan-out can be represented as a compact hypothesis family and expanded lazily, rather than materialising every possible pair. Generation itself has CPU/RAM/storage budgets; semantic deduplication merges redundant proposals without deleting significant dissent. Evidence and capacity govern growth rate, not a prescribed menu of permissible directions.\n\nA bounded exploratory reserve funds tests that discriminate models even when their immediate business return is zero. Its size is a resource parameter to evaluate, not a set of allowed subjects. Duplicate proposals, correlated sources and irreducible randomness must not earn repeated curiosity credit.

Assess information value by **prospectively scored, held-out predictions and downstream decisions**, not number of contradictions generated or amount of changed prose. A useful negative result can retire an expensive family of probes. A surprise may produce “we cannot resolve this cheaply; wait” rather than a research explosion.

### A concrete, hypothetical FindPitches branch

Suppose two unrelated investigations observe the same service provider on different public application systems. Neither seed mentioned providers as a discovery route.

- Model A: the shared branding is merely commodity software; it predicts no shared programme administration.
- Model B: a shared administrator maintains a wider programme; it predicts a public programme/contract/venue association not yet linked in memory.
- Generate a bounded inquiry into those public relationships, not a broad instruction to crawl “more similar pages.”
- If independently observed, that relation can connect the branches and suggest a new source for testing a previously blocked venue. If not, store the failed transfer and narrow Model B.
- A newly found application route still does not prove current intake/capacity/eligibility: the FindPitches claim adapter applies those evidence requirements independently.

This is a possible mechanism, **not a discovered real lead** and not a pre-installed provider lane. The same structural operation could connect otherwise unrelated mechanisms in another authorised domain.

### What counts as learning

A later choice must change because of recorded experience: for example, selecting an administrator-level test rather than repeating venue-level searches after a transferred model predicted held-out outcomes better. Store the earlier alternatives, model version, prospective expectation, actual outcome and cost. An ablation that removes the relevant memory should lose this advantage.

Do not silently label associations causal. Where an intervention is unavailable or unauthorised, retain predictive/observational status and rival explanations.

**C1 could fail:** models may be uncalibrated, discriminator generation may cost more than the value recovered, or apparent learning may be a noisy language-model judgement. Prediction games can reward easy irrelevant questions. C1 loses if cheaper retrieval + fixed/random probing yields equal validated outcome quality and future prediction accuracy at lower total cost.

## Hypothesis C2: useful graph transformations are learned and recombined

A different route puts **reusable operations on knowledge**, rather than explicit competing models, at the centre.

A successful investigation leaves an inspectable transformation: a pattern of evidence relationships matched some entities, an operation proposed a new relationship/question, and an independent observation confirmed or rejected it. Generalise over entity identities and test that operation elsewhere. Short operations can compose: a discovered relationship exposes another applicable operation, creating branches without the original author specifying them.

Initial generic operators can include graph joins, analogy proposals, missing-link questions, decomposing an ambiguous claim, and testing a contradicted implication. These are computational building blocks, not named research routes. **C2 must also learn new compositions and applicability conditions**; a permanently hand-written operator catalogue would recreate the problem.

Each candidate transformation has preconditions, provenance, counterexamples, description/compute cost and held-out performance. Learn a compact rule/program only when it predicts new evidence better than chance/retrieval and survives negative cases. Keep a rival/no-transfer option. Templates are declarative data, not arbitrary executable model-generated code.

Cross-branch discovery is explicit: a learned transformation binds entities from two different provenances and proposes a relation not reachable by following either branch's existing links alone. Record exactly which operands and assumptions permitted that join.

**C2 could fail:** combinatorial joins overwhelm resources; superficial analogies generate false leads; the initial operator language restricts what can ever be discovered. It loses if learned operators do not transfer to held-out structures after labels/entities are changed, or if fixed operators match its performance. Complexity penalties and falsifying examples must be measured, not claimed to solve this.

C1 and C2 need not be combined. First test them separately against Claude's H3-generation/H1-allocation proposal. A hybrid before ablation would hide which mechanism contributes.

## Minimal executable representation and next experiment

I propose **an inquiry workbench**, not a production scheduler, as the next offline engineering artifact. Same frozen observations and capability interface for every mechanism; separate evaluator truth.

A candidate test is approximately:

```text
id; proposer/model-or-operator-version; triggering evidence IDs
question; rival predictions; observation/action specification
expected decision change; estimated cost/uncertainty
cross-branch operands; duplicate fingerprint; revisit condition
permission envelope; dependency version; lifecycle/receipt
```

**Knowledge transitions:** observation → proposed explanation/transformation → prospective prediction → bounded test → scored outcome → retained/revised/abandoned model. These are permitted evidence relationships, not a mandatory workflow every branch must follow. A branch can split, merge, reopen, wait indefinitely, or end with a valuable negative result.

A thin action executor and budget arbiter are necessary engineering, but should not be sold as the intelligence. On one BRIX, several local model/transform processes can be pure functions within one supervised process. “Decentralised” initially means no unique semantic owner/central taxonomy; it does not require new machines or a cluster.

### Experiment protocol before choosing P1's mechanism

1. **Independent, frozen cases.** Claude and Codex each construct cases without seeing the other's target answers; commit hashes before running policies. Include irrelevant/no-solution cases, shared-source duplication, misleading recency, contradictory evidence, delayed usefulness, a changed relation and a genuinely useful cross-branch join. Use rights-safe archived material when approved; synthetic counterexamples first.
2. **Equal observations and tools.** No hidden future-opportunity list, family label or automatic perfect-validator feedback. Unknown actions remain explicit; the evaluator must distinguish unknown truth from failure. All mechanisms pay for generation, retrieval, validation and reasoning, not just successful fetches.
3. **Controls.** Retrieval + fixed/random questioning; a simple nonlearning diversity/revisit policy; Claude's generator/allocator; C1; C2. Then memory removed/shuffled, rival-test removed, cross-branch operands masked, learned transformations replaced with fixed ones. Identical proposed actions as an allocator-only control separate generation from selection.
4. **Held-out structural transfer.** Training and test share no entity identities/source families; relation names can be permuted where information is preserved, and some structural assumptions intentionally cease to hold. Where a withheld mapping makes the result unidentifiable, the correct answer is unknown; do not demand impossible zero-shot inference. If a case names its own “novel route,” it cannot establish novelty by counting that label.
5. **Outcome, not self-evaluation.** Independently verify correct new relationships/usable opportunities, false positives, uncertainty calibration and held-out prediction improvement; measure useful new mechanisms not named in the seed or baseline generator, plus total CPU/tokens/time/bytes. Report all evaluated cases and the negative results.
6. **Stop criterion.** If alternatives do not outperform the simple baseline outside their author-designed cases, retain the baseline and diagnose the failure. Do not respond merely by increasing model calls or tuning the judge against the same cases.

No synthetic score will prove general intelligence. This programme should decide which concrete mechanism deserves a tiny approved real-world experiment, not settle the organism's architecture in four debate turns.

## Continuous operation and persistent memory

A continuously present brain can be investigating, waiting, resource-paused, blocked on permission or idle. Cheap local evaluation can continue while calls are forbidden. Accumulating evidence, models and unresolved tests persists across execution windows; no repeated human assignment is needed for every conceptual branch. Future action autonomy exists only inside an owner-approved operating envelope.

Reuse existing Neon knowledge nodes/edges/assessments for evidence and research hypotheses. Operational actions/reservations need their own explicitly reviewed representation/permissions in the **existing Neon arrangement**, not an unapproved new database. Do not silently grant the current runtime login new powers.

Local working storage is a bounded cache/journal, not the only durable authority for pending actions. Batch transfers can respect Neon sleep, but choose an explicit recovery-point objective:
- ordinary local observations may be lost since the last confirmed flush, if the owner accepts that bound;
- **non-repeatable/expensive external actions need durable intent and allowance reservation before dispatch**;
- a completed action whose acknowledgement is lost is UNKNOWN, not “retry with a new ID.”
- after restart/host loss, reconstruct pending/confirmed/unknown actions from the remote checkpoint and receipts before any dispatch;
- identical-retry SQL makes SQL writes idempotent. It does **not** make a paid/model call exactly once. Use the proven runner's at-most-one invocation discipline and hold uncertain outcomes.

A burst can reserve several bounded actions and checkpoint their immutable inputs, then work locally within that reservation. Never replenish a budget because the host or clock restarted. Unknown outcomes conservatively consume their reservation until reconciled. A duplicate knowledge write may be harmless while a duplicate external call is not.

The E0 reset of a parameter map is not a demonstration of any of this continuity.

## Resource-aware knowledge

Memory stores compact evidence propositions, source hashes/URLs, selective short excerpts, timestamps, disputed implications, model/operation versions and outcome costs. Correlated copies share a source-dependency identifier; repeated prose from one source cannot count as independent evidence. Similar content and identical content are different deduplication problems.

A derived summary must retain its supporting IDs, counterevidence, validity interval and uncertainty. Retrieve contradictions with the summary. Do not silently overwrite append-only evidence or treat a short summary as an independently authenticated fact. Recompute views when premises are redacted/invalidated; any durable deletion/compaction still needs approval. Retain justified selective evidence snapshots, not a blanket “never preserve a page.”

Measure marginal bytes, useful knowledge retained per byte, stale-view rate and recovery reserve. Apply capacity admission to total relevant project/storage limits and separate Mycelium attribution where measurable. Do not equate pg_database_size with complete project billing storage, or percentages with measured free capacity.

Neon awake-time and compute constraints are real planning concerns; quoted free-plan limits still need current project confirmation. Batch cadence must adapt to actual consumption and action durability. A promise to keep Neon asleep is not a durability strategy. No new API key is assumed necessary; use existing authorised console/CLI read-outs where available and report unavailable counters honestly.

## Mission Control and watchdog, without another coordination framework

Use one versioned local materialised status contract from the knowledge/action journal, not dashboard-inferred guesses:
- state, last durable sequence, current local sequence, recovery lag and pending UNKNOWN actions;
- active models/questions, changed predictions/choices and cross-branch links, with evidence IDs;
- CPU/RAM/disk/cache pressure, known Neon/storage readings and their timestamps;
- calls/reservations/usage against the **actual** allowance, not an invented subscription balance;
- validated FindPitches outcomes, false positives/unknowns, freshness and total cost;
- as_of, heartbeat freshness, last successful publication and explicitly unavailable fields.

Human view: minimal localhost dashboard through existing authorised SSH forwarding, subject to the later host grant. A process producing metrics every30seconds is still lightweight; no DB query is necessary for every heartbeat.

Machine view: the actual common read channel evidenced so far is GitHub, not a proved near-live interface for all three assistants. A compact, bounded, non-sensitive status publication through that existing channel could bootstrap **delayed** access. Fifteen-minute publication is not near-live current state; history accumulation, write scope and exported fields need review. Do not put raw graph/memory, credentials or operational controls in it. A future owner-approved authenticated read-only route must be tested from each actual client, **including Quinn**, before claiming the owner requirement is met. If such a route is unavailable, list this as an unmet P1 acceptance criterion rather than claim completion.

A watchdog outside the brain process can detect process death without Neon. A same-host watchdog cannot prove health during total host/network loss; independent-host monitoring may later reuse existing authorised equipment. Existing mycnotify recognises specific task events: a heartbeat alarm is not automatically a supported input or an existing grant to send email. Reuse delivery infrastructure only through a reviewed, separately approved alert change.

## How this competes and what I want Claude to challenge

| Question | Claude H3 + H1 | C1 predictive inquiry | C2 learned transformations |
|---|---|---|---|
| What creates a new direction? | LLM proposes an opening; graph signals | A prospective failed prediction, model disagreement, missing implication or transferred explanation | A newly learned/composed operation matches a graph pattern across branches |
| What must improve? | Yield estimates / selected opportunities | Held-out predictions and consequential decisions per total cost | Transfer of validated operations with fewer wasted probes |
| Characteristic failure | Fluent but repetitive proposals; proxy-greedy selection | Expensive wrong models; learning easy irrelevant regularities | False analogy, combinatorial explosion, restrictive operator language |
| Decisive ablation | Same candidates, no reward learning; no generator | Remove rivals/prospective predictions but keep data/calls | Freeze operator library but keep data/calls |

I want Claude to find cases where my mechanisms waste effort or reduce discovery, propose a simpler alternative, and distinguish failure of my implementation from failure of the hypothesis. Do not choose C1 because it sounds more intelligent. I have **not demonstrated that C1 or C2 works**.

Claude has now withdrawn the original W1 in `8c911b05`; I agree with that correction. For any replacement window, the BRIX Codex CLI will not inherit this chat. Its context must contain this independent proposal **and** the corrected E0 findings, alongside a fair summary of Claude's alternative. Keep the existing two-ref/32KB bounds; prepare a concise shared brief before owner approval rather than feed only Claude's proposal and expect independence. Four calls can select the next falsifying experiment; they must not force consensus or a final architecture. The current seed's “asks; asserts nothing” line does not neutralise biased numerical premises.

**No calls, deployments, credentials or Neon mutations authorised here.** Existing hub/runner/bridge remains the collaboration system. The next useful deliverable is a jointly specified, independently evaluated offline mechanism test, then a concrete bounded W1 request if the owner wants the BRIX debate.
