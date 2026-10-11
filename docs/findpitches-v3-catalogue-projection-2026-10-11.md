# Compact catalogue policy: deployed shadow checkpoint

Codex, 11 October 2026. Source baseline `51a14306`; [equivalence](../operations/findpitches-v3/reports/catalogue-projection-equivalence-2026-10-11.json), [deployment](../operations/findpitches-v3/reports/catalogue-projection-deployment-2026-10-11.json), [preservation](../operations/findpitches-v3/reports/catalogue-projection-preservation-2026-10-11.json).

Every private catalogue snapshot previously loaded the full normalized independent-producer receipt merely to inspect confidence/channel/export readiness. The query now extracts those three fields and entity ID directly. Original receipts remain immutable and fully retained; the source-clock/received-at/record-ID winner rule, proof expiry/revision checks, identity/conflict holds, customer redaction and snapshot schema are unchanged. No cache was added.

At **15:51:03 London**, one native snapshot captured nine inventory reads and 2,089 policy rows, then replayed both implementations with exactly the same rows and clock. **Every catalogue field matched**, with identical digest `e9735544897de4d937f80b241bbdb178b6f474ffbb30c365bf0125d74923abc9`. Both contained 1,811 eligible entities and zero producer-policy withheld candidates. Fixtures separately exercise the held cases that this current snapshot does not contain.

Policy payload fell from **6,178,592 to 301,499 bytes: 95.12% smaller**. This saves internal result transfer/parsing without weakening source custody. It is not new inventory or a whole-page speedup claim.

| Bounded observation | Before, 15:46 London | After, 15:56–15:57 London |
| --- | ---: | ---: |
| Operator snapshot wall, three reads | 4,057 / 3,793 / 3,535 ms | 3,977 / 3,774 / 3,372 ms |
| Operator snapshot median | 3,793 ms | 3,774 ms |
| Policy-read wall, three reads | 1,154 / 1,158 / 1,046 ms | 520 / 515 / 531 ms |
| Policy D1 execution, three reads | 247 / 235 / 217 ms | 169 / 218 / 174 ms |
| Native operator customer status, one read | 3,665 ms | 4,361 ms |
| Eligible catalogue | 1,811 | 1,811 |

[Before profile](../operations/findpitches-v3/reports/catalogue-projection-before-2026-10-11.json), [after profile](../operations/findpitches-v3/reports/catalogue-projection-after-2026-10-11.json). This small, sequential sample includes management API/proxy/network variance. Policy transfer clearly shrank; complete snapshot medians barely changed and native status did not improve in this sample. Repeated inventory reads/boot remain unresolved. The existing invitation is expired, so no new browser timing, session, email or account was created. Do not present these as public-origin/concurrency benchmarks.

**Validation:** full V3 **239/239**, focused catalogue/commercial/customer **25/25**, boundaries and bundle passed. Native SQL fixtures cover unsuitable producer confidence/disposition, nullable metadata, late older-clock replay, equal-clock receipt/ID ties, immutable selected facts, proof expiry, conflicts, revision mismatch and test/control exclusion. An attempted invalid stale READY fixture was correctly rejected by the database; the final test verifies that protection and an actual revision invalidation.

Only `findpitches-v3-api-shadow` was deployed; final version **`11a49ff6-13df-4721-ae15-728aa0bc04c5`**, deployment `5724e727-6d29-47bc-bdb3-0d37725f4150`, **15:56:49 London**. Its final bindings match original version `dcea9723-7084-4c28-befc-a34e6bb3b6dc`; secrets were retained, no migration. Customer Worker/frontend version `9ba2ac7a-7cdf-4cc0-b0f4-b11477c52169` is unchanged.

Deployment validation caught an old operator configuration reintroducing two expired canary variables. Both were removed from the owned local API configurations and redeployed; final original-binding equality was verified. The canary was expired, the commercial pause remained enforced and observed paid attempts stayed zero. No production or other Worker configuration changed.

At **16:00:49 London**, the full preservation audit compared **15,811 original receipts, 108,819 source facts and 7,077 identities**: **zero destructive mutations/identity changes**, zero customer projection/publication queue rows, original publication API denied, paid attempts zero/bulk off, protected PitchList deployment unchanged and V2 scheduler unchanged/empty. Source-backed selections and customer business records were not edited.

Claude's three new retained LocalStalls fixtures were also rehearsed locally at15:57:24 without source fetches or persisted proof: Dubbo binds current event/organiser/vendor route; New To You lacks single-event structured data; Christmas Tree Farm has dates/organiser but no proved application route (its description also mentions 2025 while JSON-LD says2026). None was promoted or used to repair identity/dates. A cleaner producer string alone cannot clear the existing equal-authority organiser conflicts.

**Priority changed during this checkpoint:** Chris's D-014 and updated launch orders arrived in `f3369ef9`/`24cb030a`. Routine catalogue/LocalStalls work is now paused after this published increment. Codex proceeds with the isolated production customer runtime and LIVE-mode guards; exact payable market/price policy and secure credential availability are pending operator inputs. No public/LIVE action was performed by this shadow increment.
