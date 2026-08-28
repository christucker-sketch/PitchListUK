'use strict';

const { verifyTexasPromotionManifest } = require('./us-promotion-manifest');

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function identityOf(row) {
  return {
    source: canonicalUrl(row?.source_url),
    application: canonicalUrl(row?.application_url),
    id: String(row?.id || row?.stable_id || '')
  };
}

function planTexasProductionSnapshot(snapshot, promotionManifest, stagingManifest, options = {}) {
  verifyTexasPromotionManifest(promotionManifest, stagingManifest, options);
  const existing = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const candidates = promotionManifest.rows || [];
  if (!Number.isInteger(promotionManifest.expected_additions) || promotionManifest.expected_additions < 1 || candidates.length !== promotionManifest.expected_additions) {
    throw new Error('Texas production preview reviewed-row count mismatch');
  }

  const existingBySource = new Map();
  const existingByApplication = new Map();
  const existingById = new Map();
  for (const row of existing) {
    const identity = identityOf(row);
    if (identity.source) existingBySource.set(identity.source, row);
    if (identity.application) existingByApplication.set(identity.application, row);
    if (identity.id) existingById.set(identity.id, row);
  }

  const seenSources = new Set();
  const seenApplications = new Set();
  const seenIds = new Set();
  const prepared = [];
  const alreadyPresent = [];

  for (const row of candidates) {
    if (row.country_code !== 'US' || row.region_code !== 'TX' || row.jurisdiction !== 'US-TX') throw new Error('Texas production row escaped US-TX boundary');
    if (row.publishable !== true || row.quality_status !== 'customer_ready') throw new Error('Texas production row is not customer ready');

    const identity = identityOf(row);
    if (!identity.source || !identity.application || !identity.id) throw new Error('Texas production row missing identity evidence');

    const matches = [existingBySource.get(identity.source), existingByApplication.get(identity.application), existingById.get(identity.id)].filter(Boolean);
    if (matches.length) {
      const first = matches[0];
      if (matches.some(match => match !== first)) throw new Error(`Texas production identity collision:${identity.id}`);
      const existingIdentity = identityOf(first);
      if (existingIdentity.source !== identity.source || existingIdentity.application !== identity.application || existingIdentity.id !== identity.id) throw new Error(`Texas production identity collision:${identity.id}`);
      alreadyPresent.push({ ...row, id: identity.id });
      continue;
    }

    if (seenSources.has(identity.source)) throw new Error(`Texas production source duplicate:${identity.source}`);
    if (seenApplications.has(identity.application)) throw new Error(`Texas production application duplicate:${identity.application}`);
    if (seenIds.has(identity.id)) throw new Error(`Texas production id duplicate:${identity.id}`);

    seenSources.add(identity.source);
    seenApplications.add(identity.application);
    seenIds.add(identity.id);
    prepared.push({ ...row, id: identity.id });
  }

  const rows = [...existing, ...prepared];
  return {
    preview: { ...snapshot, source: 'preview:pli-015-texas-controlled-apply', total: rows.length, rows },
    summary: {
      before_count: existing.length,
      after_count: rows.length,
      reviewed_rows: candidates.length,
      already_present: alreadyPresent.length,
      existing_ids: alreadyPresent.map(row => row.id),
      additions: prepared.length,
      added_ids: prepared.map(row => row.id),
      production_write_authorized: false,
      deploy_authorized: false
    }
  };
}

module.exports = { canonicalUrl, identityOf, planTexasProductionSnapshot };
