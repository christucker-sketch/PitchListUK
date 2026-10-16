# Source renewal and date precision

Source verification is proof of a particular entity revision, original route and fetch time. Transport failures describe a failed attempt to obtain proof; they cannot renew that proof, establish closure or silently change identity.

## Attempt custody and retry admission

`source_renewal_attempts` is append-only. Every new direct verification visit records either a source-result receipt linked to its verification or a transient-failure receipt linked to the exact retained document and prior active verification. Original source documents/facts/verifications stay immutable.

Transient fetch failures and HTTP 408/429/500/502/503/504 schedule retries after 5, 15 and 60 minutes. A fourth consecutive failure within the rolling 24-hour window enters a 24-hour cooldown. A successful source result starts a new sequence. Retry-After can lengthen the short delay, up to one hour. Retry admission permits at most 16 entity retries per exact hostname per 15-minute window. Denied work is rescheduled without a source request; automatic retry visits allow at most three source requests for redirects/supporting routes. Operator canaries additionally impose their own total request ceiling and stop on rate limits or repeated failures.

An existing positive proof remains usable only while its original revision, identity, comparison, closure and expiry checks still pass. A failed attempt does not replace it or change its clocks. Readiness is independently reevaluated at its original expiry. Missing, expired, changed, closed or quarantined proof stays withheld. Permanent/semantic responses still create normal proof outcomes, so a 404 or a closed/cancelled page cannot fall back to an earlier positive.

A retry pointer must still name the latest failed attempt at the current revision. A newer source result or revision supersedes it. Replayed delivery cannot bypass backoff, extend proof or turn an attempt acknowledgement into readiness. Request-budget exhaustion is not permission to start another automatic retry chain.

`/status` → `source_verification.renewal` reports attempts, source results, transient failures, exhausted retries, outstanding failure entities, reasons and fixed diagnostic categories. It also counts pre-existing latest failed verification receipts on previously READY entities. Its health can be degraded while processing queues are empty: completed processing is not successful source renewal. Diagnostics never copy exception messages, credentials or private request headers.

## Calendar dates and exact source instants

A source-zoned closing instant takes precedence over a calendar date. Eventeny's visible `Deadline` date, clock and GMT offset are bound to the same vendor-scoped offers. Conflicting dates/clocks/offset assertions remain a proof hold. The parsed UTC instant is additive proof metadata; the original page, offer values and calendar deadline remain unchanged. No timezone comes from a search query or guessed geography.

Unqualified local timestamps do not become UTC instants. Strictly earlier/later calendar dates can establish a window; a same-day unqualified clock requires source-supported precision to prove its boundary. Original source text remains retained. Explicit CLOSED, WAITLIST, cancellation and identity/edition disagreements continue to override positive availability claims.

For genuinely date-only values, the existing Europe/London customer/reporting calendar supplies a bounded operational recheck horizon after the date. It is explicitly labelled as policy, never stored as the publisher's `application_close_at` or asserted event timezone. A date-only event occurring today is not already past its end. The original 24-hour proof TTL still caps validity; precise source closing times can shorten it. Ambiguous or contradictory records are not made READY by date formatting.

## Deployment and rollback

Migration 0024 adds only attempt custody, immutable triggers and a retry-admission counter table. It does not alter original evidence, identity, customer/billing storage, producer contracts, publication or paid controls. All source Worker releases preserve native bindings, secrets, schedules and retained versions. Rollback deploys prior source versions and leaves the additive tables/evidence intact; no deletion is necessary. The customer Worker, provider settings, routes, DNS, V2 and live PitchList remain untouched.
