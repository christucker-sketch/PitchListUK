// Offline place-level planning join. Never invent city coverage from discovery search geography
// or place reference-point proximity. Accepted input must carry verified event-venue GEOIDs.
export function planUsPlaceCoverage(index, venueRows = [], { completeSnapshot = false } = {}) {
  if (!Array.isArray(index?.places)) throw new Error('findpitches_us_place_index_required');
  if (!Array.isArray(venueRows)) throw new Error('findpitches_verified_venue_rows_required');
  const placeById = new Map(index.places.map(p => [p.geoid, p]));
  if (placeById.size !== index.places.length) throw new Error('findpitches_duplicate_place_geoid');

  const venueCounts = new Map(), countedIds = new Set(), unresolvedVenues = [];
  for (const row of venueRows) {
    const id = String(row?.opportunity_id || '').trim();
    if (!id) throw new Error('findpitches_venue_opportunity_id_required');
    if (countedIds.has(id)) throw new Error('findpitches_duplicate_venue_opportunity:'+id);
    countedIds.add(id);
    if (row.venue_evidence_status !== 'verified_event_venue' ||
        row.customer_visibility !== 'visible_at_snapshot' ||
        !row.venue_geoid) {
      unresolvedVenues.push({ opportunity_id: id, reason: 'not_verified_visible_venue_geoid' });
      continue;
    }
    const geoid = String(row.venue_geoid);
    const place = placeById.get(geoid);
    if (!place) {
      unresolvedVenues.push({ opportunity_id: id, reason: 'unknown_venue_geoid', venue_geoid: geoid });
      continue;
    }
    venueCounts.set(geoid, (venueCounts.get(geoid) || 0) + 1);
  }

  const priority = index.places.filter(p => p.tier === 'major_city' ||
    p.tier === 'large_special_government_review' ||
    (p.classification === 'review_lsad' && p.population_resolved && p.residents_2020 >= 100000));
  const targets = priority.map(p => ({
    geoid:p.geoid, state:p.state, name:p.name, classification:p.classification,
    residents_2020:p.residents_2020, priority_tier:
      p.classification === 'review_lsad' ? 'large_special_government_review' : 'major_city',
    customer_ready_count: completeSnapshot ? venueCounts.get(p.geoid) || 0 : (venueCounts.has(p.geoid) ? venueCounts.get(p.geoid) : null),
    coverage_status: completeSnapshot ? (venueCounts.has(p.geoid) ? 'known_covered' : 'known_zero')
      : (venueCounts.has(p.geoid) ? 'known_partial_only' : 'unknown_incomplete_snapshot')
  })).sort((a,b) => a.state.localeCompare(b.state) || b.residents_2020-a.residents_2020 || a.geoid.localeCompare(b.geoid));

  const states = [...new Set(index.places.map(p => p.state))].sort().map(state => {
    const rows=targets.filter(p => p.state === state);
    return {
      state,priority_places:rows.length,
      major_cities:rows.filter(p=>p.priority_tier==='major_city').length,
      large_special_government_review:rows.filter(p=>p.priority_tier==='large_special_government_review').length,
      measured_target_places:rows.filter(p=>p.customer_ready_count != null).length,
      zero_target_places: completeSnapshot ? rows.filter(p=>p.customer_ready_count===0).length : null,
      inventory_status: completeSnapshot?'complete_geoid_snapshot':'partial_or_unavailable'
    };
  });

  return Object.freeze({
    definitions: {
      scope:'Prioritised incorporated >=100k places by 2020 population and large special-government review cases. Other places remain indexed.',
      known_zero:'Only reported when completeSnapshot=true for an authoritative, all-current-customer-visible verified event-venue GEOID snapshot.',
      unresolved:'Customer-ready opportunities without verified event venue GEOID are not counted toward any city.'
    },
    complete_snapshot: Boolean(completeSnapshot), state_summary: states,
    priority_places: targets, unresolved_venue_rows: unresolvedVenues
  });
}
