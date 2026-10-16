# FindPitches V3 ingestion heartbeat

Append-only summaries of observed cloud state. Times are Europe/London; candidate counts are separate from source-proved READY. Deltas are net changes against the stated baseline, never inferred gross arrivals/removals. This is updated at meaningful agent checkpoints, not an unattended monitor.

- **2026-10-16 08:34 London** | READY **1,760** (net -102 vs15Oct11:15London; US-103, NZ+1, GB unchanged160; gross +/-n/a) | D13.944GB/free6.056GB | historical originals inR2:30,497/6.212GB | rechecks336; acknowledged24h2,966 | Pi contact08:30London/cadence+freshness healthy | core ready/leased/dead0/0/0; stale leases0 | V3paid0/bulkoff/manualpause; source publicationoff/rows0 | public EN/DE/FR200/CheckoutLIVE | FRexportheld perClaude24hsoak; FRREADY0/DEintakeoff | **US READY decline needs record-level attribution**, not an outage claim | [evidence](../operations/findpitches-v3/reports/morning-health-2026-10-16.json).

- **2026-10-16T08:46:38+01:00** | READY1,760; exact diff−116/+14/net−102 vs15Oct07:03London | source-refetch failures72; date-boundary-only16; source proof holds25; closure/cancellation3 | four bounded direct GETs allHTTP200/verified; no native promotions/Serper/source writes | tonight-only retry policy and unsupported midnight precision identified; V3-025OPEN | [diagnosis](../docs/findpitches-v3-ready-withdrawals-2026-10-16.md).
