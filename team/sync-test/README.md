# sync-test (Mycelium Phase 0.1, test-only path)

Synthetic tasks for the `hubsync` watcher on `fpd-prod` ([proposal](../../greenfield/docs/mycelium/PHASE_0_1_HUBSYNC_PROPOSAL_2026-10-23.md)).
- `tasks/T-<id>.json`: `{"id": "T-<id>", "to": "hubsync", "body": "..."}`, written by people or agents.
- `results/T-<id>.json`: written **only** by hubsync, recording the task's blob hash. No AI is involved, and nothing here affects V3 or the producer.
