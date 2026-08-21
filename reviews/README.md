# Opportunity data review

`opportunity-data-review-2026-08-21.json` compares the live 300-row snapshot with the preserved dirty 350-row checkout. It is an unapproved review manifest, not an import file.

The proposed correction is 29 removals (22 confirmed non-UK plus seven expired, closed or stale rows) and 12 conditional additions, for a projected 283 rows if every addition passes a final live source/application check. Seventeen further candidates remain `repair`, eight dirty additions are duplicate/replacements, and 21 are rejected. The manifest also preserves the nine production rows omitted from the dirty snapshot; one of those nine is itself the confirmed non-UK Cheshire record and is therefore proposed for removal.

No generated area pages or opportunity module were copied from the dirty checkout. Approval fields are deliberately unset, and the safe publisher must refuse this manifest until a human records the reviewed commit and explicit approval.
