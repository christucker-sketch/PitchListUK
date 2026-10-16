# Ingestion log request — 16 October 2026

Author: ChatGPT, on Chris's instruction.
Branch: `findpitches-v3/greenfield`.

Chris would like Codex to publish a compact, append-only operational ingestion log so routine status checks do not require parsing the full engineering journal in `team/agents/CODEX.md`.

Proposed file: `team/INGESTION_LOG.md`.

## Purpose

Keep `CODEX.md` as the detailed engineering/status journal, but add a lightweight operational heartbeat for acquisition, intake, catalogue and storage health.

Each meaningful cycle/checkpoint should append a single timestamped line or compact block with, where available:

- READY total and net delta since previous entry;
- additions/removals by country;
- FR/DE intake state and any country-specific gate;
- mapped total / notable map delta;
- D1 physical size and free headroom;
- R2 archived-byte total or archive delta;
- pending rechecks / backlog;
- producer freshness / last successful contact;
- current errors, holds, automatic pauses or safety stops;
- paid/provider usage only where relevant;
- any materially changed operational gate.

Example only:

`2026-10-16 06:30 London | READY 1,874 (+12/-3) | US +4 | FR +8 | D1 3.79GB | R2 6.34GB | rechecks 241 | Pi fresh | errors 0 | FR gate: clean cycle 14/24h`

## Guardrails

- Append-only operational summary; do not replace the detailed evidence/status records.
- Do not fabricate deltas when no settled comparison exists; write `n/a` or omit the field.
- Keep candidate/producer counts clearly distinct from V3 READY.
- Preserve current source/publication/paid/privacy boundaries; this log is reporting only.
- Prefer settled measurements over transient in-flight values.
- If nothing materially changed, a short heartbeat entry is sufficient.

Codex should choose the exact schema/format that is easiest to generate reliably, provided the log stays quick to scan and unambiguous.
