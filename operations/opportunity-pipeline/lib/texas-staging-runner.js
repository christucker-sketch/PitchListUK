import framework from './us-acquisition-framework.js';
import { assertCountryScopedManifest } from './country-boundary.js';
import { applicationRouteAttestation, explicitApplicationDeadlines, explicitApplicationYears, explicitLiveEventDates } from './us-state-staging-runner.js';

const { canonicalUrl, runTexasAcquisitionCycle } = framework;

function assertApprovedTexasSources(sources) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Texas staging runner requires approved sources');
  for (const source of sources) {
    if (source?.country_code !== 'US' || source?.region_code !== 'TX' || source?.jurisdiction !== 'US-TX') {
      throw new Error('Texas staging sources must remain US-TX scoped');
    }
    if (source?.status !== 'approved-pilot') throw new Error('Texas staging sources must be explicitly approved');
    if (!canonicalUrl(source?.source_url) || !canonicalUrl(source?.application_url)) {
      throw new Error('Texas staging sources require valid source and application URLs');
    }
  }
  return true;
}

function sourceForCandidate(sources, candidate) {
  const candidateUrl = canonicalUrl(candidate?.url || candidate?.source_url);
  return sources.find(source => canonicalUrl(source.source_url) === candidateUrl) || null;
}

export function buildTexasStagingManifest(report, options = {}) {
  const rows = Array.isArray(report?.staging_rows)
    ? report.staging_rows.map(row => ({ ...row, publishable: false, quality_status: 'review' }))
    : [];

  for (const row of rows) {
    if (row.publishable !== false) throw new Error('Texas staging manifest may not contain publishable rows');
  }

  const manifest = {
    run_id: options.runId || 'pli-010-texas-staging',
    generated_at: options.generatedAt || null,
    country_code: 'US',
    region_code: 'TX',
    mode: 'addition-only',
    staging_only: true,
    automatic_publish: false,
    production_writes: false,
    source_count: Number(options.sourceCount || 0),
    discovered_count: Number(report?.discovered_count || 0),
    staged_count: rows.length,
    rejected_count: Number(report?.rejected_count || 0),
    held_count: Number(report?.held_count || 0),
    duplicate_count: Number(report?.duplicate_count || 0),
    rows,
    rejected: report?.rejected || [],
    held: report?.held || [],
    duplicates: report?.duplicates || [],
    evidence_receipts: report?.evidence_receipts || []
  };

  assertCountryScopedManifest(manifest, {
    countryCode: 'US',
    jurisdictionPrefix: 'US-',
    requireAdditionOnly: true
  });

  if (!manifest.staging_only || manifest.automatic_publish !== false || manifest.production_writes !== false) {
    throw new Error('Texas staging manifest must remain staging only');
  }

  return manifest;
}

export async function runApprovedTexasStaging(options = {}) {
  const sources = options.sources || [];
  assertApprovedTexasSources(sources);
  if (typeof options.fetchPage !== 'function') throw new Error('Texas staging runner requires injected fetchPage function');

  const evidenceBySource = new Map();
  const report = await runTexasAcquisitionCycle({
    zipIndex: options.zipIndex,
    discover: async () => sources.map(source => ({ url: source.source_url, source_id: source.id })),
    fetchPage: async candidate => {
      const source = sourceForCandidate(sources, candidate);
      if (!source) throw new Error('candidate_not_in_approved_source_set');
      const fetched = await options.fetchPage({ ...candidate, source });
      const attestation = applicationRouteAttestation(source, fetched);
      if (!attestation.attested) throw new Error('application_route_not_attested');
      const liveText = `${fetched?.title || ''}\n${fetched?.text || fetched?.body || ''}`;
      const sourceYear = String(source.event_start || '').slice(0, 4);
      evidenceBySource.set(source.id, {
        source_id: source.id,
        application_route_attested: true,
        attestation_method: attestation.method,
        fetch_route: fetched?.fetch_route || 'injected',
        live_application_years: explicitApplicationYears(liveText),
        live_event_dates: explicitLiveEventDates(liveText, sourceYear),
        live_application_deadlines: explicitApplicationDeadlines(liveText, sourceYear)
      });
      return {
        ...fetched,
        url: fetched?.url || source.source_url,
        source_url: source.source_url,
        application_url: fetched?.application_url || source.application_url,
        organiser: fetched?.organiser || source.organiser,
        locality: fetched?.locality || source.locality,
        recurring: fetched?.recurring ?? source.recurring,
        multi_event: fetched?.multi_event ?? source.multi_event ?? false,
        event_start: fetched?.event_start || source.event_start || '',
        event_end: fetched?.event_end || source.event_end || ''
      };
    }
  });
  report.evidence_receipts = report.staging_rows.map(row => {
    const source = sources.find(item => canonicalUrl(item.source_url) === canonicalUrl(row.source_url)
      || canonicalUrl(item.application_url) === canonicalUrl(row.application_url));
    return evidenceBySource.get(source?.id);
  }).filter(Boolean);

  return buildTexasStagingManifest(report, {
    runId: options.runId,
    generatedAt: options.generatedAt,
    sourceCount: sources.length
  });
}

export { assertApprovedTexasSources };
