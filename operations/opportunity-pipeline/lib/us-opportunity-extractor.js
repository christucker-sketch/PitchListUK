const { resolveTexasZip } = require('./us-zip-geography');
const core = require('./us-state-row-core');

const TEXAS_STATE = Object.freeze({ code: 'TX', name: 'Texas', jurisdiction: 'US-TX' });

function extractTexasOpportunity(page, options = {}) {
  return core.extractStateOpportunity(page, {
    ...options,
    state: TEXAS_STATE,
    resolvePostal: postalCode => resolveTexasZip(postalCode, { index: options.zipIndex })
  });
}

module.exports = {
  extractTexasOpportunity,
  extractStateOpportunity: core.extractStateOpportunity,
  extractUsDate: core.extractUsDate,
  extractCategories: core.extractCategories,
  extractApplicationUrl: core.extractApplicationUrl,
  stableId: core.stableId
};
