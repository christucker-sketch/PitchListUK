# HAL-006B9 — US acquisition Worker deployment gate

After a cloud US source-registry PR is merged, the controller must not start acquisition from its newly added source IDs until the merge commit has passed the repository verification workflow and the production acquisition Worker deployment job has completed successfully.

The internal GitHub controller broker exposes only the merged source PR's merge SHA and compact check-run status. The global controller classifies that evidence as pending, passed, or failed. Failed required checks fail closed. This phase does not trigger acquisition and does not change production controller authority.
