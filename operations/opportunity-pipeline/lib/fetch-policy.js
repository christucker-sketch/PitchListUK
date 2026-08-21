const { sourceRuleFor, termsReviewed } = require('../config/sources');

function classifyFetchFailure(error, response) {
  if (error?.name === 'AbortError') return 'timeout';
  if (error) return 'network_error';
  if (!response) return 'unexpected_termination';
  if (response.status === 429) return 'rate_limited';
  if (response.status === 401 || response.status === 403) return 'access_denied';
  if (response.status >= 500) return 'provider_error';
  if (!response.ok) return 'http_error';
  return '';
}

function parseRobots(text) {
  const disallow = [];
  let applies = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [name, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(name)) applies = value === '*' || /PitchListUKBot/i.test(value);
    else if (applies && /^disallow$/i.test(name) && value) disallow.push(value);
  }
  return disallow;
}

function robotsAllows(url, disallow) {
  const path = new URL(url).pathname;
  return !disallow.some(prefix => prefix === '/' || path.startsWith(prefix));
}

function createPolicyFetcher(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  const lastByDomain = new Map();
  const robotsByOrigin = new Map();

  async function fetchWithPolicy(url, requestOptions = {}) {
    const parsed = new URL(url);
    const rule = sourceRuleFor(url);
    if (!rule.approved) return { ok: false, classification: 'source_not_approved', attempts: 0 };
    if (!termsReviewed(rule)) return { ok: false, classification: 'terms_not_reviewed', attempts: 0 };

    if (!robotsByOrigin.has(parsed.origin)) {
      try {
        const response = await fetchImpl(`${parsed.origin}/robots.txt`, { headers: { 'user-agent': 'PitchListUKBot/1.0 (+https://pitchlist.uk)' } });
        robotsByOrigin.set(parsed.origin, response.ok ? parseRobots(await response.text()) : []);
      } catch {
        return { ok: false, classification: 'robots_unavailable', attempts: 0 };
      }
    }
    if (!robotsAllows(url, robotsByOrigin.get(parsed.origin))) return { ok: false, classification: 'robots_disallowed', attempts: 0 };

    const interval = Number(rule.min_interval_ms || 1000);
    const last = lastByDomain.get(parsed.hostname);
    const elapsed = last === undefined ? interval : now() - last;
    if (elapsed < interval) await sleep(interval - elapsed);

    const maxAttempts = Math.max(1, Number(requestOptions.maxAttempts || 3));
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response;
      let error;
      try {
        response = await fetchImpl(url, { redirect: 'follow', headers: { 'user-agent': 'PitchListUKBot/1.0 (+https://pitchlist.uk)' } });
      } catch (caught) {
        error = caught;
      }
      lastByDomain.set(parsed.hostname, now());
      const classification = classifyFetchFailure(error, response);
      if (!classification) return { ok: true, response, attempts: attempt, final_url: response.url || url };
      if (!['timeout', 'network_error', 'rate_limited', 'provider_error'].includes(classification) || attempt === maxAttempts) {
        return { ok: false, status: response?.status || 0, classification, attempts: attempt };
      }
      await sleep(Math.min(8000, 250 * (2 ** (attempt - 1))));
    }
    return { ok: false, classification: 'unexpected_termination', attempts: maxAttempts };
  }

  return { fetchWithPolicy };
}

async function mapBounded(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, consume));
  return output;
}

module.exports = { classifyFetchFailure, parseRobots, robotsAllows, createPolicyFetcher, mapBounded };
