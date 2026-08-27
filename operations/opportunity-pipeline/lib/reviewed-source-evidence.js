'use strict';

const crypto = require('node:crypto');
const { cleanHtml } = require('../acquisition/fetch-page');

const HASH_DOMAIN = Object.freeze({
  RAW_PAGE: 'raw_page_v1',
  NORMALISED_PAGE: 'normalised_page_v1',
  STABLE_NORMALISED_PAGE: 'stable_normalised_page_v1',
  NORMALISED_MATERIAL: 'normalised_material_evidence_v1'
});

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stripNonMaterialDynamicContent(text) {
  return String(text || '')
    .replace(/\s*Did you know\?\s+.*?(?=\s+A member of(?:\s|$))/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function materialEvidence(text, options = {}) {
  const anchor = options.anchor;
  if (!(anchor instanceof RegExp)) throw new Error('material_evidence_anchor_required');
  const stablePage = stripNonMaterialDynamicContent(text);
  const match = stablePage.match(anchor);
  if (!match) throw new Error('material_evidence_anchor_missing');
  const before = Number.isInteger(options.before) ? options.before : 100;
  const length = Number.isInteger(options.length) ? options.length : 4500;
  const start = Math.max(0, Number(match.index || 0) - before);
  return stablePage.slice(start, start + length).replace(/\s+/g, ' ').trim();
}

function hashValue(hash, hashDomain) {
  return { sha256: hash, hash_domain: hashDomain };
}

function reviewedSourceEvidence(html, options = {}) {
  const rawPage = String(html || '');
  const normalisedPage = cleanHtml(rawPage);
  const stableNormalisedPage = stripNonMaterialDynamicContent(normalisedPage);
  const material = materialEvidence(stableNormalisedPage, options);
  return {
    raw_page: hashValue(sha256(rawPage), HASH_DOMAIN.RAW_PAGE),
    normalised_page: hashValue(sha256(normalisedPage), HASH_DOMAIN.NORMALISED_PAGE),
    stable_normalised_page: { ...hashValue(sha256(stableNormalisedPage), HASH_DOMAIN.STABLE_NORMALISED_PAGE), text: stableNormalisedPage },
    material: { ...hashValue(sha256(material), HASH_DOMAIN.NORMALISED_MATERIAL), text: material }
  };
}

function assertHashDomainMatch(reviewed, current) {
  if (!reviewed?.sha256 || !reviewed?.hash_domain || !current?.sha256 || !current?.hash_domain) throw new Error('evidence_hash_metadata_missing');
  if (reviewed.hash_domain !== current.hash_domain) throw new Error(`evidence_hash_domain_mismatch:${reviewed.hash_domain}:${current.hash_domain}`);
  if (reviewed.sha256 !== current.sha256) throw new Error(`material_evidence_changed:${reviewed.sha256}:${current.sha256}`);
  return true;
}

function assertRequiredWording(evidence, patterns) {
  const text = evidence?.stable_normalised_page?.text;
  if (!text || !Array.isArray(patterns) || !patterns.length) throw new Error('material_evidence_wording_guard_invalid');
  if (!patterns.every(pattern => pattern instanceof RegExp && pattern.test(text))) throw new Error('material_evidence_required_wording_changed');
  return true;
}

module.exports = {
  HASH_DOMAIN,
  sha256,
  stripNonMaterialDynamicContent,
  materialEvidence,
  reviewedSourceEvidence,
  assertHashDomainMatch,
  assertRequiredWording
};
