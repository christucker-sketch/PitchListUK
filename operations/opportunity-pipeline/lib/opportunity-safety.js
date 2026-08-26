'use strict';

const crypto = require('node:crypto');
const { extractDateFields } = require('./date-extraction');
const { hostname, sourceRuleFor } = require('../config/sources');

const TRACKING_PARAMETERS = /^(utm_.+|gclid|dclid|fbclid|msclkid|srsltid|mc_[ce]id|ref|source|campaign)$/i;
const UK_HOST = /(?:\.gov\.uk|\.nhs\.uk|\.police\.uk|\.ac\.uk|\.org\.uk|\.co\.uk|\.uk)$/i;
const NON_UK_HOST = /(?:\.gov|\.us|\.ca|\.com\.au|\.co\.nz)$/i;
const UK_POSTCODE = /\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2}))\b/i;
const NON_UK_EVIDENCE = /\b(?:Alabama|Connecticut|Delaware|Kentucky|Maryland|Massachusetts|Nebraska|New Hampshire|New Jersey|New York|Ohio|Pennsylvania|Rhode Island|Tennessee|Texas|Vermont|Virginia|Wisconsin|Ontario|Nova Scotia|Canada|Manchester,?\s*TN|Bristol,?\s*(?:CT|RI|TN|VA)|Norfolk,?\s*VA|New London,?\s*CT|Cheshire,?\s*(?:CT|NH)|Suffolk,?\s*VA|Birmingham,?\s*AL|Newark,?\s*DE|Cornwall,?\s*NY|Essex,?\s*MD|Cardiff,?\s*CA|Wylie,?\s*Texas)\b/i;
const FOREIGN_FIXTURES = /(?:berkshireyogafestival|vendorsmap\.com\/cities\/manchester-tn|cheshirefair\.org|cheshirefestival\.com|cardiff101\.com|bristolmerchantsassociation|bristolfarmersmarket\.com|berkshirepride\.org|birminghamal\.gov|hbwinefest\.com|norfolkagsociety\.com|essexdayfestival\.com|newcastlede\.gov|ngfarmmarket\.com|norfolk\.gov|newlondonct\.gov|vtfarmersmarket\.org|norfolkvafarmersmarket\.com|cornwallchamber\.org|amptrunning\.com|lctourism\.com|suffolkpeanutfest\.com)/i;
const DIRECT_EVIDENCE = /\b(apply|application|register|registration|booking|become a trader|trade with us|vendor form|stallholder form|exhibitor form|caterer form|street trading consent|street trader licence|pitch enquiry)\b/i;
const ONE_OFF_EVENT = /\b(festival|fair|show|christmas market|winter wonderland|carnival|feast|fireworks|bonfire|race|marathon)\b/i;
const GENERIC_TITLE = /^(street trading|street trading licence|street trader licence|apply to trade|vendor application|caterers|market)$/i;
const AVAILABLE_PITCH = /\b(?:available (?:trading )?pitch(?:es)?|pitch(?:es)? available|vacant pitch(?:es)?|traders? wanted|seeking (?:food |market )?traders?|new (?:traders|faces) (?:are )?always welcome(?:d)?|apply to trade at|apply for (?:a )?(?:market )?stall|apply to sell at (?:one of )?(?:our |the )?markets?|market stall application|how to apply for (?:a )?stall|book (?:a )?pitch at|trader applications? (?:are )?open|stallholder applications? (?:are )?open|vendor applications? (?:are )?open)\b/i;

function canonicalUrl(value) {
  try {
    const parsed = new URL(String(value || '').replace(/&amp;/g, '&'));
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    for (const key of [...parsed.searchParams.keys()]) if (TRACKING_PARAMETERS.test(key)) parsed.searchParams.delete(key);
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normaliseText(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function stableOpportunityId(row) {
  const source = canonicalUrl(row.source_url);
  const identity = source
    ? ['source', source, String(row.event_start || '')].join('|')
    : ['semantic', normaliseText(row.event_name), normaliseText(row.organiser), normaliseText(row.location || row.region), String(row.event_start || '')].join('|');
  return `opp_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
}

function duplicateKeys(row) {
  const title = normaliseText(row.event_name)
    .replace(/\b(application|form|vendor|trader|stallholder|exhibitor|apply|trade|become|register|registration|at|to|for|the)\b/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\s+/g, ' ').trim();
  const place = normaliseText(row.location || row.region);
  const date = String(row.event_start || '');
  return new Set([
    canonicalUrl(row.source_url) && `source:${canonicalUrl(row.source_url)}`,
    canonicalUrl(row.application_url) && `application:${canonicalUrl(row.application_url)}`,
    title && place && `event:${title}|${place}|${date}`,
    title && normaliseText(row.organiser) && `organiser:${title}|${normaliseText(row.organiser)}|${date}`,
  ].filter(Boolean));
}

function mergeDuplicates(rows) {
  const groups = [];
  const keyToGroup = new Map();
  for (const row of rows) {
    const keys = duplicateKeys(row);
    const indexes = [...new Set([...keys].map(key => keyToGroup.get(key)).filter(index => index !== undefined))];
    const index = indexes.length ? indexes[0] : groups.length;
    if (!groups[index]) groups[index] = [];
    groups[index].push(row);
    for (const key of keys) keyToGroup.set(key, index);
    for (const extra of indexes.slice(1)) {
      if (!groups[extra]) continue;
      groups[index].push(...groups[extra]);
      for (const merged of groups[extra]) for (const key of duplicateKeys(merged)) keyToGroup.set(key, index);
      groups[extra] = null;
    }
  }
  return groups.filter(Boolean).map(group => ({
    ...group.sort((a, b) => evidenceScore(b) - evidenceScore(a))[0],
    duplicate_ids: group.slice(1).map(stableOpportunityId),
    duplicate_count: group.length,
  }));
}

function evidenceScore(row) {
  return (sourceRuleFor(row.source_url).approved ? 40 : 0)
    + (row.application_url && canonicalUrl(row.application_url) !== canonicalUrl(row.source_url) ? 20 : 0)
    + (row.organiser ? 15 : 0)
    + (row.event_start ? 10 : 0)
    + (row.application_deadline ? 10 : 0)
    + (row.contact_email ? 5 : 0);
}

function geographicEvidence(row) {
  const host = hostname(row.source_url);
  const text = [row.event_name, row.organiser, row.location, row.region, row.notes, row.source_url, row.application_url, row.source_evidence].join(' ');
  if (FOREIGN_FIXTURES.test(text) || NON_UK_EVIDENCE.test(text) || (NON_UK_HOST.test(host) && !UK_HOST.test(host))) {
    return { valid: false, reason: 'non_uk_evidence' };
  }
  const rule = sourceRuleFor(row.source_url);
  if (rule.country === 'GB' || UK_HOST.test(host) || UK_POSTCODE.test(text) || /\b(?:United Kingdom|England|Scotland|Wales|Northern Ireland)\b/i.test(text)) {
    return { valid: true, reason: 'uk_evidence' };
  }
  return { valid: false, reason: 'uk_evidence_missing' };
}

function locationAgreesWithCoverage(location, coverage) {
  const place = normaliseText(location);
  return String(coverage || '').split('/').map(normaliseText).filter(Boolean).some(area => place.includes(area));
}

function evaluateOpportunity(raw, options = {}) {
  const now = options.now || new Date();
  const sourceText = [raw.source_evidence, raw.notes, raw.event_name, raw.organiser].join(' ');
  const rule = sourceRuleFor(raw.source_url);
  const opportunityType = rule.approved && rule.opportunity_type ? rule.opportunity_type : String(raw.opportunity_type || '');
  const recurring = rule.approved ? rule.recurring === true || opportunityType === 'recurring_market' : raw.recurring === true || opportunityType === 'recurring_market';
  const parsedDates = recurring
    ? { event_start: '', event_end: '', application_deadline: '', closed_signal: false }
    : extractDateFields(sourceText, now);
  const verifiedGeography = rule.approved ? String(rule.geographic_coverage || '') : '';
  const verifiedLocation = verifiedGeography && !locationAgreesWithCoverage(raw.location, verifiedGeography)
    ? verifiedGeography
    : raw.location || verifiedGeography;
  const row = {
    ...raw,
    location: verifiedLocation,
    region: verifiedGeography || raw.region,
    opportunity_type: opportunityType,
    recurring,
    source_url: canonicalUrl(raw.source_url),
    application_url: canonicalUrl(raw.application_url) || canonicalUrl(raw.source_url),
    event_start: raw.event_start || parsedDates.event_start,
    event_end: raw.event_end || parsedDates.event_end,
    application_deadline: raw.application_deadline || parsedDates.application_deadline,
  };
  row.stable_id = raw.stable_id || stableOpportunityId(row);
  row.source_rule = sourceRuleFor(row.source_url).host || 'unapproved';
  row.query_lane = String(raw.query_lane || '');
  row.query_text = String(raw.query_text || '');
  const reasons = [];
  const geo = geographicEvidence(row);
  if (!geo.valid) reasons.push(geo.reason);
  const today = now.toISOString().slice(0, 10);
  if (row.event_end && row.event_end < today) reasons.push('event_expired');
  else if (!row.event_end && row.event_start && row.event_start < today) reasons.push('event_expired');
  if (row.application_deadline && row.application_deadline < today) reasons.push('application_closed');
  if (parsedDates.closed_signal || raw.closed_signal) reasons.push('application_closed');
  if (!row.organiser || GENERIC_TITLE.test(String(row.event_name || '').trim()) && !row.organiser) reasons.push('named_organiser_missing');
  const directText = [row.event_name, row.organiser, row.application_url, raw.source_evidence].join(' ');
  if (!DIRECT_EVIDENCE.test(directText) && !row.contact_email) reasons.push('direct_application_or_contact_missing');
  if (!rule.approved) reasons.push('source_not_approved');
  if (rule.type === 'local-authority' && !AVAILABLE_PITCH.test(sourceText)) {
    reasons.push('available_pitch_evidence_missing');
  }
  if (!recurring && ONE_OFF_EVENT.test(row.event_name || '') && !row.event_start && !row.application_deadline) reasons.push('undated_one_off_event');
  if (!row.query_lane || !row.query_text) reasons.push('provenance_missing');

  const rejected = reasons.some(reason => ['non_uk_evidence', 'event_expired', 'application_closed'].includes(reason));
  const needsWork = reasons.some(reason => ['uk_evidence_missing', 'named_organiser_missing', 'direct_application_or_contact_missing', 'provenance_missing', 'available_pitch_evidence_missing'].includes(reason));
  const review = reasons.some(reason => ['source_not_approved', 'undated_one_off_event'].includes(reason));
  row.quality_status = rejected ? 'rejected' : needsWork ? 'needs_work' : review ? 'review' : 'customer_ready';
  row.quality_reasons = [...new Set(reasons)];
  row.publishable = row.quality_status === 'customer_ready';
  return row;
}

function customerReadyOnly(rows) {
  return rows.filter(row => row.quality_status === 'customer_ready' && row.publishable === true);
}

module.exports = {
  canonicalUrl,
  normaliseText,
  stableOpportunityId,
  duplicateKeys,
  mergeDuplicates,
  geographicEvidence,
  locationAgreesWithCoverage,
  evaluateOpportunity,
  customerReadyOnly,
  FOREIGN_FIXTURES,
};
