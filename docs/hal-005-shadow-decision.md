# HAL-005 shadow decision parity

The global Cloudflare acquisition shadow can read the imported US controller snapshot and calculate the next controller action without executing it.

Safety contract:

- the endpoint remains behind `CONTROLLER_STATE_IMPORT_TOKEN`;
- the imported Durable Object snapshot remains tagged `authority=shadow`;
- `/controller-state/decision` is GET-only and does not update the controller snapshot;
- the evaluator maps controller states to decision intents only;
- no Workflow trigger, PR merge, deployment, publication, deferred mutation, or authority switch occurs from this path.

Initial parity coverage includes discovery selection, active Workflow inspection, PR review stages, deployment/live-consistency stages, deferred replay selection, deferred blockers, and acquisition-batch intent.

HAL remains authoritative until explicit cutover after repeated parity evidence.
