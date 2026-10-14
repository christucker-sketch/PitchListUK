# US map backlog — execution order

Authority: Chris, 14 October 2026.

The first bounded US mapping pass proved the matching logic and stopped automatically at its 200-request safety cap. Current customer state is roughly 1,722 US READY with about 571–575 mapped opportunities at 132 positions across 31 states, leaving roughly 1,150 unpinned. This is now an unfinished mapping backlog, not a reason to leave coverage at one-third.

## Codex — execute the next mapping batches

1. Resume US mapping over the remaining unmapped READY backlog using the existing truthful V3-016 rules.
2. Process in further bounded batches rather than one unbounded run. Use a sensible batch size (e.g. 250–500 provider attempts) and stop on abnormal error rate, degraded match quality, provider throttling, or unexpected custody drift.
3. Preserve all existing constraints:
   - source-owned coordinates preferred;
   - otherwise exact source street/city/state(/ZIP) matched to a legitimate address result;
   - no city/state/ZIP-centre fallbacks;
   - no guessed coordinates;
   - no identity/source mutation to force a match;
   - changed/expired source proof invalidates the binding.
4. Reuse existing exact-address cache where the current source proof still matches; do not waste provider requests on known-good identical addresses.
5. Prioritise currently READY records that already contain complete street/city/state evidence before spending effort on records that fundamentally lack venue proof.
6. After each batch, report:
   - US READY total;
   - mapped opportunities and percentage;
   - distinct mapped positions/venues;
   - states represented;
   - provider attempts and cache hits;
   - remaining unpinned;
   - failure buckets: not attempted, no exact match, address disagreement, missing street/city/state, ambiguous match, source-evidence deficiency.
7. Continue batches while conversion remains worthwhile. Do not leave the programme permanently capped at the original 200-request proof run.
8. Target milestone: **1,000+ US READY opportunities mapped**, then reassess the remaining failure population and realistic maximum coverage.

This map backlog work is separate from the US catalogue-growth learning loop. Do not let mapping block Claude/Pi source expansion; likewise, new acquisition should continue retaining exact venue/address evidence so future records arrive easier to map.

No US/global paid search authority is created by this order. Existing PitchList/V1/V2 protections remain unchanged.
