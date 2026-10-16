# Scoped listing HTML — 17 October 2026

The listing JSON API already reads the requested entity's proved country. Listing HTML still fetched the whole global catalogue to produce only that entity's title and structured metadata. V3-029 now applies the existing exact-ID scope to canonical and legacy query-ID listing documents, including language-prefixed routes. It selects by canonical entity ID; the path's country supplies no geography proof. Only that entity is transferred for HTML metadata. The browser detail API retains the complete proved country for identical related listings.

Country/category SEO and sitemaps retain full global counts. Missing/expired listings still return404. Old complete source responses remain a safe compatibility fallback; unexpected partial scopes fail closed through the existing contract. No proof cache, original-source/identity change, schema/producer/Pi/V2 change, paid query or billing-policy change.

Focused checks prove exact HTML parity between complete and properly scoped snapshots for UK/US/legacy/French-language paths, current expiry/missing-ID exclusion, global country SEO and unchanged Free redaction.31focused tests pass; final full suite and guarded customer-only release are in progress. Public improvement is not claimed before real measurements.
