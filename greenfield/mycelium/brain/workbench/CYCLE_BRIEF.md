# Stage Two collaboration cycle 1: shared brief (read by both agents; neither agent's design is preferred)

You are one of two equal researchers, Claude and Codex, building **Mycelium**: a persistent, adaptive, multidirectional exploration organism.
- **First commercial use:** FindPitches (finding verified, actionable vendor pitches), not its limit.
- **No predefined research lanes.**
- **Success means:** new routes, corrections, transfer and changed choices, backed by evidence, not prose or graph size.

**This cycle runs automatically:** 6 alternating turns, Codex first, through the existing BRIX runner. Every answer of yours is **executed and scored** before the other agent reads it:
1. A pinned, sandboxed workbench evaluates your artifacts.
2. The scoreboard, your prediction verdicts and progress are appended to your answer as a machine-written "Workbench result" section.
3. The next turn receives that whole result, plus the shared memory snapshot.

## Competing hypotheses on the table (none demonstrated)

- **Claude H1 (frontier bandit):** Thompson sampling over contexts that emerge from evidence (link text), with forgetting, a diversity floor and revisit arms. Implemented as `mechanisms/claude-h1.js`, corrected after Codex's audit.
  - Strong where cues are informative.
  - **Loses where cues are weak or a source is unlearnable** (scoreboard below).
- **Claude H2 (spreading activation)** and **H3 (model-as-planner):** not implemented. Naive H2 cycled in E0.
- **Codex C1 (competing predictive models generate inquiry):**
  - Keep rival local models with prospective predictions.
  - Failed predictions, rival disagreement and missing implications create discriminating tests.
  - Attention values reducible, decision-relevant uncertainty, not immediate yield.
  - Risks Codex names: expensive wrong models; gaming with easy predictions.
- **Codex C2 (learned graph transformations):**
  - Learn reusable evidence operations, with preconditions and counterexamples, and compose them across branches.
  - Risks: combinatorial explosion; false analogy; a restrictive operator language.
- **Settled disputes:** E0 had an observation leak and a wrong sampler (Codex). E0's novelty and revisit claims depended on Claude's world (both). These are fixed in the workbench.
- **Open disputes:** which mechanism should generate and allocate inquiry; how costly C1/C2 are under real call budgets; whether a cheap allocator belongs inside a richer design.

## The workbench (pinned; neither agent can change it during the cycle)

**World** (`world.mjs`): hidden pages built from a declarative case.
- A mechanism sees only observations: `{t, id, status: open|closed|none, key, links: [{to, text}]}`.
- Truth, families and case parameters are invisible.
- Opportunities open, close and reopen.
- Observations can be wrong (`noise`); links can change on revisit (`linkChurn`); duplicates share a key; `decoy` families are unlearnable.

**Mechanism contract** (`mechanisms/<name>.js`): a plain script, run in an isolated context that has only `Math` (with a seeded `Math.random`) and `JSON`.

```js
function create(api) {                 // api = { budget, seeds: [{id, text}] }
  return {
    choose(now) { return { fetch: id } },   // id must be a page you were shown; or { wait: true }
    observe(obs) { /* learn from it */ }
  };
}
```

**Limits:** 50 ms per call; 8 s CPU per run. A turn's whole evaluation (every mechanism × every case × 6 seeds, cached between turns) is capped at about 2 minutes. Your own new files are evaluated first; anything left over is reported as truncated. Keep mechanisms cheap: an uncached run of the three shipped mechanisms on all five cases takes about 40 s.

**Case schema** (`cases/<name>.json`; data only, validated): `{name, author, description, budget<=5000, anchorSignal, families: {fam: {n, yield, out, to: {fam: weight}, words, noise, schedule: always|closes_mid|opens_mid|cycle:N, decoy, seeds}}, linkChurn, dupRate}`. At most 6,000 pages. See `cases/*.json` for examples.

**Primary endpoint (fixed in advance):** **VERIFIED**, the distinct keys you observed open while they truly were open. It is reported per case as a paired difference against `baseline-fixed`, an fpd-like breadth-first crawl with a bounded watch/recheck schedule.

**Secondary measures:**
- precision of your final claims;
- reopenings found and detection delay;
- wasted fetches;
- CPU.

## How to produce artifacts (required every turn)

**Files.** Put each file in its own block. The fence line is three backticks, then `mycelium-file path=<path>`, then a newline. The block holds the file text and ends with three backticks.

Allowed paths, in your own namespace only (anything else is rejected and shown as REJECTED):
- `mechanisms/<you>-<slug>.js`
- `cases/<you>-<slug>.json` (must validate; `author` = you)
- `test/<you>-<slug>.test.mjs`

**Size limits:** up to 4 files, 8 KB each, 12 KB in total.

**Predictions.** Give at least 1, and up to 3, falsifiable predictions, each in a fenced block labelled `mycelium-prediction` holding one JSON object:

```json
{"mechanism":"<name>", "case":"<case>", "metric":"verified|verifiedVsBaseline|precision|reopenDetected|meanReopenDelay|wasted|cpuMs", "op":">"|"<", "value": <number>}
```

They are scored HELD / FAILED against the scoreboard computed **after** your artifacts are applied.

**Contribution.** End with exactly one fenced `mycelium-contribution` block. It is stored in shared memory, linked to the snapshot or `@<earlier task>`.

**Words.** The 400-word guidance applies to your **prose**. Keep prose short; let the artifacts carry the argument.

## Rules of the cycle

1. **Act on the current state.** Read the previous answer and its machine-written Workbench result, which includes your own current files. Pick the highest-value unresolved question.
2. **Each turn must change the evidence:**
   - implement or improve a mechanism (yours, or a new idea of your own);
   - author an adversarial case that targets a weakness of the other agent's mechanism;
   - add a test that exposes a defect;
   - or retire a claim with evidence.
3. **Repetition is detected.** Re-submitting identical files, or prose with no artifact, is "no progress". **Two non-progress turns in a row STALL the cycle**, which stops early and saves the remaining calls.
4. **Disagree freely.** There is no consensus requirement and no decision turn. A failed prediction is a useful result.
5. **The last two turns** (5 and 6) also state, in prose, the open disputes and the next experiment each of you would run, so the next approved cycle starts from evidence rather than from the original seed.

## Starting scoreboard (6 seeds; pinned workbench at this commit)

```text
Workbench scoreboard (mean ± standard error over seeds; "vs base" = paired difference in VERIFIED against baseline-fixed)

case baseline-e0-corrected [c98124f9b768]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 143.2±5.2 | — | 1.00±0.00 | 0.0±0.0 | 0±0 | 1357±5 | 436±7
baseline-random | 117.8±3.4 | -25.3±5.9 | 1.00±0.00 | 0.0±0.0 | 0±0 | 1382±3 | 398±20
claude-h1 | 250.5±3.3 | 107.3±7.2 | 1.00±0.00 | 0.0±0.0 | 0±0 | 1250±3 | 818±47

case claude-churn-and-noise [8582c3c08ae4]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 150.5±4.7 | — | 0.93±0.01 | 149.7±4.8 | 432±5 | 1350±5 | 439±27
baseline-random | 99.3±4.4 | -51.2±3.0 | 0.93±0.00 | 76.3±5.4 | 527±3 | 1401±4 | 432±23
claude-h1 | 151.8±7.9 | 1.3±3.8 | 0.93±0.01 | 178.8±8.3 | 411±5 | 1348±8 | 732±27

case claude-enumerable-source [de43aff224cc]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 340.2±8.0 | — | 1.00±0.00 | 0.0±0.0 | 0±0 | 660±8 | 270±9
baseline-random | 219.0±6.9 | -121.2±5.8 | 1.00±0.00 | 0.0±0.0 | 0±0 | 781±7 | 320±9
claude-h1 | 413.0±7.6 | 72.8±4.7 | 1.00±0.00 | 0.0±0.0 | 0±0 | 587±8 | 429±15

case claude-unlearnable-decoy [73f0cc5c2cb7]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 55.7±2.7 | — | 0.23±0.01 | 84.7±3.9 | 305±5 | 1144±3 | 357±9
baseline-random | 43.8±2.3 | -11.8±2.4 | 0.23±0.01 | 54.2±3.9 | 359±4 | 1156±2 | 359±5
claude-h1 | 36.8±5.3 | -18.8±5.0 | 0.18±0.02 | 53.3±8.7 | 374±13 | 1163±5 | 506±13

case claude-weak-cues-cycles [15d8c252a90d]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 108.7±2.5 | — | 1.00±0.00 | 415.7±7.4 | 372±10 | 1391±3 | 450±18
baseline-random | 54.7±1.9 | -54.0±3.0 | 1.00±0.00 | 145.7±10.1 | 573±12 | 1445±2 | 414±22
claude-h1 | 58.7±1.1 | -50.0±2.1 | 1.00±0.00 | 260.7±10.0 | 423±10 | 1441±1 | 705±22

```
