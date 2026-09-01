# Acquisition controller notifications

This directory provides one fail-safe Telegram notification path for autonomous FindPitches acquisition controllers. Controller identity, market, state files and delivery routing are configuration data; no country is embedded in the notifier.

Controllers call `safeNotifyFailureFromEnvironment` only when they are exiting in a blocked or terminal state. They call `safeNotifyRecoveryFromEnvironment` after a new resumable Workflow checkpoint has been saved. Notification errors are recorded separately and never alter acquisition, evidence, publication or reconciliation state.

Each configured `controller_id` owns an atomic incident file in `incident_state_dir`. The fingerprint includes the controller, terminal status, exact blocker, region, cursor and Workflow ID. This gives one alert per distinct incident across service restarts, permits a changed blocker to alert, and keeps simultaneous country controllers independent. Failed deliveries remain pending for a safe retry. Recovery is sent only for an incident whose failure alert was delivered.

`config.example.json` documents the configuration contract for US, UK and future country or regional controllers. The same module and CLI are used by controller exit handlers and system-service failure hooks.

Normal retries, zero-addition runs, held or rejected candidates, expected skipped jobs and checkpoint transitions do not call the terminal notification path. A caller can also explicitly pass `terminal: false`, which is always suppressed.
