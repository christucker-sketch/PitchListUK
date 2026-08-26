const { URL } = require('url');
const { cleanHtml, extractLinks } = require('./fetch-page');
const { extractDateFields } = require('../lib/date-extraction');
const { sourceRuleFor } = require('../config/sources');
const { REGIONS } = require('./config');

const RELEVANT = /(trader|stallholder|vendor|exhibitor|caterer|street food|food trader|food vendor|trade stand|concession|mobile catering|apply|application|pitch|booking|public event|car boot|fireworks|bonfire|car show|classic car|motorsport|sports event|marathon|running event|community event|council event)/i;
const NEGATIVE = /(ticket|visitor|spectator|sponsor|volunteer|job|careers|race results|parking)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;

function guessRegion(text) {
  return REGIONS.find(region => new RegExp(`\\b${region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) || '';
}
function guessDate(text) {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const dmy = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if (!dmy) return '';
  const months = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
  return `${dmy[3]}-${months[dmy[2].toLowerCase()]}-${String(dmy[1]).padStart(2,'0')}`;
}
function nextFutureDate(text, today) {
  const months = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
  const dates = [];
  for (const match of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/ig)) {
    dates.push(`${match[3]}-${months[match[2].toLowerCase()]}-${String(match[1]).padStart(2, '0')}`);
  }
  return [...new Set(dates)].filter(date => date >= today).sort()[0] || '';
}
function titleFromPage(text, url) {
  const title = text.match(/\b([A-Z][A-Za-z&'’\- ]{3,80}(Festival|Market|Show|Fair|Fiesta|Feast|Food & Drink|Car Boot|Fireworks|Bonfire|Marathon|Run|Race|Rally|Motorsport|Classic Car|Public Event|Community Event)[A-Za-z&'’\- ]*)\b/);
  if (title) return title[1].trim();
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return url; }
}
function findApplicationLink(links) {
  const scored = links.map(link => {
    const hay = `${link.label} ${link.url}`;
    let score = 0;
    if (/trader|stallholder|vendor|exhibitor|caterer|street.?food|food.?vendor|trade.?stand|concession|mobile.?catering/i.test(hay)) score += 4;
    if (/apply|application|book|pitch|register|booking|enquire|contact/i.test(hay)) score += 3;
    if (NEGATIVE.test(hay)) score -= 3;
    return { ...link, score };
  }).filter(l => l.score > 0).sort((a,b) => b.score - a.score);
  return scored[0]?.url || '';
}
function sourceCandidateToRow(candidate, html, today) {
  const text = cleanHtml(html);
  const links = extractLinks(html, candidate.url);
  const emails = Array.from(new Set(text.match(EMAIL) || []));
  const relevantText = `${candidate.title} ${candidate.snippet} ${text.slice(0,5000)}`;
  const appLink = findApplicationLink(links);
  const relevant = RELEVANT.test(relevantText) || appLink;
  const confidence = relevant && appLink ? 'medium' : relevant ? 'low' : 'low';
  const dates = extractDateFields(relevantText, new Date(`${today}T00:00:00Z`));
  const sourceRule = sourceRuleFor(candidate.url);
  const recurringMarket = sourceRule.opportunity_type === 'recurring_market';
  const verifiedGeography = sourceRule.approved ? sourceRule.geographic_coverage : '';
  const sourceUrl = sourceRule.official_application_route || candidate.url;
  const selectedEventStart = recurringMarket ? '' : sourceRule.known_open_event_start || (sourceRule.opportunity_type === 'festival_trader_application'
    ? nextFutureDate(relevantText, today)
    : dates.event_start || guessDate(relevantText));
  return {
    stable_id: '',
    event_name: sourceRule.opportunity_title || titleFromPage(`${candidate.title}. ${text.slice(0,1200)}`, candidate.url),
    organiser: sourceRule.approved ? sourceRule.organisation : '',
    source_url: sourceUrl,
    application_url: sourceRule.official_application_route || appLink || sourceUrl,
    contact_email: emails[0] || '',
    location: verifiedGeography || guessRegion(relevantText),
    region: verifiedGeography || guessRegion(relevantText),
    opportunity_type: sourceRule.approved ? sourceRule.opportunity_type : '',
    recurring: sourceRule.approved && sourceRule.recurring === true,
    event_start: selectedEventStart,
    event_end: recurringMarket ? '' : sourceRule.known_open_event_end || dates.event_end,
    application_deadline: dates.application_deadline,
    stall_fee: '',
    vendor_categories: /car boot/i.test(relevantText) ? 'car boot traders; stallholders; food vendors' : /fireworks|bonfire/i.test(relevantText) ? 'food vendors; mobile catering; stallholders' : /car show|classic car|motorsport/i.test(relevantText) ? 'food vendors; trade stands; exhibitors' : /sports event|marathon|running event|race/i.test(relevantText) ? 'food vendors; mobile catering; event concessions' : /street food|hot food|cater|food vendor/i.test(relevantText) ? 'street food; mobile catering; food traders' : 'food traders; stallholders; exhibitors; event concessions',
    last_checked: today,
    confidence,
    notes: relevant ? 'Staged by the PitchList acquisition engine.' : 'Needs manual review; weak relevance.',
    query_lane: candidate.query_lane || '',
    query_text: candidate.query || '',
    source_evidence: `${candidate.title || ''} ${candidate.snippet || ''} ${text.slice(0, 5000)}`.trim(),
    quality_status: 'review',
    quality_reasons: 'not_yet_evaluated',
    publishable: false,
  };
}
module.exports = { sourceCandidateToRow, nextFutureDate };
