// Offline, v2-only nationwide city discovery plan. This does NOT schedule
// Serper, change Cloudflare or treat an unknown venue as zero coverage.
const POPULATION_MIN=100000;
const VALID_GEOID=/^\\d{7}$/;
export function planUsCityGapFill(index, verifiedVenueRows=[],{
  maxSeeds=100,completeVenueSnapshot=false,includeCdps=false
}={}) {
  if(!Array.isArray(index?.places)||!Array.isArray(verifiedVenueRows)) throw new Error('us_city_index_and_venues_required');
  if(!Number.isInteger(maxSeeds)||maxSeeds<1||maxSeeds>500)throw new Error('us_city_invalid_seed_cap');
  const places=new Map();
  for(const p of index.places){
    if(!VALID_GEOID.test(String(p?.geoid||''))||!p.state||!p.name||places.has(p.geoid))throw new Error('us_city_invalid_or_duplicate_geoid');
    places.set(p.geoid,p);
  }
  const seen=new Set(),verified=new Map(),unresolved=[];
  for(const v of verifiedVenueRows){
    const id=String(v?.opportunity_id||'');
    if(!id||seen.has(id))throw new Error('us_city_duplicate_or_missing_opportunity');
    seen.add(id);
    if(v.customer_visibility!=='visible_at_snapshot'||v.venue_evidence_status!=='verified_event_venue'||!v.venue_geoid){
      unresolved.push({opportunity_id:id,reason:'not_current_visible_verified_venue'});
      continue;
    }
    const p=places.get(String(v.venue_geoid));
    if(!p){unresolved.push({opportunity_id:id,reason:'unknown_venue_geoid'});continue;}
    verified.set(p.geoid,(verified.get(p.geoid)||0)+1);
  }
  const target=[...places.values()].filter(p=>p.classification==='incorporated' ||
    p.tier==='large_special_government_review' || (includeCdps&&p.classification==='census_designated'));
  const sorted=target.sort((a,b)=>{
    const tier=p=>p.tier==='major_city'?0:p.tier==='large_special_government_review'?1:
      p.classification==='incorporated'&&p.population_resolved?2:
      p.classification==='incorporated'?3:4;
    return tier(a)-tier(b) || (b.residents_2020||0)-(a.residents_2020||0) ||
      a.state.localeCompare(b.state)||a.geoid.localeCompare(b.geoid);
  });
  const states=[...new Set(index.places.map(p=>p.state))].sort();
  const stateQueue=new Map(states.map(state=>[state,sorted.filter(p=>p.state===state)]));
  const seeds=[],selected=new Set();
  // One first seed per state ensures that a populous state cannot monopolise
  // targeted expansion before all 50 states have a planning opportunity.
  for(const state of states){
    const p=stateQueue.get(state)[0];
    if(p&&seeds.length<maxSeeds){seeds.push(p);selected.add(p.geoid);}
  }
  // Next seeds by nationally ranked tier/population, no arbitrary per-state
  // quota after the initial 50-state coverage pass.
  for(const p of sorted){
    if(seeds.length>=maxSeeds)break;
    if(!selected.has(p.geoid)){seeds.push(p);selected.add(p.geoid);}
  }
  const seedQueue=seeds.map(p=>{
    const observed=verified.get(p.geoid)||0;
    const match=p.name.replace(/\\s+(?:city|town|village|borough|municipality)$/i,'');
    return {geoid:p.geoid,place:p.name,state:p.state,
      classification:p.classification,tier:p.tier,
      population_resolved:Boolean(p.population_resolved),
      customer_ready_verified_count:observed||(!completeVenueSnapshot?null:0),
      coverage_status:observed?'verified_partial_coverage':
        completeVenueSnapshot?'known_zero':'unknown_unresolved_venue_audit',
      // Suggested search text only, for a later rate-controlled v2 controller.
      suggested_queries:[
        match+' '+p.state+' festival fair vendor application',
        match+' '+p.state+' farmers market become a vendor'
      ]
    };
  });
  return Object.freeze({
    geography_vintage:index.sources?.geography||'unrecorded',
    population_vintage:index.sources?.population||'unrecorded',
    inventory_is_complete:Boolean(completeVenueSnapshot),
    states:states.length,
    addressable_incorporated:[...places.values()].filter(p=>p.classification==='incorporated').length,
    separate_cdps:[...places.values()].filter(p=>p.classification==='census_designated').length,
    unresolved_population_incorporated:[...places.values()].filter(p=>p.classification==='incorporated'&&!p.population_resolved).length,
    eligible_targets:target.length,
    selected_seeds:seedQueue.length,
    remaining_addressable:target.length-seedQueue.length,
    selected:seedQueue,unresolved_venue_rows:unresolved,
    note:'Offline discovery planning, not executed queries. An unverified or missing venue is UNKNOWN unless a complete current verified-place snapshot exists. No 19k-query brute-force sweep.'
  });
}
