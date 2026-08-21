const { inferKnownCounty, normaliseCounty } = require('./geo-normalise');
const { inferMarket } = require('./market-routing');

const BROAD_AREAS = new Set([
  'London', 'Scotland', 'Wales', 'Northern Ireland', 'North East', 'North West',
  'Yorkshire & The Humber', 'Midlands', 'West Midlands', 'South West', 'South East',
  'Ireland', 'Ireland - Dublin', 'Ireland - Eastern', 'Ireland - Midland', 'Ireland - Border',
  'Ireland - West', 'Ireland - Mid-West', 'Ireland - South-East', 'Ireland - South-West'
]);

const ROUTE_PATTERNS = [
  ['street_trading_pitch', /(street trader|street trading|street.?food corner|street trading consent|street trading pitch)/i],
  ['permanent_pitch', /(permanent pitch|permanent stall|permanent trader|resident trader|fixed pitch|fixed location)/i],
  ['residency', /(residency|kitchen residency|food residency|trader residency)/i],
  ['food_court', /(food court|food village|street food village)/i],
  ['farmers_market', /(farmers'? market|farm shop market|produce market)/i],
  ['artisan_market', /(artisan market|makers market|maker market|craft market|handmade market)/i],
  ['night_market', /(night market|twilight market|evening market)/i],
  ['vintage_market', /(vintage market|antiques fair|antique fair|flea market)/i],
  ['indoor_market', /(indoor market|covered market)/i],
  ['community_market', /(community market|local market|village market)/i],
  ['christmas_market', /(christmas market|festive market|winter market|easter market)/i],
  ['food_festival', /(food festival|food and drink festival|taste of|feast|street food festival)/i],
  ['beer_festival', /(beer festival|cider festival|wine festival|gin festival|ale festival)/i],
  ['music_festival', /(music festival|concert series|live music festival|folk festival)/i],
  ['cultural_festival', /(cultural festival|culture festival|mela|pride|religious festival|heritage festival|arts festival|film festival|literary festival|flower festival)/i],
  ['seasonal_event', /(halloween|bonfire|firework|fireworks|easter|harvest festival|summer festival|christmas switch.?on|valentine|mother'?s day|father'?s day)/i],
  ['agricultural_show', /(agricultural show|county show|livestock show|rural show|highland games|game fair|equestrian)/i],
  ['sporting_event', /(marathon|half marathon|fun run|cycling event|triathlon|football|rugby|cricket|motorsport|horse racing|sailing event|airshow)/i],
  ['council_event', /(council event|town centre event|city centre event|high street event|regeneration event|park event|seafront event|beach event|civic event|\.gov\.uk|\.gov\.ie|licen[cs]e|permit|casual trading)/i],
  ['community_event', /(village fete|fete|carnival|parade|community event|remembrance event)/i],
  ['commercial_event', /(corporate event|office pop.?up|business park|university campus|college event|school event|hospital event|shopping centre|retail park|supermarket event|showroom event)/i],
  ['private_hire', /(wedding|birthday|private party|private hire|staff event|product launch|corporate catering|awards event)/i],
  ['exhibition', /(conference|exhibition|trade show|expo)/i],
  ['entertainment_event', /(outdoor cinema|theatre event|comedy event|funfair|circus)/i],
  ['visitor_attraction', /(castle|stately home|national trust|english heritage|zoo|safari park|museum|visitor attraction|holiday park)/i],
  ['brewery_taproom', /(brewery|taproom|distillery|vineyard)/i],
  ['market', /(market|markets|retail market|wholesale market|stallholder)/i],
  ['festival', /(festival|fest|carnival)/i],
  ['concession', /(concession|catering pitch|food vendor|trade stand|vendor|caterer|pitch)/i]
];

const TAG_PATTERNS = [
  ['halal', /\bhalal\b/i],
  ['burger', /\b(burger|burgers|smash burger|chopped cheese|cheesesteak|philly)\b/i],
  ['loaded_fries', /\b(fries|loaded fries|dirty fries)\b/i],
  ['pizza', /\b(pizza|pizzeria)\b/i],
  ['mexican', /\b(mexican|burrito|burritos|taco|tacos|quesadilla)\b/i],
  ['greek', /\b(greek|gyros|souvlaki)\b/i],
  ['indian', /\b(indian|curry|curries|pakora|samosa)\b/i],
  ['chinese', /\b(chinese|dumpling|dim sum)\b/i],
  ['thai', /\b(thai|pad thai)\b/i],
  ['korean', /\b(korean|kimchi|bulgogi)\b/i],
  ['japanese', /\b(japanese|sushi|ramen|katsu|anime and manga)\b/i],
  ['vietnamese', /\b(vietnamese|banh mi|pho)\b/i],
  ['caribbean', /\b(caribbean|jerk|jamaican)\b/i],
  ['turkish', /\b(turkish|kebab|doner)\b/i],
  ['lebanese', /\b(lebanese|shawarma|falafel)\b/i],
  ['african', /\b(african|jollof|zambezi)\b/i],
  ['italian', /\b(italian|pasta|arancini|risotto)\b/i],
  ['bbq', /\b(bbq|barbecue|smokehouse|smoked meat)\b/i],
  ['seafood', /\b(seafood|fish|oyster|lobster|prawn)\b/i],
  ['fried_chicken', /\b(fried chicken|chicken wings|wings)\b/i],
  ['hotdogs', /\b(hot dog|hotdog|hotdogs)\b/i],
  ['wraps', /\b(wrap|wraps)\b/i],
  ['sandwiches', /\b(sandwich|sandwiches|toastie|toasties)\b/i],
  ['pies', /\b(pie|pies|sausage roll|sausage rolls|pasty|pasties)\b/i],
  ['jacket_potatoes', /\b(jacket potato|jacket potatoes|baked potato)\b/i],
  ['coffee', /\b(coffee|espresso|barista)\b/i],
  ['speciality_coffee', /\b(speciality coffee|specialty coffee|artisan coffee)\b/i],
  ['tea', /\b(tea|bubble tea)\b/i],
  ['bubble_tea', /\bbubble tea\b/i],
  ['smoothies', /\b(smoothie|smoothies)\b/i],
  ['milkshakes', /\b(milkshake|milkshakes)\b/i],
  ['fresh_juice', /\b(fresh juice|juice bar|lemonade)\b/i],
  ['cocktails', /\b(cocktail|cocktails)\b/i],
  ['craft_beer', /\b(craft beer|beer festival|brewery|taproom)\b/i],
  ['wine', /\b(wine|vineyard)\b/i],
  ['gin', /\b(gin|distillery)\b/i],
  ['cider', /\b(cider|cider festival)\b/i],
  ['hot_chocolate', /\bhot chocolate\b/i],
  ['dessert', /\b(dessert|waffle|waffles|crepe|crepes|churro|churros|pancake|pancakes|cake|cakes|brownie|brownies|cookie|cookies|cheesecake|fudge|sweet)\b/i],
  ['donuts', /\b(donut|donuts|doughnut|doughnuts)\b/i],
  ['ice_cream', /\b(ice cream|gelato|whippy|frozen yoghurt|frozen yogurt)\b/i],
  ['candyfloss', /\b(candyfloss|candy floss|sweets)\b/i],
  ['vegan', /\b(vegan|plant.?based)\b/i],
  ['vegetarian', /\bvegetarian\b/i],
  ['gluten_free', /\bgluten.?free\b/i],
  ['vegan_options', /\bvegan options?\b/i],
  ['gluten_free_options', /\bgluten.?free options?\b/i],
  ['nut_free', /\bnut.?free\b/i],
  ['kids_menu', /\b(kids menu|children'?s menu|family menu)\b/i],
  ['healthy', /\b(healthy|health food|salad|wellness)\b/i],
  ['organic', /\borganic\b/i],
  ['bakery', /\b(bakery|baker|bread|sourdough|pastry|pastries)\b/i],
  ['cheese', /\b(cheese|cheesemonger)\b/i],
  ['honey', /\bhoney\b/i],
  ['preserves', /\b(preserve|preserves|jam|chutney)\b/i],
  ['olives', /\bolives?\b/i],
  ['spices', /\b(spice|spices|seasoning)\b/i],
  ['oils', /\b(oil|oils|olive oil)\b/i],
  ['charcuterie', /\b(charcuterie|cured meat|salami)\b/i],
  ['confectionery', /\b(confectionery|sweets|chocolate)\b/i],
  ['drinks', /\b(drinks|bar|beer|gin|cocktail|juice|smoothie|beverage|soft drinks)\b/i],
  ['breakfast', /\b(breakfast|brunch)\b/i],
  ['late_night', /\b(late night|evening trade|night market|twilight market)\b/i],
  ['family_friendly', /\b(family friendly|family event|family fun|kids|children)\b/i],
  ['dog_friendly', /\b(dog friendly|dogs welcome)\b/i],
  ['cashless', /\bcashless\b/i],
  ['generator_required', /\b(generator required|own generator|provide.*generator|no power provided)\b/i],
  ['electric_only', /\b(electric only|no gas|electric supply|power only)\b/i],
  ['low_smoke', /\b(low smoke|no smoke|smokeless|no charcoal)\b/i],
  ['high_volume', /\b(high volume|large footfall|high footfall|busy event|thousands of visitors|visitor numbers|attendees)\b/i],
  ['local_producer', /\b(local producer|local producers|locally produced|local suppliers)\b/i],
  ['award_winning', /\baward.?winning\b/i],
  ['eco_friendly', /\b(eco.?friendly|sustainable|sustainability|green event)\b/i],
  ['plastic_free', /\b(plastic.?free|no single use plastic|compostable packaging)\b/i],
  ['instagrammable', /\b(instagrammable|photo opportunity|social media friendly)\b/i],
  ['queue_magnet', /\b(queue|queues|crowd.?pleaser|popular trader)\b/i],
  ['premium', /\b(premium|upmarket|luxury|high end|artisan)\b/i],
  ['budget', /\b(budget|low cost|affordable)\b/i],
  ['street_food', /\b(street food|food truck|mobile cater|food vendor|food trader|hot food|catering)\b/i],
  ['food_festival', /\b(food festival|food and drink festival|taste of|feast)\b/i],
  ['farmers_market', /\bfarmers'? market\b/i],
  ['artisan_market', /\b(artisan market|makers market|craft market|handmade market)\b/i],
  ['night_market', /\b(night market|twilight market)\b/i],
  ['market', /\b(market|markets|stallholder|retail market|wholesale market)\b/i],
  ['music_festival', /\bmusic festival\b/i],
  ['cultural_festival', /\b(cultural festival|culture festival|mela|pride|heritage festival|arts festival|film festival|literary festival)\b/i],
  ['festival', /\b(festival|fest|carnival)\b/i],
  ['council_route', /\b(council|\.gov\.uk|licen[cs]e|permit|street trading)\b/i],
  ['christmas', /\b(christmas|festive|winter market)\b/i],
  ['agricultural_show', /\b(agricultural show|county show|livestock show|rural show)\b/i],
  ['county_show', /\b(county show|agricultural show|highland games|country show|game fair)\b/i],
  ['sporting_event', /\b(marathon|fun run|cycling|triathlon|football|rugby|cricket|motorsport|horse racing|airshow)\b/i],
  ['commercial_event', /\b(corporate event|office pop.?up|business park|university campus|college event|school event|hospital event|shopping centre|retail park|supermarket event|showroom event)\b/i],
  ['private_hire', /\b(wedding|birthday|private party|corporate catering|staff event|product launch|conference|awards event)\b/i],
  ['visitor_attraction', /\b(castle|stately home|national trust|english heritage|zoo|safari park|museum|visitor attraction|holiday park)\b/i],
  ['brewery_taproom', /\b(brewery|taproom|distillery|vineyard)\b/i],
  ['mobile_van', /\b(mobile van|catering van|food van)\b/i],
  ['gazebo', /\bgazebo\b/i],
  ['trailer', /\btrailer\b/i],
  ['horsebox', /\bhorsebox\b/i],
  ['converted_bus', /\b(converted bus|bus conversion|double decker)\b/i],
  ['food_truck', /\b(food truck|truck|trailer|van|mobile unit|gazebo|pitch)\b/i],
  ['handmade', /\b(handmade|maker|makers)\b/i],
  ['crafts', /\b(craft|crafts|artisan)\b/i],
  ['jewellery', /\b(jewellery|jewelry)\b/i],
  ['candles', /\bcandles?\b/i],
  ['clothing', /\b(clothing|fashion|apparel)\b/i],
  ['homeware', /\b(homeware|home goods)\b/i],
  ['pet_products', /\b(pet products?|dog treats?)\b/i],
  ['plants', /\b(plants?|flowers?|florist)\b/i],
  ['artwork', /\b(artwork|prints?|artist)\b/i],
  ['pottery', /\b(pottery|ceramics?)\b/i],
  ['woodwork', /\b(woodwork|wooden)\b/i],
  ['leather', /\bleather\b/i],
  ['toys', /\btoys?\b/i],
  ['gifts', /\bgifts?\b/i],
  ['skincare', /\b(skincare|cosmetics?)\b/i],
  ['artisan', /\b(artisan|craft|maker|producer|gifts|jewellery)\b/i]
];

const ORGANISER_PATTERNS = [
  ['parish_council', /(parish council)/i],
  ['town_council', /(town council)/i],
  ['local_council', /(\.gov\.uk|council|borough|district council|city council|county council|local authority)/i],
  ['BID', /\b(BID|business improvement district)\b/i],
  ['business_association', /(business association|chamber of commerce|traders association|business group)/i],
  ['market_operator', /(markets?|market operator|farmers'? market|street market|covered market|trading standards)/i],
  ['festival_company', /(festival|fest|presents|productions|live events?)/i],
  ['event_agency', /(event agency|event management|events? ltd|events? limited|event organiser|event production)/i],
  ['agricultural_society', /(agricultural society|county show|showground|highland games|game fair|rural show)/i],
  ['racecourse', /(racecourse|horse racing)/i],
  ['showground', /(showground)/i],
  ['national_trust', /(national trust)/i],
  ['english_heritage', /(english heritage)/i],
  ['wedding_venue', /(wedding venue|weddings|wedding barn|wedding estate)/i],
  ['private_landowner', /(private landowner|landowner|estate|stately home|castle|manor|hall|farm|gardens)/i],
  ['visitor_attraction', /(museum|zoo|safari park|visitor attraction|heritage)/i],
  ['shopping_centre', /(shopping centre|shopping center|retail park|outlet|mall|high street)/i],
  ['university', /(university|campus|students'? union)/i],
  ['college', /(college)/i],
  ['school', /(school)/i],
  ['healthcare', /(hospital|nhs|healthcare|hospice)/i],
  ['charity', /(charity|trust|rotary|lions club|church|volunteer|not.?for.?profit|cic\b)/i],
  ['football_club', /(football club|\bfc\b)/i],
  ['rugby_club', /(rugby club|\brfc\b)/i],
  ['sports_club', /(cricket club|sports club|athletics|marathon|triathlon|cycling club)/i],
  ['brewery_taproom', /(brewery|taproom|distillery|vineyard|winery)/i],
  ['corporate', /(business park|corporate|office|company|limited|ltd|plc|showroom|supermarket)/i],
  ['event_platform', /(jotform|wufoo|eventowl|eventbrite|tickettailor|forms\.gle|docs\.google)/i],
  ['unknown', /$^/]
];

const BAD_ROUTE = /(facebook\.com\/groups|facebook\.com\/pages|login|sign.?in|parking|tickets?|visitor|volunteer|careers?|jobs?|news|article|risk assessment|too expensive|markets-policy|market enforcement|policy and application|skip to main content.*returns to|assisted access.*self care)/i;
const OFFICIAL_ROUTE = /(\.gov\.uk|\.gov\.ie|\.org\.uk|\.co\.uk|\.uk|\.ie|jotform\.com|wufoo\.com|forms\.gle|docs\.google\.com|eventowl\.co\.uk)/i;
const APPLICATION_ROUTE = /(apply|application|booking|form|register|enquir|trade.?with.?us|trader|stallholder|vendor|exhibitor|caterer|concession|pitch)/i;

function textFor(row) {
  return [
    row.event_name,
    row.organiser,
    row.location,
    row.region,
    row.vendor_categories,
    row.source_url,
    row.application_url,
    row.notes,
    row.quality_reasons,
    row.evidence_text
  ].filter(Boolean).join(' ');
}

function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function mergeTags(existing, generated) {
  const tags = new Set(String(existing || '').split(/[;,]/).map(v => v.trim()).filter(Boolean));
  for (const tag of generated) tags.add(tag);
  return [...tags].sort().join(';');
}

function inferArea(row) {
  const current = normaliseCounty(row.region, row.location);
  const inferred = inferKnownCounty(
    row.region,
    row.location,
    row.event_name,
    row.organiser,
    row.source_url,
    row.application_url,
    row.notes,
    row.evidence_text
  );
  const existingConfidence = String(row.area_confidence || '').toLowerCase();
  if (current && current !== 'Unknown') {
    if (['exact', 'inferred', 'broad'].includes(existingConfidence)) {
      return {
        area: current,
        confidence: existingConfidence,
        shouldFill: false
      };
    }
    return {
      area: current,
      confidence: BROAD_AREAS.has(current) ? 'broad' : 'exact',
      shouldFill: false
    };
  }
  if (inferred !== 'Unknown') {
    return {
      area: inferred,
      confidence: BROAD_AREAS.has(inferred) ? 'broad' : 'inferred',
      shouldFill: true
    };
  }
  return { area: 'Unknown', confidence: 'unknown', shouldFill: false };
}

function inferOrganiserType(row) {
  const text = [
    row.organiser,
    row.source_url,
    row.application_url,
    row.evidence_text
  ].filter(Boolean).join(' ');
  const hit = ORGANISER_PATTERNS.find(([, pattern]) => pattern.test(text));
  return hit ? hit[0] : 'unknown';
}

function inferRouteType(row) {
  const text = textFor(row);
  const hit = ROUTE_PATTERNS.find(([, pattern]) => pattern.test(text));
  return hit ? hit[0] : 'other';
}

function inferBuyerFitTags(row) {
  const text = textFor(row);
  return TAG_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function recalculateConfidence(row, enrichment) {
  const text = textFor(row);
  const source = row.source_url || '';
  const application = row.application_url || '';
  const sourceDomain = domain(source);
  const appDomain = domain(application);
  let score = 30;
  const reasons = [];

  const existingReasons = String(row.quality_reasons || '');
  if (/(uk_signal|territory_signal)/.test(existingReasons)) score += 12;
  if (/application_language/.test(existingReasons)) score += 14;
  if (/event_language/.test(existingReasons)) score += 8;
  if (/http_application_url/.test(existingReasons)) score += 6;
  if (/(gov_uk_source|gov_ie_source)/.test(existingReasons)) score += 8;
  if (/deep_source_ok/.test(existingReasons)) score += 3;
  if (/deep_application_ok/.test(existingReasons)) score += 3;
  if (/deep_source_failed/.test(existingReasons)) score -= 8;
  if (/deep_application_failed/.test(existingReasons)) score -= 6;
  if (source && OFFICIAL_ROUTE.test(source)) { score += 8; reasons.push('official_source'); }
  if (application && /^https?:\/\//.test(application) && APPLICATION_ROUTE.test(application)) { score += 10; reasons.push('application_route'); }
  if (row.contact_email) { score += 4; reasons.push('contact_route'); }
  if (row.event_start || row.application_deadline) { score += 5; reasons.push('dated'); }
  if (row.last_checked) { score += 5; reasons.push('checked'); }
  if (['exact', 'inferred'].includes(enrichment.area_confidence)) { score += 8; reasons.push('area_known'); }
  if (enrichment.area_confidence === 'broad') { score += 3; reasons.push('area_broad'); }
  if (enrichment.route_type !== 'other') { score += 4; reasons.push(`route_${enrichment.route_type}`); }
  if (enrichment.buyer_fit_tags.includes('street_food') || enrichment.buyer_fit_tags.includes('food_festival')) { score += 4; reasons.push('food_fit'); }
  if (sourceDomain && appDomain && sourceDomain !== appDomain && !/jotform|wufoo|forms\.gle|docs\.google|eventowl/.test(appDomain)) {
    score -= 6;
    reasons.push('cross_domain_route');
  }
  if (!application) { score -= 15; reasons.push('missing_application_route'); }
  const manualReview = BAD_ROUTE.test(text);
  if (manualReview) { score -= 35; reasons.push('manual_review_route'); }
  if (enrichment.area_confidence === 'unknown') { score -= 20; reasons.push('area_unknown'); }

  const cappedScore = Math.max(0, Math.round(score));
  const confidenceCap = manualReview || enrichment.area_confidence === 'unknown'
    ? 'medium'
    : enrichment.area_confidence === 'broad'
      ? 'medium'
      : 'high';
  let nextConfidence = cappedScore >= 90 ? 'high' : cappedScore >= 65 ? 'medium' : 'low';
  if (confidenceCap === 'medium' && nextConfidence === 'high') nextConfidence = 'medium';
  const qualityStatus = cappedScore >= 90 && ['exact', 'inferred'].includes(enrichment.area_confidence) && !manualReview && reasons.includes('application_route')
    ? 'customer_ready'
    : cappedScore >= 65
      ? 'review'
      : 'needs_work';
  return { confidence: nextConfidence, quality_status: qualityStatus, score: cappedScore, reasons };
}

function enrichQuality(row) {
  const area = inferArea(row);
  const routeType = inferRouteType(row);
  const organiserType = inferOrganiserType(row);
  const generatedTags = inferBuyerFitTags(row);
  const market = inferMarket({
    ...row,
    region: area.shouldFill ? area.area : row.region,
    location: area.shouldFill ? area.area : row.location
  });
  const enrichment = {
    area_confidence: area.confidence,
    route_type: routeType,
    organiser_type: organiserType,
    buyer_fit_tags: mergeTags(row.buyer_fit_tags, generatedTags),
    ...market
  };
  enrichment.buyer_fit_tags_list = enrichment.buyer_fit_tags ? enrichment.buyer_fit_tags.split(';') : [];
  const confidence = recalculateConfidence(row, {
    area_confidence: enrichment.area_confidence,
    route_type: enrichment.route_type,
    buyer_fit_tags: enrichment.buyer_fit_tags_list
  });
  const next = {
    ...row,
    area_confidence: enrichment.area_confidence,
    route_type: enrichment.route_type,
    organiser_type: enrichment.organiser_type,
    buyer_fit_tags: enrichment.buyer_fit_tags,
    country: enrichment.country,
    jurisdiction: enrichment.jurisdiction,
    currency: enrichment.currency,
    market_domain: enrichment.market_domain,
    tax_region: enrichment.tax_region,
    confidence: confidence.confidence,
    quality_status: confidence.quality_status,
    quality_score: String(confidence.score),
    quality_reasons: mergeTags(row.quality_reasons, confidence.reasons)
  };
  if (area.shouldFill) {
    if (!next.region || /^unknown$/i.test(next.region)) next.region = area.area;
    if (!next.location || /^unknown$/i.test(next.location)) next.location = area.area;
  }
  const changed = ['region', 'location', 'area_confidence', 'route_type', 'organiser_type', 'buyer_fit_tags', 'country', 'jurisdiction', 'currency', 'market_domain', 'tax_region', 'confidence', 'quality_status', 'quality_score', 'quality_reasons']
    .some(field => String(next[field] || '') !== String(row[field] || ''));
  return { changed, row: next, area: area.area, area_confidence: area.confidence, route_type: routeType, buyer_fit_tags: enrichment.buyer_fit_tags_list, confidence };
}

module.exports = {
  inferArea,
  inferOrganiserType,
  inferRouteType,
  inferBuyerFitTags,
  recalculateConfidence,
  enrichQuality
};
