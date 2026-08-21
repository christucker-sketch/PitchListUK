'use strict';

const APPROVED_SOURCES = Object.freeze([
  ['englandsmedievalfestival.com', 'event-organiser', 'manual-reviewed'],
  ['bristol.gov.uk', 'local-authority', 'public-service'],
  ['cheshireeast.gov.uk', 'local-authority', 'public-service'],
  ['cumberland.gov.uk', 'local-authority', 'public-service'],
  ['rushmoor.gov.uk', 'local-authority', 'public-service'],
  ['tendringdc.gov.uk', 'local-authority', 'public-service'],
  ['caerphilly.gov.uk', 'local-authority', 'public-service'],
  ['dundeecity.gov.uk', 'local-authority', 'public-service'],
  ['eastcambs.gov.uk', 'local-authority', 'public-service'],
  ['liverpool.gov.uk', 'local-authority', 'public-service'],
  ['nottinghamwinterwonderland.co.uk', 'event-organiser', 'manual-reviewed'],
  ['west-norfolk.gov.uk', 'local-authority', 'public-service'],
].map(([host, type, termsPolicy]) => Object.freeze({
  host,
  type,
  country: 'GB',
  approved: true,
  robots_policy: 'fetch-and-obey',
  terms_policy: termsPolicy,
  min_interval_ms: type === 'local-authority' ? 1250 : 2000,
  max_concurrency: 1,
  allowed_as_application_host: true,
})));

const APPLICATION_HOSTS = Object.freeze([
  'form.jotform.com',
  'forms.office.com',
  'docs.google.com',
  'forms.gle',
  'gov.uk',
].map(host => Object.freeze({
  host,
  type: 'application-platform',
  approved: false,
  allowed_as_application_host: true,
  robots_policy: 'fetch-and-obey',
  terms_policy: 'source-specific-review-required',
  min_interval_ms: 2000,
  max_concurrency: 1,
})));

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostMatches(host, configured) {
  return host === configured || host.endsWith(`.${configured}`);
}

function sourceRuleFor(value) {
  const host = hostname(value);
  return [...APPROVED_SOURCES, ...APPLICATION_HOSTS].find(rule => hostMatches(host, rule.host)) || Object.freeze({
    host,
    type: 'unapproved-discovery-source',
    approved: false,
    allowed_as_application_host: false,
    robots_policy: 'fetch-and-obey',
    terms_policy: 'manual-review-required-before-promotion',
    min_interval_ms: 2500,
    max_concurrency: 1,
  });
}

function termsReviewed(rule) {
  return ['manual-reviewed', 'public-service'].includes(rule?.terms_policy);
}

module.exports = {
  APPROVED_SOURCES,
  APPLICATION_HOSTS,
  hostname,
  sourceRuleFor,
  termsReviewed,
};
