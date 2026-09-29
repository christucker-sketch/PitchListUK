import { enabledGeographies } from './catalog.mjs';
// Versioned, offline US place-index builder. Input sources:
// (1) U.S. Census 2025 Gazetteer national places .txt (tab delimited)
// (2) Census 2020 P.L. 94-171 P1 place population responses (JSON per state).
// Never assume discovery city == actual event venue. This is an acquisition planning index only.

const INCORPORATED_LSAD = new Set(['21','25','37','43','47','53']);
const CDP_LSAD = new Set(['55','57','62']);

export function parseGazetteerPlaces(tsv) {
  const lines = String(tsv).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const firstLine=lines.shift() || '';
  const delimiter=firstLine.includes('|')?'|':'\t';
  const headers = firstLine.split(delimiter).map(s=>s.trim());
  for (const field of ['USPS','GEOID','NAME','LSAD','INTPTLAT','INTPTLONG']) {
    if (!headers.includes(field)) throw new Error('census_gazetteer_missing_'+field);
  }
  const seen = new Set();
  return lines.filter(Boolean).map((line, i) => {
    const values = line.split(delimiter);
    const fields=Object.fromEntries(headers.map((header,j)=>[header,String(values[j]??'').trim()]));
    const geoid=fields.GEOID;
    if (!/^\d{7}$/.test(geoid)) throw new Error('census_gazetteer_invalid_geoid_line_'+(i+2));
    if (seen.has(geoid)) throw new Error('census_gazetteer_duplicate_geoid_'+geoid);
    seen.add(geoid);
    const lat=Number(fields.INTPTLAT), lng=Number(fields.INTPTLONG);
    if (!fields.USPS || !fields.NAME || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('census_gazetteer_invalid_place_'+geoid);
    }
    const lsad=fields.LSAD.padStart(2,'0');
    const classification=INCORPORATED_LSAD.has(lsad)?'incorporated':
      CDP_LSAD.has(lsad)?'census_designated':'review_lsad';
    return Object.freeze({
      geoid, state_fips:geoid.slice(0,2), state:fields.USPS,
      name:fields.NAME, lsad, classification,
      latitude:lat, longitude:lng
    });
  });
}

// Accept a single Census JSON response [header, ...rows] or a collection of responses.
// The P1_001N population count is from the 2020 Census, NOT the 2025 Gazetteer vintage.
export function parseCensusPlacePopulations(responses) {
  if (!Array.isArray(responses)) throw new Error('census_population_responses_required');
  const all=Array.isArray(responses[0]) && typeof responses[0][0]==='string'
    ? [responses] : responses;
  const result = new Map();
  for (const response of all) {
    if (!Array.isArray(response) || !Array.isArray(response[0])) throw new Error('census_population_invalid_response');
    const columns=response[0];
    const indices=['P1_001N','state','place'].map(field=>columns.indexOf(field));
    if (indices.some(n=>n<0)) throw new Error('census_population_missing_columns');
    for (const row of response.slice(1)) {
      const [count,state,place]=indices.map(index=>row[index]);
      const geoid=String(state)+String(place);
      if (!/^\d{7}$/.test(geoid) || !/^\d+$/.test(String(count))) throw new Error('census_population_invalid_row');
      if (result.has(geoid)) throw new Error('census_population_duplicate_'+geoid);
      result.set(geoid,Number(count));
    }
  }
  return result;
}

export function buildUsPlaceIndex(gazetteerText, populationResponses, { minMajorPopulation=100000 }={}) {
  const allPlaces=parseGazetteerPlaces(gazetteerText);
  const eligibleStates=new Set(enabledGeographies('US').map(s=>s.code));
  const excludedOutside50=allPlaces.filter(p=>!eligibleStates.has(p.state)).length;
  const places=allPlaces.filter(p=>eligibleStates.has(p.state));
  const population=parseCensusPlacePopulations(populationResponses);
  const states=new Set(places.map(p=>p.state));
  const unresolved=places.filter(p=>!population.has(p.geoid));
  // Mixed Census vintages need reconciliation. Preserve each missing place, but never
  // classify it by population or silently count it as a smaller city.
  const rows=places.map(p=>{
    const populationResolved=population.has(p.geoid);
    const residents_2020=populationResolved?population.get(p.geoid):null;
    const tier=!populationResolved?'population_unresolved':
      p.classification==='incorporated' && residents_2020>=minMajorPopulation
        ? 'major_city':p.classification==='incorporated'?'regional_or_small':'separate_review';
    return Object.freeze({...p,residents_2020,population_resolved:populationResolved,tier});
  });
  return Object.freeze({
    sources:{
      geography:'Census 2025 National Places Gazetteer',
      population:'Census 2020 P1_001N (decennial)',
      note:'Mixed source vintages: unmatched 2025 places retain null 2020 population and must be reconciled before declaring complete population coverage.'
    },
    scope:{states:states.size,excluded_outside_50_states:excludedOutside50,places:rows.length,incorporated:rows.filter(p=>p.classification==='incorporated').length,
      cdps:rows.filter(p=>p.classification==='census_designated').length,
      unclassified:rows.filter(p=>p.classification==='review_lsad').length,
      major_cities:rows.filter(p=>p.tier==='major_city').length,
      population_resolved:rows.length-unresolved.length,population_unresolved:unresolved.length,
      incorporated_population_unresolved:unresolved.filter(p=>p.classification==='incorporated').length},
    reconciliation:{
      status:unresolved.length?'population_vintage_mismatch_requires_review':'complete',
      missing_2020_population:unresolved.map(p=>({geoid:p.geoid,state:p.state,name:p.name,lsad:p.lsad,classification:p.classification}))
    },
    places:rows
  });
}
