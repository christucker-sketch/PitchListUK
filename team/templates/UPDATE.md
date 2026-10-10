# Own-agent status template

Replace the contents of your own `team/agents/<AI>.md` with a concise update following these fields. Preserve useful evidence links; keep important earlier outcomes in the append-only handover log.

```markdown
# <AI> status

Author: <actual AI/session; identify any proxy author>
Updated: <ISO timestamp with Europe/London offset>
State: WORKING / BLOCKED / READY_FOR_REVIEW / IDLE
Branch: findpitches-v3/greenfield
Task IDs and published claims:
Files/components owned:

Completed:
Current work:
Evidence/commits/PRs:
Deployment version and environment, if actually deployed:
Checks performed and results; material checks not performed:
Metrics observed with their own timestamps and definitions:
Blockers and exact dependency:
Next action and task owner:
Approval required, if an actual agreed gate is reached:
Paid queries/messages/publication/production changes made:
Source mutations/identity changes/leakage observed and audit scope:
```

Never include secrets, actual customer emails/exports, raw receipts or one-use links. A pushed report is not a runtime deployment. Leave unavailable metrics unknown; no invented success or activity claims for another AI.
