'use strict';

const { verifyTexasPromotionManifest, APPROVED_TEXAS_SOURCE_IDS } = require('./us-promotion-manifest');

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function planTexasProductionSnapshot(snapshot, promotionManifest, stagingManifest, options = {}) {
  verifyTexasPromotionManifest(promotionManifest, stagingManifest, options);
  const existing = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const additions = promotionManifest.rows || [];
  if (additions.length !== APPROVED_TEXAS_SOURCE_IDS.length) throw new Error('Texas production preview requires exactly five additions');

  const existingSources = new Set(existing.map(row => canonicalUrl(row.source_url)).filter(Boolean));
  const existingApplications = new Set(existing.map(row => canonicalUrl(row.application_url)).filter(Boolean));
  const existingIds = new Set(existing.flatMap(row => [String(row.id || ''), String(row.stable_id || '')]).filter(Boolean));
  const seenSources = new Set();
  const seenApplications = new Set();
  const seenIds = new Set();

  const prepared = additions.map(row => {
    if (row.country_code !== 'US' || row.region_code !== 'TX' || row.jurisdiction !== 'US-TX') throw new Error('Texas production row escaped US-TX boundary');
    if (row.publishable !== true || row.quality_status !== 'customer_ready') throw new Error('Texas production row is not customer ready');
    const source = canonicalUrl(row.source_url);
    const application = canonicalUrl(row.application_url);
    const id = String(row.id || row.stable_id || '');
    if (!source || !application || !id) throw new Error('Texas production row missing identity evidence');
    if (existingSources.has(source) || seenSources.has(source)) throw new Error(`Texas production source duplicate:${source}`);
    if (existingApplications.has(application) || seenApplications.has(application)) throw new Error(`Texas production application duplicate:${application}`);
    if (existingIds.has(id) || seenIds.has(id)) throw new Error(`Texas production id duplicate:${id}`);
    seenSources.add(source); seenApplications.add(application); seenIds.add(id);
    return { ...row, id };
  });

  const rows = [...existing, ...prepared];
  return {
    preview: {
      ...snapshot,
      source: 'preview:pli-015-texas-controlled-apply',
      total: rows.length,
      rows
    },
    summary: {
      before_count: existing.length,
      after_count: rows.length,
      additions: prepared.length,
      added_ids: prepared.map(row => row.id),
      production_write_authorized: false,
      deploy_authorized: false
    }
  };
}

module.exports = { canonicalUrl, planTexasProductionSnapshot };
