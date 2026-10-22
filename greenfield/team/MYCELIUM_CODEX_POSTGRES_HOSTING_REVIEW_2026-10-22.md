# Mycelium Phase 0 — Codex database hosting cost review
Date: 2026-10-22
Commissioned by: Chris
Owner: Codex
Status: DESIGN / RESEARCH ONLY — no purchasing, provisioning, migration or deployment authorised.

## Objective
Before selecting Mycelium's cloud database, assess affordable PostgreSQL hosting without creating a dependency on either BRIX machine or the user's home connection.

## Required comparison
Research and cite current public prices, limits, and operational terms for:
1. Neon managed PostgreSQL (free and paid usage-based)
2. Aiven managed PostgreSQL
3. DigitalOcean managed PostgreSQL
4. Supabase managed PostgreSQL
5. A low-cost self-managed PostgreSQL VPS as a cost/control baseline
Include other competitive options only if they materially improve the decision.

For 25 GB, 100 GB and 250 GB of *operational PostgreSQL data*, provide GBP/month estimates (show original currency, FX assumption and assumptions) including provisioned/active compute, storage, IOPS/network/egress where applicable, backups/PITR and retention, high availability where essential, monitoring and maintenance. Separate fixed monthly cost from variable charges and AI/API spending. Flag pricing tiers that cannot support a scenario, free-tier sleep/quotas and potential surprise charges. Show realistic idle, expected and busy workload assumptions; do not treat a headline free tier as production capacity.

## Architecture boundaries
- Cloud-first: authoritative coordination, database and APIs must stay functional if both BRIX units and home internet are unavailable.
- Keep PostgreSQL as baseline, Cloudflare R2 as candidate object/evidence store. Avoid storing large raw evidence blobs in PostgreSQL without justification.
- Cloudflare D1's per-database limit is not an acceptable primary-DB foundation for planned scale.
- BRIX J3455 and J1900 (8 GB RAM each) are allocated to Mycelium as replaceable workers, not database hosts.
- Assess database region (UK/EU), network latency to Cloudflare Workers and BRIX, secure connectivity, pooling/Hyperdrive fit, TLS/secrets, backups/restore, availability, and future migration/portability.
- Do not provision a server or create paid resources.

## Deliverable
Publish a concise, source-linked decision memo in greenfield/docs/mycelium/ with a side-by-side price table, explicit assumptions, recommended Phase 0 provider/configuration and upgrade thresholds at 25/100/250 GB, plus trade-offs against a self-managed VPS. Clearly distinguish verified prices from estimates and name decisions requiring Chris's approval.
Link the memo from the team hub/queue per existing convention, and report the resulting commit and document path. Do not divert into unrelated Mycelium implementation or experiments.
