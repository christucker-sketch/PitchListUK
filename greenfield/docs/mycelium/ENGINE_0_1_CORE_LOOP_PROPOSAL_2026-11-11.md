# Mycelium engine 0.1: the core loop (first engine piece). Proposal, 11 Nov 2026

**Status:** offline proposal by Claude for Codex's review and Chris's choice (Chris: "yep", 11 Nov). No model call, no host or Neon change. MYC-P0 (concurrent collaboration) was accepted on 11 Nov; this is the first piece of the **engine itself** built on that setup.

## What exists already (reused, not rebuilt)

- **Workbench** (`greenfield/mycelium/brain/workbench/`): a hidden-world simulator (`world.mjs`) whose pages open, close and reopen, with noise, link churn, duplicates and unlearnable decoys. It has 6 cases, a pinned evaluator, and a scoreboard.
- **Attention mechanisms** already measured against an fpd-like fixed crawl: `claude-h1`, `claude-h1b`, `codex-c1`, and the baselines.
  - Codex's C1 is strongest on VERIFIED, at 2.6–4.8× the CPU.
  - Claude's H1 loses on weak-cue and decoy cases.
- **The collaboration table** (accepted), the watchdog, Neon memory (Stage One) and the hub.

What's missing is the **organism around the mechanisms**: durable, restart-safe state; investigations with lineage; contradictions kept rather than overwritten; revival of dead ends; explained decisions; a read-only status view. Today a mechanism is a stateless script that dies with its process.

## The artifact: `greenfield/mycelium/engine/` (Node, no new dependencies)

**State store:** append-only event log plus a snapshot, in a local state directory.
- It records observations with provenance (source id, time, content key and hash; never raw page copies).
- It records inquiries/branches with parent lineage, status (`open | waiting | dead | revived | contested`), evidence links, decisions and their reasons.
- **Restart-safe:** a crash at any point resumes from log plus snapshot with no lost or duplicated observation.
- Neon persistence is a later, separately approved adapter. The store interface is shaped so it can be swapped in.

**Loop:** observe → update state → generate and branch inquiries → choose the next action through a **pluggable attention policy** → record the decision and its reason.
- The policy interface wraps the existing mechanism contract (`create/choose/observe`), so H1, H1b, C1 and the baselines plug in unchanged.
- The engine adds what they lack: branching, contradiction and revival semantics, explanations, persistence.

**Environment adapter:** the workbench world first (offline, deterministic, seeded). A FindPitches web adapter comes later, under its own grant.

**Status interface:** `node engine/cli.mjs status --json`. This is a read-only snapshot of engine state, investigations, recent decisions and resource counters, and the first seed of the Mission Control machine interface. There's no UI yet.

## Acceptance (falsifiable, offline, part of the suite)

1. **Restart:** kill the engine at random steps (several seeds) and resume. The decisions and final state must be **identical** to an uninterrupted run with the same seed, with no lost or duplicated observations.
2. **Branching with lineage:** a finding that reveals new routes spawns inquiries whose lineage traces back to the evidence that caused them.
3. **Contradiction retention:** conflicting observations of the same key (noise, churn) are both kept with provenance. The claim becomes `contested`, and nothing is silently overwritten.
4. **Revival:** a branch marked dead is revived when trigger evidence arrives (the reopen cases), with the revival decision explained.
5. **Explanations:** every decision references the evidence or event IDs and the policy signal behind it, with no free-text-only reasons.
6. **No regression:** running H1b, C1 and the baselines *inside* the engine reproduces their standalone workbench scoreboard on all 6 cases, within seed error.
7. **Storage discipline:** bytes per observation are bounded and reported; there are no page copies.

## Split (equal engineers; each reviews the other)

- **Claude:** state store and log, loop, restart/recovery, status interface; tests 1, 5 and 7.
- **Codex:** policy interface and mechanism wrapping, contradiction and revival semantics, adversarial cases; tests 2, 3, 4 and 6.
- Both: cross-review and adversarial challenge of the other's half.

## How it gets built, and what it costs

1. **Offline first** (no model calls, £0): both halves are built and tested in the repo through the hub, as since 6 Nov.
2. **Optionally**, once the offline core is green, **one bounded live table session** where Claude and Codex jointly extend or challenge it on the BRIX (for example, adding a revival-heavy case and tuning the policy wrapper).
   - That needs its **own grant**.
   - Real engine work needs more room than the proof runs did, so it will come with concrete numbers: session length, inputs, **context above 24 KB**, and token stops, with a worst-case disclosure like live-5's.
   - No numbers are requested now.

**Out of scope:** web access, Neon writes, production FindPitches, a Mission Control UI, a 24/7 service. Each is a later step with its own approval.
