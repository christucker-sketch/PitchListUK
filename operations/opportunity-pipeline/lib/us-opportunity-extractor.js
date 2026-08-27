const crypto = require('crypto');
const { classifyUsOpportunityEvidence } = require('./us-acquisition-classifier');
const { resolveTexasZip, normaliseUsZip } = require('./us-zip-geography');
const { US_VENDOR_CATEGORIES, RECURRING_TERMS, APPLICATION_TERMS } = require('../config/us-classification-model');

function normaliseText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstMatch(text, regexes) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match) return normaliseText(match[1] || match[0]);
  }
  return '';
}

function extractUsDate(text, labels = []) {
  const escapedLabels = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const prefix = escapedLabels.length ? `(?:${escapedLabels.join('|')})\\s*[:\\-]?\\s*` : '';
  const patterns = [
    new RegExp(`${prefix}(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})`, 'i'),
    new RegExp(`${prefix}(\\d{1,2})[\\/-](\\d{1,2})[\\/-](20\\d{2})`, 'i')
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (/^\d/.test(match[1])) {
      const month = Number(match[1]);
      const day = Number(match[2]);
      const year = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month = months.indexOf(match[1].toLowerCase()) + 1;
    return `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
  }
  return '';
}

function extractApplicationUrl(page) {
  const links = Array.isArray(page.links) ? page.links : [];
  const ranked = links
    .filter(link => link && link.url)
    .map(link => ({ ...link, text: normaliseText(link.text).toLowerCase() }))
    .filter(link => APPLICATION_TERMS.some(term => link.text.includes(term)) || /apply|vendor|exhibitor|booth|concession/i.test(link.url));
  return ranked[0]?.url || '';
}

function extractCategories(text) {
  const lower = text.toLowerCase();
  const ids = [];
  for (const category of US_VENDOR_CATEGORIES) {
    if (category.terms.some(term => lower.includes(term))) ids.push(category.id);
  }
  return [...new Set(ids)];
}

function stableId(parts) {
  const material = parts.map(value => normaliseText(value).toLowerCase()).join('|');
  return `opp_us_${crypto.createHash('sha256').update(material).digest('hex').slice(0, 20)}`;
}

function extractTexasOpportunity(page, options = {}) {
  const title = normaliseText(page.title);
  const body = normaliseText(page.text || page.body);
  const sourceUrl = page.url || page.source_url || '';
  const applicationUrl = page.application_url || extractApplicationUrl(page);
  const classification = classifyUsOpportunityEvidence({ title, body, sourceUrl, applicationUrl });

  if (classification.decision === 'rejected') {
    return { status: 'rejected', reasons: [classification.reason, ...classification.negativeSignals] };
  }
  if (classification.decision !== 'candidate') {
    return { status: 'review', reasons: [classification.reason] };
  }

  const text = `${title} ${body}`.trim();
  const organiser = normaliseText(page.organiser || firstMatch(body, [
    /(?:hosted|organized|organised|presented) by\s+([^.;|]+)/i,
    /(?:contact|about)\s+([^.;|]+?)\s+(?:for vendor|vendor applications?)/i
  ]));
  const eventName = normaliseText(page.event_name || title.replace(/\s*[-|:]\s*(vendor|exhibitor|food truck|booth).*$/i, ''));

  const zipRaw = page.postal_code || page.zip || firstMatch(text, [/\b(\d{5}(?:-\d{4})?)\b/]);
  const postalCode = normaliseUsZip(zipRaw);
  const resolved = postalCode ? resolveTexasZip(postalCode, { index: options.zipIndex }) : null;
  const locality = normaliseText(page.locality || page.city || resolved?.locality || firstMatch(text, [/\b([A-Z][A-Za-z .'-]+),\s*TX\s+\d{5}(?:-\d{4})?\b/]));

  const eventStart = page.event_start || extractUsDate(text, ['event date', 'date', 'starts', 'start date']);
  const applicationDeadline = page.application_deadline || extractUsDate(text, ['application deadline', 'apply by', 'deadline', 'applications close', 'vendor deadline']);
  const recurring = Boolean(page.recurring) || RECURRING_TERMS.some(term => text.toLowerCase().includes(term));
  const categories = extractCategories(text);

  const reasons = [];
  if (!sourceUrl) reasons.push('missing_source_url');
  if (!applicationUrl) reasons.push('missing_application_route');
  if (!eventName) reasons.push('missing_event_name');
  if (!organiser) reasons.push('missing_organiser');
  if (!locality && !resolved) reasons.push('missing_texas_locality');
  if (!recurring && !eventStart) reasons.push('missing_event_date');

  const status = reasons.length ? 'review' : 'candidate';
  const geography = resolved || null;

  const row = {
    stable_id: stableId(['US', organiser, eventName, locality || geography?.locality || '', eventStart || (recurring ? 'recurring' : '')]),
    event_name: eventName,
    organiser,
    source_url: sourceUrl,
    application_url: applicationUrl,
    location: locality || geography?.locality || '',
    locality: locality || geography?.locality || '',
    region: 'Texas',
    region_code: 'TX',
    region_name: 'Texas',
    country: 'United States',
    country_code: 'US',
    jurisdiction: 'US-TX',
    currency: 'USD',
    postal_code: postalCode || '',
    latitude: geography?.latitude ?? page.latitude ?? '',
    longitude: geography?.longitude ?? page.longitude ?? '',
    coordinate_source: geography?.source || (page.latitude && page.longitude ? 'page' : ''),
    coordinate_precision: geography?.precision || (page.latitude && page.longitude ? 'exact' : ''),
    event_start: eventStart,
    application_deadline: applicationDeadline,
    recurring,
    opportunity_type: recurring ? 'recurring' : 'event',
    vendor_categories: categories,
    quality_status: status === 'candidate' ? 'review' : 'needs_work',
    publishable: false
  };

  return { status, reasons, row };
}

module.exports = {
  extractTexasOpportunity,
  extractUsDate,
  extractCategories,
  extractApplicationUrl,
  stableId
};
