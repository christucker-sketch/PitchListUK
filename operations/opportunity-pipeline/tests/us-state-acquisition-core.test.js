import test from 'node:test';
import assert from 'node:assert/strict';
import { assertApprovedStateSources, buildStateStagingManifest, createStateAdapter, requireState } from '../lib/us-state-acquisition-core.js';
import { applicationRouteAttestation, explicitLiveEventDates, runApprovedStateStaging } from '../lib/us-state-staging-runner.js';
import { TENNESSEE_SOURCES } from '../config/tennessee-source-registry.js';

const texas = { code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX' };
const source = { id: 'tx-test', name: 'Test Vendor Market', organiser: 'Test Market Association', locality: 'Austin', recurring: false, event_start: '2026-10-10', event_end: '2026-10-10', source_url: 'https://example.com/event', application_url: 'https://example.com/apply', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', status: 'approved-pilot' };

test('generic US state descriptor enforces jurisdiction boundary', () => {
  assert.equal(requireState(texas).jurisdiction, 'US-TX');
  assert.throws(() => requireState({ ...texas, jurisdiction: 'US-FL' }), /Invalid US acquisition state descriptor/);
});

test('approved state sources cannot escape their state boundary', () => {
  assert.equal(assertApprovedStateSources(texas, [source]), true);
  assert.throws(() => assertApprovedStateSources(texas, [{ ...source, region_code: 'FL', jurisdiction: 'US-FL' }]), /escaped US-TX boundary/);
});

test('generic staging manifest remains isolated and staging-only', () => {
  const manifest = buildStateStagingManifest(texas, { discovered_count: 1, staging_rows: [{ country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', stable_id: 'x' }] }, { sourceCount: 1 });
  assert.equal(manifest.country_code, 'US');
  assert.equal(manifest.region_code, 'TX');
  assert.equal(manifest.jurisdiction, 'US-TX');
  assert.equal(manifest.staging_only, true);
  assert.equal(manifest.automatic_publish, false);
  assert.equal(manifest.production_writes, false);
  assert.equal(manifest.rows[0].publishable, false);
  assert.equal(manifest.rows[0].quality_status, 'review');
});

test('external application routes must be attested by the live organiser page', () => {
  const source = { source_url: 'https://example.org/vendors', application_url: 'https://forms.example.org/apply' };
  assert.deepEqual(applicationRouteAttestation(source, {
    url: source.source_url,
    fetch_route: 'source',
    links: [{ text: 'Apply', url: source.application_url }]
  }), { attested: true, method: 'linked_from_live_source' });
  assert.deepEqual(applicationRouteAttestation(source, {
    url: source.source_url,
    fetch_route: 'source',
    links: [{ text: 'Unrelated', url: 'https://forms.example.org/other' }]
  }), { attested: false, method: 'not_linked_from_live_source' });
});

test('unattested external application routes are held before extraction', async () => {
  const external = { ...source, id: 'tx-unattested', source_url: 'https://example.com/vendors', application_url: 'https://forms.example.com/apply' };
  const manifest = await runApprovedStateStaging(texas, {
    sources: [external], generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      url: external.source_url,
      fetch_route: 'source',
      title: '2026 Vendor Application',
      text: 'Vendor applications are open.',
      links: []
    })
  });
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held[0].reason, 'application_route_not_attested');
});

test('explicit source holds fail closed before any network fetch', async () => {
  let fetchCount = 0;
  const heldSource = { ...source, id: 'tx-resource-limit', acquisition_hold_reason: 'cloudflare_cpu_limit_on_route' };
  const manifest = await runApprovedStateStaging(texas, {
    sources: [heldSource], generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => { fetchCount += 1; return {}; }
  });
  assert.equal(fetchCount, 0);
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held[0].reason, 'source_configured_hold');
  assert.equal(manifest.held[0].hold_detail, 'cloudflare_cpu_limit_on_route');
});

test('expired application deadlines are held before fetch and cannot reach promotion', async () => {
  let fetchCount = 0;
  const expired = { ...source, id: 'tx-expired', application_deadline: '2026-08-01' };
  const open = { ...source, id: 'tx-open', source_url: 'https://example.com/open', application_url: 'https://example.com/open/apply', application_deadline: '2026-08-28' };
  const manifest = await runApprovedStateStaging(texas, {
    sources: [expired, open],
    generatedAt: '2026-08-28T12:00:00.000Z',
    runId: 'deadline-gate-test',
    fetchPage: async ({ source: approved }) => {
      fetchCount += 1;
      return {
        url: approved.source_url,
        title: approved.name,
        text: 'Vendor application is open. Apply now for a vendor booth at this market.',
        application_url: approved.application_url
      };
    }
  });

  assert.equal(fetchCount, 1);
  assert.equal(manifest.staged_count, 1);
  assert.equal(manifest.held_count, 1);
  assert.equal(manifest.held[0].reason, 'application_deadline_passed');
  assert.equal(manifest.held[0].application_deadline, '2026-08-01');
  assert.equal(manifest.rows[0].source_id, 'tx-open');
});

test('deadlines discovered from fetched page data are held after extraction', async () => {
  const liveDeadline = { ...source, id: 'tx-live-deadline', source_url: 'https://example.com/live', application_url: 'https://example.com/live/apply' };
  const manifest = await runApprovedStateStaging(texas, {
    sources: [liveDeadline],
    generatedAt: '2026-08-28T12:00:00.000Z',
    runId: 'live-deadline-gate-test',
    fetchPage: async ({ source: approved }) => ({
      url: approved.source_url,
      title: approved.name,
      text: 'Vendor application is open. Apply now for a vendor booth at this market.',
      application_url: approved.application_url,
      application_deadline: '2026-08-01'
    })
  });

  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held_count, 1);
  assert.equal(manifest.held[0].reason, 'application_deadline_passed');
  assert.equal(manifest.held[0].application_deadline, '2026-08-01');
});

test('contradictory live application years override stale registry event dates', async () => {
  const source = {
    id: 'ga-year-mismatch', name: 'Georgia Festival Fall 2026 Vendor Application', organiser: 'Georgia Festival',
    source_url: 'https://example.com/vendors', application_url: 'https://example.com/vendors',
    source_class: 'festival-organisation', country_code: 'US', region_code: 'GA', jurisdiction: 'US-GA',
    locality: 'Fairburn', recurring: false, event_start: '2026-10-31', event_end: '2026-12-05', status: 'approved-pilot'
  };
  const state = { code: 'GA', name: 'Georgia', slug: 'georgia', jurisdiction: 'US-GA' };
  const mismatch = await runApprovedStateStaging(state, {
    sources: [source], generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      url: source.source_url,
      title: 'Vendor Applications',
      text: 'Start Vendor Application. Applications are reviewed for Spring 2027 and Fall 2027.'
    })
  });
  assert.equal(mismatch.staged_count, 0);
  assert.equal(mismatch.held_count, 1);
  assert.equal(mismatch.held[0].reason, 'live_application_year_mismatch');
  assert.deepEqual(mismatch.held[0].live_application_years, ['2027']);

  const confirmed = await runApprovedStateStaging(state, {
    sources: [source], generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      url: source.source_url,
      title: '2026 Vendor Application',
      text: 'Applications are open for Fall 2026 vendors.'
    })
  });
  assert.equal(confirmed.staged_count, 1);
  assert.equal(confirmed.held_count, 0);
});

test('past application closing dates discovered in live text are held', async () => {
  const fircrest = {
    ...source,
    id: 'wa-fircrest-holiday-market-2026',
    name: 'Fircrest Holiday Market 2026 Vendor Application',
    region_code: 'WA',
    jurisdiction: 'US-WA',
    event_start: '2026-12-06',
    event_end: '2026-12-06'
  };
  const washington = { code: 'WA', name: 'Washington', slug: 'washington', jurisdiction: 'US-WA' };
  const manifest = await runApprovedStateStaging(washington, {
    sources: [fircrest],
    generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      title: 'Fircrest 2026 Holiday Market Vendor Application',
      text: 'The event will take place on Sunday, December 6th. Applications will close on August 28th. Vendor application form.'
    })
  });
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held_count, 1);
  assert.equal(manifest.held[0].reason, 'application_deadline_passed');
  assert.equal(manifest.held[0].application_deadline, '2026-08-28');
  assert.equal(manifest.held[0].evidence_source, 'live_page_text');
});

test('contradictory exact event dates discovered in live text are held', async () => {
  const fircrest = {
    ...source,
    id: 'wa-fircrest-holiday-market-2026',
    name: 'Fircrest Holiday Market 2026 Vendor Application',
    region_code: 'WA',
    jurisdiction: 'US-WA',
    event_start: '2026-12-05',
    event_end: '2026-12-05'
  };
  const washington = { code: 'WA', name: 'Washington', slug: 'washington', jurisdiction: 'US-WA' };
  const manifest = await runApprovedStateStaging(washington, {
    sources: [fircrest],
    generatedAt: '2026-08-27T00:00:00.000Z',
    fetchPage: async () => ({
      title: 'Fircrest 2026 Holiday Market Vendor Application',
      text: 'The event will take place on Sunday, December 6th. Applications will close on August 28th. Vendor application form.'
    })
  });
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held_count, 1);
  assert.equal(manifest.held[0].reason, 'live_event_date_mismatch');
  assert.equal(manifest.held[0].source_event_date, '2026-12-05');
  assert.deepEqual(manifest.held[0].live_event_dates, ['2026-12-06']);
});

test('abbreviated live event date ranges attest both exact endpoints', () => {
  assert.deepEqual(explicitLiveEventDates('OCT 1\u20134, 2026 Tickets and more information', '2026'), [
    '2026-10-01',
    '2026-10-04'
  ]);
  const oktoberfest = TENNESSEE_SOURCES.find(item => item.id === 'tn-nashville-oktoberfest-2026');
  assert.equal(oktoberfest.event_start, '2026-10-01');
  assert.equal(oktoberfest.event_end, '2026-10-04');
});

test('production fetches hold one-off registry dates without exact live attestation', async () => {
  const manifest = await runApprovedStateStaging(texas, {
    sources: [{ ...source, source_url: 'https://example.com/event', application_url: 'https://example.com/event' }],
    generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      url: 'https://example.com/event',
      fetch_route: 'source',
      title: '2026 Vendor Application',
      text: 'Vendor applications are open for this festival.'
    })
  });
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held[0].reason, 'live_event_date_unattested');
});

test('production fetches also hold recurring registry dates without exact live attestation', async () => {
  const recurring = {
    ...source,
    id: 'tx-recurring-unattested',
    recurring: true,
    multi_event: true,
    source_url: 'https://example.com/markets',
    application_url: 'https://example.com/markets'
  };
  const manifest = await runApprovedStateStaging(texas, {
    sources: [recurring],
    generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      url: recurring.source_url,
      fetch_route: 'source',
      title: '2026 Recurring Market Vendor Applications',
      text: 'Vendor applications are open for our 2026 markets.'
    })
  });
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held[0].reason, 'live_event_date_unattested');
});

test('production recurring date ranges must match both registered endpoints', async () => {
  const recurring = {
    ...source,
    id: 'tx-recurring-mismatch',
    recurring: true,
    multi_event: true,
    source_url: 'https://example.com/markets',
    application_url: 'https://example.com/markets'
  };
  const manifest = await runApprovedStateStaging(texas, {
    sources: [recurring],
    generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      url: recurring.source_url,
      fetch_route: 'source',
      title: '2026 Recurring Market Vendor Applications',
      text: 'Festival events run October 11-12, 2026.'
    })
  });
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held[0].reason, 'live_event_date_mismatch');
});

test('live date ranges must match both registered endpoints', async () => {
  const oktoberfest = TENNESSEE_SOURCES.find(item => item.id === 'tn-nashville-oktoberfest-2026');
  const tennessee = { code: 'TN', name: 'Tennessee', slug: 'tennessee', jurisdiction: 'US-TN' };
  const manifest = await runApprovedStateStaging(tennessee, {
    sources: [{ ...oktoberfest, event_start: '2026-10-08', event_end: '2026-10-11' }],
    generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      url: oktoberfest.source_url,
      fetch_route: 'source',
      title: oktoberfest.name,
      text: 'Vendor applications close September 7, 2026. OCT 1\u20134, 2026 Tickets and more information.'
    })
  });
  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.held[0].reason, 'live_event_date_mismatch');
  assert.deepEqual(manifest.held[0].live_event_dates, ['2026-10-01', '2026-10-04']);
});

test('unrelated logistics deadlines are not emitted as application deadlines', async () => {
  const colorado = { code: 'CO', name: 'Colorado', slug: 'colorado', jurisdiction: 'US-CO' };
  const giftShow = {
    ...source,
    id: 'co-gift-show',
    name: 'Colorado Country Christmas Gift Show 2026 Exhibitor Interest Form',
    region_code: 'CO',
    jurisdiction: 'US-CO',
    locality: 'Colorado Springs',
    event_start: '2026-11-13',
    event_end: '2026-11-15'
  };
  const manifest = await runApprovedStateStaging(colorado, {
    sources: [giftShow],
    generatedAt: '2026-08-30T00:00:00.000Z',
    fetchPage: async () => ({
      title: giftShow.name,
      text: 'Vendor application and exhibitor interest are open. Booking deadline October 27, 2026. Vendor Services Discount Deadline October 26, 2026. Looking to exhibit? Get a booth quote.'
    })
  });

  assert.equal(manifest.staged_count, 1);
  assert.equal(manifest.rows[0].application_deadline, '');
});

test('state adapters require stage promote and plan contracts', () => {
  const adapter = createStateAdapter(texas, { stage() {}, promote() {}, plan() {} });
  assert.equal(adapter.state.code, 'TX');
  assert.throws(() => createStateAdapter(texas, { stage() {}, promote() {} }), /requires plan/);
});
