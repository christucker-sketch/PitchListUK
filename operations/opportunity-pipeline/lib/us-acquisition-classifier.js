const {
  US_VENDOR_TERMS,
  US_NEGATIVE_TERMS,
  US_VALIDATION_RULES
} = require('../config/us-acquisition-profile.js');

function normaliseText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findSignals(text, terms) {
  const haystack = normaliseText(text);
  return terms.filter(term => haystack.includes(term));
}

function classifyUsOpportunityEvidence({ title = '', body = '', sourceUrl = '', applicationUrl = '' } = {}) {
  const combined = [title, body, sourceUrl, applicationUrl].join(' ');
  const positiveSignals = findSignals(combined, US_VENDOR_TERMS);
  const negativeSignals = findSignals(combined, US_NEGATIVE_TERMS);

  if (negativeSignals.length) {
    return {
      decision: 'rejected',
      reason: 'us-negative-signal',
      positiveSignals,
      negativeSignals
    };
  }

  if (!positiveSignals.length) {
    return {
      decision: 'review',
      reason: 'no-actionable-us-vendor-signal',
      positiveSignals,
      negativeSignals
    };
  }

  return {
    decision: 'candidate',
    reason: 'us-vendor-opportunity-signal',
    positiveSignals,
    negativeSignals
  };
}

function validateTexasPilotRow(row = {}) {
  const reasons = [];
  if (row.country_code !== US_VALIDATION_RULES.requiredCountryCode) reasons.push('country_code');
  if (row.region_code !== US_VALIDATION_RULES.pilotRegionCode) reasons.push('region_code');
  if (row.jurisdiction && !String(row.jurisdiction).startsWith(US_VALIDATION_RULES.requiredJurisdictionPrefix)) reasons.push('jurisdiction');
  if (!row.source_url) reasons.push('source_url');
  if (!row.event_name) reasons.push('event_name');

  return {
    valid: reasons.length === 0,
    reasons
  };
}

module.exports = {
  normaliseText,
  findSignals,
  classifyUsOpportunityEvidence,
  validateTexasPilotRow
};
