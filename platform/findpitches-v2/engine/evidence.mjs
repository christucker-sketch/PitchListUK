const POSITIVE_PHRASES = Object.freeze([
  'apply to trade',
  'traders wanted',
  'trader application',
  'stallholders wanted',
  'stallholder application',
  'vendors wanted',
  'vendor application',
  'food vendors wanted',
  'food vendor application',
  'market vendor application',
  'exhibitor application',
  'become a vendor',
  'book a pitch',
  'pitch application'
]);

const NEGATIVE_PHRASES = Object.freeze([
  'job vacancies',
  'current vacancies',
  'careers',
  'career opportunities',
  'job description',
  'tourist information',
  'visitor information',
  'shopping directory',
  'business directory'
]);

const APPLICATION_HINT = /(apply|application|vendor|trader|stallholder|exhibitor|pitch|food[ -]?truck)/i;

export function extractEvidence({
  body,
  sourceUrl,
  location,
  now = new Date()
} = {}) {
  const html = String(body || '');
  const text = htmlToText(html);
  const normalized = text.toLowerCase();
  const evidence = [];

  for (const phrase of POSITIVE_PHRASES) {
    if (normalized.includes(phrase)) {
      evidence.push(Object.freeze({ type: 'application_phrase', value: phrase, confidence: 1 }));
    }
  }

  for (const phrase of NEGATIVE_PHRASES) {
    if (normalized.includes(phrase)) {
      evidence.push(Object.freeze({ type: 'negative_phrase', value: phrase, confidence: 1 }));
    }
  }

  const applicationUrl = findApplicationUrl(html, sourceUrl);
  if (applicationUrl) {
    evidence.push(Object.freeze({ type: 'application_link', value: applicationUrl, confidence: 1 }));
  }

  const place = String(location || '').trim();
  if (place && normalized.includes(place.toLowerCase())) {
    evidence.push(Object.freeze({ type: 'geography_match', value: place, confidence: 0.9 }));
  }

  const currentYear = now.getUTCFullYear();
  const years = [...new Set((text.match(/\b20\d{2}\b/g) || []).map(Number))]
    .filter(year => year >= currentYear && year <= currentYear + 4)
    .sort();

  if (years.length) {
    evidence.push(Object.freeze({ type: 'current_or_future_year', value: String(years[0]), confidence: 0.8 }));
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return Object.freeze({
    title: titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() || null : null,
    text,
    application_url: applicationUrl,
    evidence: Object.freeze(evidence)
  });
}

export function hasPositiveApplicationEvidence(evidence) {
  return evidence.some(item => item?.type === 'application_phrase');
}

export function hasStrongNegativeEvidence(evidence) {
  return evidence.some(item => item?.type === 'negative_phrase');
}

function findApplicationUrl(html, sourceUrl) {
  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const candidates = [];
  let match;

  while ((match = anchorPattern.exec(html))) {
    const href = decodeEntities(match[2]).trim();
    const label = decodeEntities(stripTags(match[3])).trim();
    if (!APPLICATION_HINT.test(`${href} ${label}`)) continue;

    try {
      const url = new URL(href, sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      url.hash = '';
      candidates.push({ url: url.toString(), score: applicationLinkScore(label, href) });
    } catch {
      // Invalid links are ignored; they are not batch-fatal.
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return candidates[0]?.url || null;
}

function applicationLinkScore(label, href) {
  const value = `${label} ${href}`.toLowerCase();
  let score = 0;
  if (/apply|application/.test(value)) score += 30;
  if (/vendor|trader|stallholder|exhibitor|pitch/.test(value)) score += 20;
  if (/food[ -]?truck/.test(value)) score += 10;
  if (/login|sign in/.test(value)) score -= 5;
  return score;
}

function htmlToText(html) {
  return decodeEntities(
    stripTags(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    )
  ).replace(/\s+/g, ' ').trim();
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

export { POSITIVE_PHRASES, NEGATIVE_PHRASES };
