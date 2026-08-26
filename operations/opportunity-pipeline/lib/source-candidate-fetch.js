'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const { parseRobots, robotsAllows, classifyFetchFailure, mapBounded } = require('./fetch-policy');

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const octets = address.split('.').map(Number);
    return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) || octets[0] >= 224;
  }
  if (net.isIPv6(address)) return address === '::1' || /^f[cd]/i.test(address) || /^fe[89ab]/i.test(address) || address === '::';
  return true;
}

async function assertPublicUrl(value, lookup = dns.lookup) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) throw new Error('candidate_url_policy_rejected');
  if (net.isIP(url.hostname) || /^(?:localhost|localhost\.|.*\.localhost)$/i.test(url.hostname)) throw new Error('candidate_host_policy_rejected');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('candidate_private_address_rejected');
  return url;
}

function createCandidateFetcher(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const lookup = options.lookup || dns.lookup;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const timeoutMs = Math.max(1, Number(options.timeoutMs || 20000));
  const maxRedirects = Math.min(5, Math.max(0, Number(options.maxRedirects ?? 3)));
  const robots = new Map();
  const lastByHost = new Map();

  async function timed(url, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  }

  async function request(url, redirects = 0) {
    const parsed = await assertPublicUrl(url, lookup);
    const response = await timed(parsed.toString(), { redirect: 'manual', headers: { 'user-agent': 'PitchListUKBot/1.0 (+https://pitchlist.uk)' } });
    if (response.status >= 300 && response.status < 400 && response.headers?.get('location')) {
      if (redirects >= maxRedirects) throw new Error('candidate_redirect_limit');
      return request(new URL(response.headers.get('location'), parsed).toString(), redirects + 1);
    }
    return response;
  }

  async function fetchCandidate(value) {
    let parsed;
    try { parsed = await assertPublicUrl(value, lookup); }
    catch (error) { return { ok: false, classification: error.message, attempts: 0 }; }
    if (!robots.has(parsed.origin)) {
      try {
        const response = await request(`${parsed.origin}/robots.txt`);
        robots.set(parsed.origin, response.ok ? parseRobots(await response.text()) : []);
      } catch (error) { return { ok: false, classification: 'robots_unavailable', attempts: 0 }; }
    }
    if (!robotsAllows(parsed.toString(), robots.get(parsed.origin))) return { ok: false, classification: 'robots_disallowed', attempts: 0 };
    const last = lastByHost.get(parsed.hostname) || 0;
    const wait = Number(options.minIntervalMs || 2500) - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    let response; let error;
    try { response = await request(parsed.toString()); } catch (caught) { error = caught; }
    lastByHost.set(parsed.hostname, Date.now());
    const classification = classifyFetchFailure(error, response);
    if (classification) return { ok: false, classification, status: response?.status || 0, attempts: 1 };
    return { ok: true, response, final_url: response.url || parsed.toString(), attempts: 1 };
  }

  return { fetchCandidate };
}

async function fetchCandidateBatch(candidates, options = {}) {
  const fetchCandidate = options.fetchCandidate || createCandidateFetcher(options).fetchCandidate;
  return mapBounded(candidates, Math.min(3, Math.max(1, Number(options.concurrency || 2))), async candidate => {
    const result = await fetchCandidate(candidate.url);
    if (!result.ok) return { candidate, fetch_status: result.classification, attempts: result.attempts || 0 };
    return { candidate, fetch_status: 'fetched', final_url: result.final_url || candidate.url, page_text: (await result.response.text()).slice(0, 240000), attempts: result.attempts || 1 };
  });
}

module.exports = { privateAddress, assertPublicUrl, createCandidateFetcher, fetchCandidateBatch };
