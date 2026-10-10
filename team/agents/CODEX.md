# Codex status

**Author:** Codex. **Updated:** 2026-10-10T12:10:19+01:00 (Europe/London). **State:** WORKING; V3-004 and V3-005 claimed. **Branch:** `findpitches-v3/greenfield`.

**Owned tasks/components:** [V3-004 and V3-005](../TASKS.md): native customer/auth/billing, owned customer schema and verification tools, customer tests and the standalone frontend's TEST browser journey. Claude retains producer V3-001/V3-002; ChatGPT retains launch review V3-010. Their status files and producer components are outside these claims.

**Completed this update:** fetched and fast-forwarded to `fa6128c96b305400dd3ade7e570ffa8cfae1ebd8`; read the shared hub, decisions, recent handovers and both contributors' own updates. Claimed the two OPEN tasks at the user's explicit request. Updated the hub's participation table to reflect the contributors' published updates. This is a documentation claim, not completed implementation or deployment.

**Current work / next checkpoints:**

- **V3-004:** inspect native canonical ownership/entitlement and read-only legacy comparison; document the controlled recognition design and shadow test matrix. Cover ownership mismatch, idempotent repeat recognition, duplicate Checkout prevention, cancellation/paid-through and expiry. Use synthetic TEST identities; no live subscriber import or V1/V2 runtime dependency.
- **V3-005:** assess available browser/Stripe TEST fixtures and existing coverage; prove the actual hosted checkout, return, entitlement, cancellation and expiry journey. API-created TEST subscriptions are insufficient evidence for browser checkout. Retain sanitized evidence; report a missing capability precisely if one prevents the journey.

**Incoming handovers acknowledged:** Claude's V3-003 source custody and Chris's running-kit hash check are now recorded. Claude also reports lifecycle feed enablement and a first 12:00:24 London delivery with 2,044 accepted / 119 inserted / zero rejected. The V3-side lifecycle links, internal states and preview withholding remain unverified by this session; they are a separate supporting checkpoint for Claude-owned V3-001. ChatGPT's V3-010 review can use the subscriber/payment evidence when it exists. No external session was automatically notified.

**Retained earlier evidence:** [10 October team report](../../docs/findpitches-v3-team-status-2026-10-10.md), [mail verification](../../docs/findpitches-v3-email-setup-2026-10-10.md), [customer architecture](../../docs/findpitches-v3-customer-architecture.md). Prior runtime code checkpoint `00c752e2104d4006600d12b9188aa91ba2199c6b`; detailed report commit `1825ae7b61e17084444ce0199d5ee20dc02d69a1`. Previous runtime suite 210/210 and focused mail/auth 21/21 are historical results, not rerun here. HUB-001 was completed and its initial publication independently verified on GitHub.

**Checks / metrics / deployment:** no new runtime, inventory or integrity measurement; no deployment. Documentation links, whitespace, scope and sensitive-content checks are the appropriate verification for this claim update. [CURRENT_STATUS.md](../CURRENT_STATUS.md) retains its separately timestamped measurements.

**Blockers:** none to claiming either task. Browser/TEST fixture capability will be assessed before claiming journey completion. Actual customer migration, live billing, publication and production cutover remain approval gates; none is reached by this claim.

**Spend, messages and preservation:** zero queries or messages sent; no publication, production or runtime data change. V2 and live Pitchlist untouched. Original source evidence and identity remain unchanged by this documentation update.
