# FindPitches V3 decisions and approval record

Seeded from the user's instructions and verified repository reports. These entries summarize existing decisions; the linked reports are retained evidence, not a fabricated new approval. Future changes need the actual approver, time, scope and direct evidence. Record recommendations separately from approvals.

| ID | Standing decision | Authority / evidence | Effect |
| --- | --- | --- | --- |
| D-001 | V3 is a greenfield product; V2 is read-only evidence/reference, not its runtime foundation | User instructions; [architecture](../docs/findpitches-v3-architecture.md), [customer architecture](../docs/findpitches-v3-customer-architecture.md) | No destructive V2 changes, no bulk copy of customer-facing fields |
| D-002 | Immutable source evidence; additive stronger repairs with provenance; explicit identity decisions | User anti-woodchipper requirements; [runbook](../docs/findpitches-v3-runbook.md) | No inferred geography/state/date or silent identity/country/edition rewrite |
| D-003 | Keep publication, production cutover, live billing and paid acquisition disabled | Current user guardrails; [10 October checkpoint](../docs/findpitches-v3-team-status-2026-10-10.md) | Shadow work is authorized; runtime enablement is not |
| D-004 | Free search; application/source links and alerts on Pro. Replace homepage claim with “Checked against event, organiser and application sources.” | User explicitly approved both choices; [customer architecture](../docs/findpitches-v3-customer-architecture.md) | Current frontend/product policy; no implied price or launch approval |
| D-005 | Approved Build 4 is physically copied into the standalone V3 package; never use old mixed V2 frontend as runtime source | User handover correction; [frontend custody](../web/findpitches-v3-web/source-custody.json) | Own assets/client/SEO; dev fixtures are not deployed inventory |
| D-006 | Reuse existing SMTP2GO/Stripe accounts with V3-owned configuration/storage/endpoints | User instructions; [mail evidence](../docs/findpitches-v3-email-setup-2026-10-10.md), [customer architecture](../docs/findpitches-v3-customer-architecture.md) | No duplicate mail account/sender; native bindings; TEST billing only |
| D-007 | Independent structured producer remains logically separate; 15-minute delivery, three-hour discovery and up to one-hour lag | User producer instructions; [feed confirmation](../docs/findpitches-v3-producer-feed-confirmation-2026-10-09.md) | Delivery clock does not weaken proof expiry or stale-recheck rules |
| D-008 | Keep all paid work paused; latent commercial cap 25/day and global 4/run, 100/hour, 1,000/day limits | Current user guardrails; [source-led report](../docs/findpitches-v3-source-led-readiness-2026-10-07.md), [current checkpoint](../docs/findpitches-v3-team-status-2026-10-10.md) | Budget headroom is not spend permission; external-client attribution still needed |
| D-009 | One specific V3 sign-in test email was authorized and completed | User recipient authorization and successful-delivery/sign-in reply; [mail report](../operations/findpitches-v3/reports/customer-email-2026-10-10.json) | No authorization for a second message, alerts, bulk mail or other recipients |
| D-010 | Centralize Codex/Claude/ChatGPT status and handovers in GitHub | User request in this session; this `team/` hub | Documentation sharing on the V3 feature branch; no automatic deployment or external-agent access |
| D-011 | Commit the independent producer source (engine + Pi host kit) to this repository as a separate package for V3-003 | Chris to Claude, 2026-10-10 ~11:50 London: “approved to commit the producer source for V3-003”; [producer/README.md](../producer/README.md) | Source custody only under `producer/`; no data, exports or credentials; no CI/deploy wiring, no Pi or cloud change |
| D-012 | Enquiry-only ("Contact the organiser") listings may count as launch inventory **provided each has a working link/route customers can use to contact the organiser** | Chris to Claude, 2026-10-10 ~12:49 London: “i think contact the organiser is fine as long as there is a link / route for customers to contact”; evidence in [UKCraftFairs access note](../docs/findpitches-v3-ukcraftfairs-access-2026-10-10.md) | Applies the existing `enquire` customer status; listings stay labelled as contact-the-organiser, never as open applications. Requires an https contact route that V3 has verified (UKCraftFairs routes need a free site login — show that). Does not loosen source verification: UKCraftFairs still needs a fetch path (option A/B) before READY. Producer snapshot 12:34 London: 292 current enquiry-only, 274 with an https route, 18 contact-only without a link (stay excluded) |

## Approval gates still closed

Production/domain cutover, customer publication, live billing/customer migration, paid acquisition, destructive V2 changes, infrastructure deletion and protected/live branch merges must not happen as a routine task/handover consequence. Stop before a gated action unless the user has explicitly authorized that exact action in the current evidence record. Existing user authorization takes precedence; do not invent extra confirmation requirements for ordinary reversible shadow engineering.

Sending actual customer/test alert messages requires an explicit instruction or approved recipient/send scope. Implementing reversible mail logic or preparing reviewable tests does not itself authorize sending. Secrets remain in secure settings outside GitHub.

Future decision entry:

```text
ID:
Decision/recommendation:
State: PROPOSED / APPROVED / SUPERSEDED
Actual approver and timestamp with timezone:
Evidence link or exact recorded instruction:
Authorized scope and remaining gates:
Affected task IDs and implementation evidence:
```
