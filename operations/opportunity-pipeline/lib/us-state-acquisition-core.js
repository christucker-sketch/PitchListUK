import { assertCountryScopedManifest } from './country-boundary.js';
import framework from './us-acquisition-framework.js';

const { canonicalUrl } = framework;

function requireState(state = {}) {
  const code = String(state.code || '').trim().toUpperCase();
  const name = String(state.name || '').trim();
  const slug = String(state.slug || '').trim().toLowerCase();
  const jurisdiction = String(state.jurisdiction || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || !name || !slug || jurisdiction !== `US-${code}`) {
    throw new Error('Invalid US acquisition state descriptor');
  }
  return { ...state, code, name, slug, jurisdiction };
}

export function assertApprovedStateSources(state, sources) {
  const scoped = requireState(state);
  if (!Array.isArray(sources) || !sources.length) throw new Error(`${scoped.name} staging runner requires approved sources`);
  for (const source of sources) {
    if (source?.country_code !== 'US' || source?.region_code !== scoped.code || source?.jurisdiction !== scoped.jurisdiction) {
      throw new Error(`${scoped.name} staging source escaped ${scoped.jurisdiction} boundary`);
    }
    if (source?.status !== 'approved-pilot') throw new Error(`${scoped.name} staging sources must be explicitly approved`);
    if (!canonicalUrl(source?.source_url) || !canonicalUrl(source?.application_url)) throw new Error(`${scoped.name} staging sources require valid URLs`);
  }
  return true;
}

export function buildStateStagingManifest(state, report, options = {}) {
  const scoped = requireState(state);
  const rows = Array.isArray(report?.staging_rows) ? report.staging_rows.map(row => ({ ...row, publishable: false, quality_status: 'review' })) : [];
  const manifest = {
    run_id: options.runId || `us-${scoped.slug}-staging`,
    generated_at: options.generatedAt || null,
    country_code: 'US', region_code: scoped.code, jurisdiction: scoped.jurisdiction,
    mode: 'addition-only', staging_only: true, automatic_publish: false, production_writes: false,
    source_count: Number(options.sourceCount || 0), discovered_count: Number(report?.discovered_count || 0),
    staged_count: rows.length, rejected_count: Number(report?.rejected_count || 0), held_count: Number(report?.held_count || 0),
    duplicate_count: Number(report?.duplicate_count || 0), rows, rejected: report?.rejected || [], held: report?.held || [], duplicates: report?.duplicates || [],
    evidence_receipts: report?.evidence_receipts || []
  };
  assertCountryScopedManifest(manifest, { countryCode: 'US', jurisdictionPrefix: 'US-', requireAdditionOnly: true });
  if (manifest.region_code !== scoped.code || manifest.jurisdiction !== scoped.jurisdiction) throw new Error(`${scoped.name} staging manifest escaped state boundary`);
  return manifest;
}

export function stateSourceForCandidate(sources, candidate) {
  const candidateUrl = canonicalUrl(candidate?.url || candidate?.source_url);
  return sources.find(source => canonicalUrl(source.source_url) === candidateUrl) || null;
}

export function createStateAdapter(state, implementation = {}) {
  const scoped = requireState(state);
  const required = ['stage','promote','plan'];
  for (const key of required) if (typeof implementation[key] !== 'function') throw new Error(`${scoped.name} acquisition adapter requires ${key}`);
  return Object.freeze({ state: scoped, ...implementation });
}

export { requireState };
