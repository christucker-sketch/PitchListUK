import { buildAcquisitionContext } from './country-contract.mjs';
import { enabledUkAcquisitionAreas } from './uk-geography.mjs';

const source = (id, organisation, applicationUrl, areaCode, approvalEvidenceHash) => Object.freeze({
  id,
  organisation,
  application_url: applicationUrl,
  area_code: areaCode,
  approval_evidence_hash: approvalEvidenceHash
});

export const UK_CLOUDFLARE_CANARY = Object.freeze({
  id: 'ukcf-003-approved-direct-v1',
  enabled: false,
  trigger_ready: false,
  execution_mode: 'approved_direct_canary',
  purpose: 'Prove approved UK direct-source fetch, extraction and validation inside Cloudflare before any UK publication is enabled.',
  serper_credit_limit: 0,
  discovery_enabled: false,
  publication_enabled: false,
  source_pr_enabled: false,
  opportunity_pr_enabled: false,
  mutation_enabled: false,
  requires_control_plane_health_gate: true,
  maximum_sources: 3,
  sources: Object.freeze([
    source(
      'ukcf-borough-market',
      'Borough Market',
      'https://boroughmarket.org.uk/become-a-trader',
      'GB-ENG-LONDON',
      'a3bab5d43f72108ad8849b7f68a8976e99208e1f905349c4c4c57aa7694b035c'
    ),
    source(
      'ukcf-east-herts',
      'East Herts District Council',
      'https://eastherts.gov.uk/licences-and-registration/market-traders',
      'GB-ENG-HERTS',
      'bb0516fc921123f2bf1fb97ff70ee56bacbbd79dd9e74c7bdd99a5a5554a0297'
    ),
    source(
      'ukcf-portsmouth',
      'Portsmouth City Council',
      'https://portsmouth.gov.uk/services/business/business-locations/market-stalls-and-concessional-pitches',
      'GB-ENG-HANTS',
      '4713b86da7e964498cf1cb1ad065d8940709c0af876360007579d26d1a58c867'
    )
  ])
});

export function buildUkCloudflareCanaryPlan(config = UK_CLOUDFLARE_CANARY) {
  if (config.enabled || config.trigger_ready) throw new Error('UKCF-003 must remain dormant until an explicit control-plane health gate is passed');
  if (config.discovery_enabled || Number(config.serper_credit_limit || 0) !== 0) throw new Error('UKCF-003 must use approved direct sources only');
  if (config.publication_enabled || config.source_pr_enabled || config.opportunity_pr_enabled || config.mutation_enabled) {
    throw new Error('UKCF-003 is read-only and must not publish or mutate data');
  }
  if (!Array.isArray(config.sources) || config.sources.length < 3 || config.sources.length > Number(config.maximum_sources || 3)) {
    throw new Error('UKCF-003 requires a bounded 3-source canary set');
  }

  const areas = new Map(enabledUkAcquisitionAreas().map(area => [area.code, area]));
  const seenUrls = new Set();
  const units = config.sources.map(item => {
    const area = areas.get(item.area_code);
    if (!area) throw new Error(`Unknown UK canary acquisition area: ${item.area_code}`);
    const url = new URL(item.application_url);
    if (url.protocol !== 'https:') throw new Error(`UK canary route must use HTTPS: ${item.application_url}`);
    if (seenUrls.has(url.href)) throw new Error(`Duplicate UK canary route: ${url.href}`);
    seenUrls.add(url.href);

    return Object.freeze({
      context: buildAcquisitionContext('UK', { ...area, jurisdiction: area.code }),
      source: item,
      execution: Object.freeze({
        fetch_live_page: true,
        extract_candidate: true,
        validate_candidate: true,
        discovery: false,
        serper_credits: 0,
        create_source_pr: false,
        create_opportunity_pr: false,
        publish: false,
        mutate: false
      })
    });
  });

  return Object.freeze({
    canary_id: config.id,
    country: 'UK',
    status: 'dormant',
    trigger_ready: false,
    requires_control_plane_health_gate: true,
    snapshot_path: units[0].context.snapshot_path,
    source_count: units.length,
    units: Object.freeze(units)
  });
}
