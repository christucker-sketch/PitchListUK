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
  - **`mechanisms/claude-h1b.js`** is Claude's attempted fix: a reward weighted by measured source reliability, plus a learned share of fetches spent on a watch list.
    - The weak-cue loss shrinks (−50 → −16) and the decoy loss narrows (−19 → −15), but H1b still loses both.
    - It newly loses on churn-and-noise (−14), and gives back some strong-cue gain (e0 +98, enumerable +64).
    - Its prediction "beats fixed on decoy" FAILED.
- **Claude H2 (spreading activation)** and **H3 (model-as-planner):** not implemented. Naive H2 cycled in E0.
- **Codex C1 (competing predictive models generate inquiry):**
  - Keep rival local models with prospective predictions.
  - Failed predictions, rival disagreement and missing implications create discriminating tests.
  - Attention values reducible, decision-relevant uncertainty, not immediate yield.
  - Risks Codex names: expensive wrong models; gaming with easy predictions.
  - **Implemented** as `mechanisms/codex-c1.js`: rival observation forecasts with a prospective Brier loss and consequence-guided rechecks. See `codex-implementation-review.md`: it gains VERIFIED on every shipped case, but at 2.6–4.8× the baseline's CPU, so the <2× cost challenge FAILED.
- **Codex C2 (learned graph transformations):**
  - Learn reusable evidence operations, with preconditions and counterexamples, and compose them across branches.
  - Risks: combinatorial explosion; false analogy; a restrictive operator language.
- **Settled disputes:**
  - E0 had an observation leak and a wrong sampler (Codex). E0's novelty and revisit claims depended on Claude's world (both). Both are fixed in the workbench.
  - Codex's harness regressions C-01…C-09 (reopen intervals, horizon precision, integral cases, the realm escape, cache identity, incomplete comparisons, symlinked writes and imports) are fixed in MYC-0.1-B, with their tests green.
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

**Limits:** 8 s of process CPU per run (the per-call 250 ms wall limit is only a hang guard). A turn's whole evaluation (every mechanism × every case × 6 seeds, cached between turns) is capped at about 170 s. Your own new files are evaluated first; anything left over is reported as INCOMPLETE and not scored. Keep mechanisms cheap: an uncached run of the five shipped mechanisms on all six cases takes about 125 s on a 2-vCPU machine.

**Case schema** (`cases/<name>.json`; data only, validated; counts must be whole numbers): `{name, author, description, budget<=5000, anchorSignal, families: {fam: {n, yield, out, to: {fam: weight}, words, noise, schedule: always|closes_mid|opens_mid|cycle:N, decoy, seeds}}, linkChurn, dupRate}`. At most 6,000 pages. See `cases/*.json` for examples.

**Incomplete comparisons are not scored:** if any seed fails, times out or is cut, that mechanism's entry for the case is INCOMPLETE. It gets no metrics and no paired verdict, and predictions about it are UNSCORED.

**Primary endpoint (fixed in advance):** **VERIFIED**, the distinct keys you observed open while they truly were open. It is reported per case as a paired difference against `baseline-fixed`, an fpd-like breadth-first crawl with a bounded watch/recheck schedule.

**Secondary measures:**
- precision of your final claims (keys whose last observation was open), judged at the **horizon**: is each one still open at the end?
- reopenings found, each only by a true-open observation inside **its own** open interval, and the detection delay;
- wasted fetches;
- CPU.

## How to produce artifacts (required every turn)

**Files.** Put each file in its own block. The fence line is three backticks, then `mycelium-file path=<path>`, then a newline. The block holds the file text and ends with three backticks.

Allowed paths, in your own namespace only (anything else is rejected and shown as REJECTED):
- `mechanisms/<you>-<slug>.js`
- `cases/<you>-<slug>.json` (must validate; `author` = you)
- `test/<you>-<slug>.test.mjs`

**Size limits:**
- up to 4 files and 6 KB in total per turn;
- at most 6 KB of your files changed across the whole cycle, so the other agent's turn can always carry them back to you;
- keep your whole answer under 7 KB. If the other agent's changed files cannot be carried next to your answer, the cycle stops with HANDOFF INCOMPLETE.

Every turn's memory snapshot also contains the starting source of every mechanism and case.

**Predictions.** Give at least 1, and up to 3, falsifiable predictions, each in a fenced block labelled `mycelium-prediction` holding one JSON object:

```json
{"mechanism":"<name>", "case":"<case>", "metric":"verified|verifiedVsBaseline|precision|reopenDetected|meanReopenDelay|wasted|cpuMs", "op":">"|"<", "value": <number>}
```

They are scored HELD / FAILED against the scoreboard computed **after** your artifacts are applied.

**Contribution.** End with exactly one fenced `mycelium-contribution` block. It is stored in shared memory, linked to the snapshot or `@<earlier task>`.

**Words.** The 400-word guidance applies to your **prose**. Keep prose short; let the artifacts carry the argument.

## Rules of the cycle

1. **Act on the current state.** Read the previous answer and its machine-written Workbench result, which includes every file of yours changed during this cycle; your unchanged files are in the snapshot. Pick the highest-value unresolved question.
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
Workbench scoreboard (mean ± standard error over seeds; "vs base" = paired difference in VERIFIED against baseline-fixed; precision is judged at the horizon; evaluator c466b6801ea552f8)

case baseline-e0-corrected [c98124f9b768]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 143.2±5.2 | — | 1.00±0.00 | 0.0±0.0 | 0±0 | 1357±5 | 482±16
baseline-random | 117.8±3.4 | -25.3±5.9 | 0.81±0.02 | 0.0±0.0 | 0±0 | 1382±3 | 430±13
claude-h1 | 250.5±3.3 | 107.3±7.2 | 0.93±0.01 | 0.0±0.0 | 0±0 | 1250±3 | 883±32
claude-h1b | 241.3±3.6 | 98.2±7.1 | 0.92±0.03 | 0.0±0.0 | 0±0 | 1259±4 | 738±34
codex-c1 | 261.2±3.4 | 118.0±5.3 | 0.68±0.01 | 0.0±0.0 | 0±0 | 1239±3 | 2184±69

case claude-churn-and-noise [8582c3c08ae4]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 150.5±4.7 | — | 1.00±0.00 | 106.7±3.7 | 176±1 | 1350±5 | 447±31
baseline-random | 99.3±4.4 | -51.2±3.0 | 1.00±0.00 | 48.5±2.8 | 192±1 | 1401±4 | 447±10
claude-h1 | 151.8±7.9 | 1.3±3.8 | 1.00±0.00 | 133.5±4.2 | 159±1 | 1348±8 | 860±28
claude-h1b | 136.7±3.8 | -13.8±2.2 | 1.00±0.00 | 117.5±4.8 | 169±2 | 1363±4 | 628±34
codex-c1 | 178.3±4.9 | 27.8±1.2 | 1.00±0.00 | 105.5±4.7 | 174±1 | 1322±5 | 1665±33

case claude-enumerable-source [de43aff224cc]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 340.2±8.0 | — | 1.00±0.00 | 0.0±0.0 | 0±0 | 660±8 | 312±7
baseline-random | 219.0±6.9 | -121.2±5.8 | 1.00±0.00 | 0.0±0.0 | 0±0 | 781±7 | 298±20
claude-h1 | 413.0±7.6 | 72.8±4.7 | 1.00±0.00 | 0.0±0.0 | 0±0 | 587±8 | 504±13
claude-h1b | 403.8±8.7 | 63.7±4.8 | 1.00±0.00 | 0.0±0.0 | 0±0 | 596±9 | 363±7
codex-c1 | 395.2±9.1 | 55.0±6.4 | 1.00±0.00 | 0.0±0.0 | 0±0 | 605±9 | 1061±37

case claude-unlearnable-decoy [73f0cc5c2cb7]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 55.7±2.7 | — | 0.24±0.01 | 78.0±3.9 | 178±2 | 1144±3 | 379±12
baseline-random | 43.8±2.3 | -11.8±2.4 | 0.23±0.01 | 43.3±2.7 | 197±1 | 1156±2 | 365±5
claude-h1 | 36.8±5.3 | -18.8±5.0 | 0.18±0.02 | 42.0±7.4 | 201±5 | 1163±5 | 636±32
claude-h1b | 40.7±5.3 | -15.0±2.8 | 0.18±0.02 | 53.8±8.5 | 190±4 | 1159±5 | 475±27
codex-c1 | 83.5±4.2 | 27.8±1.9 | 0.22±0.01 | 108.8±4.5 | 167±3 | 1117±4 | 1543±77

case claude-weak-cues-cycles [15d8c252a90d]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 108.7±2.5 | — | 0.70±0.01 | 204.5±4.3 | 106±1 | 1391±3 | 448±7
baseline-random | 54.7±1.9 | -54.0±3.0 | 0.62±0.03 | 59.5±4.6 | 129±2 | 1445±2 | 462±8
claude-h1 | 58.7±1.1 | -50.0±2.1 | 0.77±0.03 | 216.2±7.8 | 97±2 | 1441±1 | 892±14
claude-h1b | 92.5±1.7 | -16.2±1.9 | 0.61±0.03 | 236.2±4.8 | 101±2 | 1408±2 | 625±16
codex-c1 | 111.7±2.4 | 3.0±1.7 | 0.68±0.01 | 187.2±3.7 | 109±1 | 1388±2 | 1184±64

case codex-alias-storm [1ca151bfb078]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 122.0±2.9 | — | 0.89±0.01 | 120.7±5.7 | 16±0 | 1078±3 | 367±9
baseline-random | 103.7±3.3 | -18.3±2.1 | 0.85±0.01 | 98.7±4.0 | 16±0 | 1096±3 | 360±18
claude-h1 | 110.3±4.1 | -11.7±2.3 | 0.80±0.01 | 231.3±10.5 | 16±0 | 1090±4 | 588±27
claude-h1b | 111.3±2.8 | -10.7±0.7 | 0.88±0.01 | 164.5±8.7 | 16±0 | 1089±3 | 503±13
codex-c1 | 124.5±2.6 | 2.5±0.8 | 0.88±0.01 | 137.2±4.1 | 16±0 | 1071±3 | 1030±52

```
