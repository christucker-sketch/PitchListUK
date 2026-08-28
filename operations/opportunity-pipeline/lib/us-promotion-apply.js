'use strict';

const core = require('./us-state-publication-core');

const TEXAS_STATE = Object.freeze({ code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX' });

function planTexasProductionSnapshot(snapshot, promotionManifest, stagingManifest, options = {}) {
  return core.planStateProductionSnapshot(TEXAS_STATE, snapshot, promotionManifest, stagingManifest, options);
}

module.exports = {
  canonicalUrl: core.canonicalUrl,
  identityOf: core.identityOf,
  planTexasProductionSnapshot,
  planStateProductionSnapshot: core.planStateProductionSnapshot
};
