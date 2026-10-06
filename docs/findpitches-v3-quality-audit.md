# Practical legacy quality audit

Source preservation and practical customer usefulness are separate measurements. A preserved title may describe a calendar, a social post or an unrelated event. A source URL may be an application directory or a footer link. A recovered record can therefore pass the immutable-source control and still be inappropriate for customers.

`quality-audit.mjs` samples qualified source-linked legacy records against the retained recovery baseline and current V3 canonical selections. Selection uses seeded SHA-256 ordering, recovery-route/identity quotas, country/platform coverage and one distinct entity per sample row. Quotas deliberately oversample rare strata, so percentages describe the audited sample rather than an unbiased population estimate. Sampling does not rewrite receipts, canonical facts or the historical recovery report.

The private sample contains canonical fields, selected-fact proofs, immutable selected receipts and original recovered evidence. `--refetch` checks distinct original source/application routes directly through the guarded original-source fetcher: HTTPS public routes only, bounded redirects/response size/time, hostname pacing, no Serper. Failed or blocked fetches remain uncertainty.

Each practical review examines event title, organiser, venue/location, event timing, application route/state/deadline and supporting provenance. It records one of `clearly_usable`, `usable_minor_missing`, `questionable` or `wrong_unsafe`, a concrete reason, recurring patterns and the evidence checked. Availability uncertainty can remain a minor gap for an otherwise specific, current and useful event; missing timing/location, a directory, stale edition or unclear vendor route is material. Cross-country contradictions, unrelated application links and non-opportunities are unsafe. Reviews are evidence-based Codex judgments, not independent human ground truth.

`reportQualityAudit` requires a complete unique set of grounded reviews and publishes aggregate strata, coverage, patterns and review decisions without the private raw sample/source cache. The `--holds` operation uses the existing immutable quality-hold model for the currently selected shadow receipts of records judged wrong/unsafe. It re-runs ordinary eligibility/readiness without deleting evidence or changing source-backed values. Questionable records are reported for later source verification; missing facts are never invented to make a record pass.

```bash
node operations/findpitches-v3/quality-audit.mjs \
  --credentials /secure/cloudflare.env --state-dir /secure/v3-resources \
  --out-dir /secure/legacy-audit
node operations/findpitches-v3/quality-audit.mjs --refetch \
  --state-dir /secure/v3-resources --out-dir /secure/legacy-audit
```

Keep private samples, raw sources, review working files and tokens outside Git. New audit holds are later dispositions; the completed recovery's 5,597 recovered records and 261 within-recovery matches remain the historical accounting baseline. Readiness does not establish independently verified customer quality, and publication remains disabled.
