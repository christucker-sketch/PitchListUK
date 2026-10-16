# One proof read per anonymous SEO page — 17 October 2026

V3-029 removes the browser's redundant combined SEO read when the HTML request has already obtained current proof. The HTML includes only the exact Free-redacted combined response, with true cross-market counts, never the private proof snapshot. The API and HTML use the same page constructor. All source proof/revision/hold/producer-clock and expiry gates still run for that HTML request.

This response is single-use, path-bound and expires within ten seconds of capture, earlier if any global source proof or explicit application close expires. Crossing London midnight forces a live API read. Any session cookie suppresses the optimisation; signed-in client state also rejects it. Missing/malformed/expired/path-mismatched data falls back to the live API. No customer/session information, application/source destinations or private proof data are embedded. HTML/API remain private/no-store. No independent request uses a retained READY cache.

The [contract](../web/findpitches-v3-web/contract/V3_CUSTOMER_API.md) documents this internal HTML transport. Regression tests cover global source-expiry and application-close bounds, London midnight, future clocks, malformed data, excessive lifetime, path mismatch, session bypass, Free redaction, single-use consumption and fresh API fallback. Worker-level checks verify one source read, exact API search/market parity and no customer creation.

Implementation is under validation; no deployed browser improvement is claimed at this checkpoint. The guarded customer-only release preserves existing billing/customer storage/settings/secrets/schedules, all eight source Workers, routing and PitchList. No source writes, migrations, Serper queries or producer/Pi/V2 changes.
