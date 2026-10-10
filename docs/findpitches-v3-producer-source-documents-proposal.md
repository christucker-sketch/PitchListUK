# Proposal: producer-supplied source documents for V3 verification (V3-002 option B)

- **Author:** Claude
- **Date:** 2026-10-10
- **Status:** PROPOSED. The producer side is built and tested but switched off. V3 has no endpoint yet. Nothing is enabled.
- **Background:** [UKCraftFairs access note](findpitches-v3-ukcraftfairs-access-2026-10-10.md).
- **Gate:** Chris approves option B as an evidence path. Codex then implements the V3 side.

## Purpose

Some source hosts cannot be fetched by V3's Cloudflare verifier even though the pages are public and healthy. ukcraftfairs.com is the first case: its IIS server sends two RFC-invalid header lines, so the Cloudflare edge answers 520.

For an explicit allowlist of such hosts, the producer sends V3 the **exact response body it fetched**, with custody facts. V3 then runs **its own verifier** on that document. Only the transport changes:

- V3's checks, READY rules and TTLs stay the same.
- The enquiry-only policy stays separate.

## What the producer publishes

The producer side is ready in `producer/`. It is off.

**Discovery side.** `fpd v3-docs --hosts ukcraftfairs.com` (`fpd/integration/v3docs.py`) reads `export/v3/feed.jsonl`. For each `channel=current` record, it takes every `provenance.sources[]` entry on an allowlisted host and:

1. **Loads the body** from the Pi's content-addressed cache. That cache keeps the full raw HTML of every page linked to an opportunity.
2. **Re-hashes the body** and publishes it only if the sha256 equals the record's `content_sha256`. A mismatch is counted and skipped.
3. **Applies a size limit:** documents over 2 MB are skipped.
4. **Writes the files:** `export/v3/docs/<sha256>.bin` (the raw bytes) and `export/v3/docs-manifest.json`. Documents no longer referenced are removed.

Each manifest entry looks like this:

```json
{"schema": "findpitches-source-document-v1", "content_sha256": "<64 hex>", "url": "https://www.ukcraftfairs.com/craft-events/26555/x",
 "final_url": "…", "fetched_at": "2026-10-10T09:37:45Z", "http_status": 200, "content_type": "text/html; Charset=windows-1252",
 "bytes": 61234, "producer_record_ids": ["fdx1_…"], "file": "docs/<sha256>.bin"}
```

`fetched_at`, `url`, `http_status` and `content_sha256` are copied from the record's own `provenance.sources[]`. They therefore match facts V3 already holds from the record receipt.

**Delivery side.** `uploadSourceDocuments` in `deploy/pi/delivery/producer-delivery.mjs` runs only if `source_documents_manifest` is set in `/etc/fpd/v3-runner.json`, and only after a 0-rejection record delivery. It works like this:

1. **One document per request.** It re-hashes each file before sending and sends at most 200 per cycle.
2. **Only new hashes.** It keeps a sent-state file, so each hash is sent once.
3. **Receipt check.** A document is recorded as sent only when V3 returns the same sha256.
4. **Failures stay contained.** An upload failure is reported in `status.json` as `source_documents.error` and never fails the record delivery.

The upload uses the same ingest-only token. The discovery user writes the documents into the export tree, so the delivery user still has no database access.

**Tests:**
- Python, 90 passed: allowlist, current-only, exact bytes, stale removal, and that a tampered cache body is never published.
- Node runner, 6 passed: exact bytes are sent once; a tampered file is skipped; a mismatched receipt is rejected; the upload is off by default; a missing endpoint does not fail delivery.

## Proposed V3 endpoint (Codex to confirm or adjust)

`POST /source-documents`, ingest role, `Authorization: Bearer <ingest token>`:

```json
{"environment": "shadow",
 "document": {"schema": "findpitches-source-document-v1", "content_sha256": "…", "url": "…", "final_url": "…",
              "fetched_at": "…", "http_status": 200, "content_type": "…", "bytes": 61234,
              "producer_record_ids": ["fdx1_…"], "body_base64": "…"}}
```

Response: `{"accepted": true|false, "content_sha256": "<same>", "reason": "<code when false>"}`. Exactly the same sha256 must be echoed back.

**Suggested V3 rules.** Codex owns these; they are listed here so the producer side matches.

1. **Hash check.** Decode the body and require `sha256(body) == content_sha256`. Otherwise reject with `hash_mismatch`.
2. **Provenance link.** Accept a document only if an existing receipt for one of the `producer_record_ids` has a `provenance.sources[]` entry with the same `content_sha256`, `url` and `fetched_at`. A document never introduces a new fact or clock.
3. **Host allowlist, owned by V3.** Accept only hosts V3 marks as not fetchable directly (initially `ukcraftfairs.com`). Anything else gets `host_not_allowlisted`, so producer documents never replace V3's own fetch where V3 can fetch.
4. **Immutable storage by hash.** Repeats are idempotent: `accepted: true` with no duplicate stored.
5. **Same verifier, labelled.** Run the normal source verifier on the stored document. Label the result `evidence_transport: producer_supplied` (versus `direct_fetch`), with `fetched_at` as the source clock. The TTL counts from `fetched_at`, exactly as for a direct fetch.
6. **No readiness from receipt alone.** Receiving a document gives no readiness by itself. Enquiry-only listings stay under their own policy.
7. **Limits.** At most 2 MB per document and a daily cap. Shadow or test environment only.

## Enabling, after approval only

1. Codex deploys `/source-documents` in shadow and the V3 allowlist.
2. Claude adds `fpd v3-docs` to `fpd-cycle` after `fpd v3-feed`, plus a switch like `fpd-v3-feed` (proposed: `sudo fpd-v3-docs enable|disable|status`). The switch sets `source_documents_manifest` in the runner config. Then Claude rebuilds the kit and Chris installs it.
3. The first cycle uploads about 159 documents, roughly 10 MB in total. After that, only changed pages are sent.
4. **Evidence:** the V3 verification outcome for the UKCraftFairs cohort, by state, with `evidence_transport` recorded.

**Rollback:** `disable` removes the manifest from the runner config. Documents already stored in V3 stay immutable evidence.

## Not proposed

- Treating the producer's classification as proof without a document.
- Any change to READY rules.
- Sending documents for hosts V3 can fetch itself.
