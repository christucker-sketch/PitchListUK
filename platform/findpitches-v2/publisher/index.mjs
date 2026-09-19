import { planPublicationBatch } from './plan.mjs';
import { applyPublicationReconciliation, reconcilePublicationResult } from './reconcile.mjs';

export function createFindPitchesPublisher({
  enabled = false
} = {}) {
  return Object.freeze({
    enabled: enabled === true,

    async plan(db, options) {
      return planPublicationBatch(db, options);
    },

    reconcile(plan, review) {
      return reconcilePublicationResult(plan, review);
    },

    async apply(db, reconciliation, options) {
      if (enabled !== true) {
        return Object.freeze({
          applied: false,
          reason: 'publication_disabled',
          reconciliation
        });
      }

      return applyPublicationReconciliation(db, reconciliation, options);
    }
  });
}
