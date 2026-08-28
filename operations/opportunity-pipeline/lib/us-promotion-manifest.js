const core = require('./us-state-publication-core');

const TEXAS_STATE = Object.freeze({ code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX' });

function assertTexasPromotionInput(stagingManifest, sources = []) {
  return core.assertStatePromotionInput(TEXAS_STATE, stagingManifest, sources);
}

function buildTexasPromotionManifest(stagingManifest, options = {}) {
  return core.buildStatePromotionManifest(TEXAS_STATE, stagingManifest, options);
}

function verifyTexasPromotionManifest(manifest, stagingManifest, options = {}) {
  return core.verifyStatePromotionManifest(TEXAS_STATE, manifest, stagingManifest, options);
}

module.exports = {
  stableJson: core.stableJson,
  sha256: core.sha256,
  sourceIdFromRow: core.sourceIdFromRow,
  sourceIdFromVerdict: core.sourceIdFromVerdict,
  assertTexasPromotionInput,
  buildTexasPromotionManifest,
  verifyTexasPromotionManifest,
  assertStatePromotionInput: core.assertStatePromotionInput,
  buildStatePromotionManifest: core.buildStatePromotionManifest,
  verifyStatePromotionManifest: core.verifyStatePromotionManifest
};
