const {
  US_VENDOR_TERMS,
  US_NEGATIVE_TERMS,
  US_VALIDATION_RULES
} = require('../config/us-acquisition-profile.js');

const CONTEXTUAL_SPONSOR_TERMS = new Set(['sponsorship only', 'become a sponsor']);
const CLOSED_APPLICATION_PATTERNS = [
  /\bapplications? (?:are |is )?(?:now )?closed\b/i,
  /\bapplications? (?:period|window) (?:has |have )?(?:now )?closed\b/i,
  /\bapplications? (?:period|window) (?:is |are )closed\b/i,
  /\bno longer accepting (?:vendor )?applications?\b/i,
  /\bvendor applications? closed\b/i
];

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
  if (CLOSED_APPLICATION_PATTERNS.some(pattern => pattern.test(combined))) {
    negativeSignals.push('applications closed');
  }
  const hardNegativeSignals = negativeSignals.filter(term => !CONTEXTUAL_SPONSOR_TERMS.has(term));
  const sponsorshipSignals = negativeSignals.filter(term => CONTEXTUAL_SPONSOR_TERMS.has(term));

  if (hardNegativeSignals.length || (sponsorshipSignals.length && !positiveSignals.length)) {
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
  CLOSED_APPLICATION_PATTERNS,
  classifyUsOpportunityEvidence,
  validateTexasPilotRow
};
