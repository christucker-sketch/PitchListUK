'use strict';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(value, defaultYear = new Date().getUTCFullYear()) {
  const text = String(value || '').trim();
  let match = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return iso(match[1], match[2], match[3]);
  match = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(20\d{2}))?\b/i);
  if (match) return iso(match[3] || defaultYear, MONTHS[match[2].toLowerCase()], match[1]);
  match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
  if (match) return iso(match[3] || defaultYear, MONTHS[match[1].toLowerCase()], match[2]);
  return '';
}

function extractDateFields(text, now = new Date()) {
  const source = String(text || '').replace(/\s+/g, ' ');
  const year = now.getUTCFullYear();
  const deadlineMatch = source.match(/(?:application|apply|submission|booking)s?\s*(?:deadline|close|closes|by)?\s*[:\-]?\s*((?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+|[A-Za-z]+\s+\d{1,2})(?:,?\s+20\d{2})?|20\d{2}-\d{1,2}-\d{1,2})/i)
    || source.match(/(?:deadline|applications? close|apply by)\s*[:\-]?\s*((?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+|[A-Za-z]+\s+\d{1,2})(?:,?\s+20\d{2})?|20\d{2}-\d{1,2}-\d{1,2})/i);
  const range = source.match(/((?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+|[A-Za-z]+\s+\d{1,2})(?:,?\s+20\d{2})?|20\d{2}-\d{1,2}-\d{1,2})\s*(?:to|–|—|-)\s*((?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+|[A-Za-z]+\s+\d{1,2})(?:,?\s+20\d{2})?|20\d{2}-\d{1,2}-\d{1,2})/i);
  const dateMatches = [...source.matchAll(/\b(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+20\d{2})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})?)\b/ig)].map(match => parseDate(match[0], year)).filter(Boolean);
  return {
    event_start: range ? parseDate(range[1], year) : (dateMatches.find(date => date !== parseDate(deadlineMatch?.[1], year)) || ''),
    event_end: range ? parseDate(range[2], year) : '',
    application_deadline: deadlineMatch ? parseDate(deadlineMatch[1], year) : '',
    closed_signal: /\b(applications? (?:are |is )?(?:now )?closed|applications? closed|no longer accepting applications?|deadline has passed|fully booked)\b/i.test(source),
  };
}

module.exports = { parseDate, extractDateFields };
