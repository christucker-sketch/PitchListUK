const DEFAULT_MAX_SEEDS = 24;
const DEFAULT_MAX_LINKS = 40;
const RELEVANT = /(?:apply|application|trade|trader|stall|stallholder|pitch|market|vendor|concession|festival|exhibitor|street[-\s]?trading|food[-\s]?trader|county[-\s]?show|artisan)/i;
const FOLLOW_ON_ONLY = /(?:upload|attach|provide|submit)[-\s_/]*(?:supporting[-\s_]*)?(?:documents?|evidence|files?)/i;

function canonical(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function publicUrl(value) {
  const route = canonical(value);
  if (!route) return null;
  const url = new URL(route);
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null;
  return url;
}

async function timedFetch(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { redirect: 'follow', headers: { 'user-agent': 'FindPitches-Global-Acquisition/1.0' }, signal: controller.signal });
  } finally { clearTimeout(timer); }
}

function eligibleCandidate(url, text = '') {
  const evidence = `${url.pathname} ${text}`;
  return RELEVANT.test(evidence) && !FOLLOW_ON_ONLY.test(evidence);
}

function htmlLinks(html, base) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    let url;
    try { url = new URL(match[1], base); } catch { continue; }
    const text = String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const route = canonical(url.toString());
    if (!route || !eligibleCandidate(url, text)) continue;
    out.push({ url: route, title: text || url.pathname, snippet: `Cloudflare direct link discovery from ${base}` });
  }
  return out;
}

function sitemapLinks(xml, origin) {
  const out = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(String(xml || '')))) {
    const route = canonical(match[1]);
    if (!route) continue;
    const url = new URL(route);
    if (url.origin !== origin || !eligibleCandidate(url)) continue;
    out.push({ url: route, title: url.pathname, snippet: `Cloudflare sitemap discovery from ${origin}` });
  }
  return out;
}

export async function discoverUkDirectSourceGraph(seedRoutes = [], options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeout_ms || 12000);
  const maxSeeds = Math.min(50, Math.max(1, Number(options.max_seeds || DEFAULT_MAX_SEEDS)));
  const maxLinks = Math.min(100, Math.max(1, Number(options.max_links || DEFAULT_MAX_LINKS)));
  const seeds = [...new Set(seedRoutes.map(canonical).filter(Boolean))].slice(0, maxSeeds);
  const seedSet = new Set(seeds);
  const found = [];
  const seen = new Set();
  const origins = new Set();

  const add = item => {
    const route = canonical(item?.url);
    if (!route || seedSet.has(route) || seen.has(route) || found.length >= maxLinks) return;
    const url = new URL(route);
    if (!eligibleCandidate(url, item?.title || '')) return;
    seen.add(route);
    found.push({ query: 'cloudflare-first-party-graph', rank: found.length + 1, title: item.title || '', url: route, snippet: item.snippet || '' });
  };

  for (const seed of seeds) {
    const parsed = publicUrl(seed);
    if (!parsed) continue;
    origins.add(parsed.origin);
    try {
      const response = await timedFetch(fetchImpl, parsed.toString(), timeoutMs);
      if (!response.ok) continue;
      const html = await response.text();
      for (const item of htmlLinks(html.slice(0, 300000), parsed.toString())) {
        const linked = publicUrl(item.url);
        if (!linked) continue;
        if (linked.hostname !== parsed.hostname && !linked.hostname.endsWith('.gov.uk')) continue;
        add(item);
      }
    } catch {}
    if (found.length >= maxLinks) break;
  }

  for (const origin of origins) {
    if (found.length >= maxLinks) break;
    for (const suffix of ['/sitemap.xml', '/sitemap_index.xml']) {
      try {
        const response = await timedFetch(fetchImpl, `${origin}${suffix}`, timeoutMs);
        if (!response.ok) continue;
        const xml = await response.text();
        for (const item of sitemapLinks(xml.slice(0, 500000), origin)) add(item);
      } catch {}
      if (found.length >= maxLinks) break;
    }
  }

  return Object.freeze({
    seed_count: seeds.length,
    candidates: Object.freeze(found),
    network: 'cloudflare_direct_fetch',
    external_search_credits: 0
  });
}

export const UK_DIRECT_SOURCE_GRAPH_LIMITS = Object.freeze({ maximum_seeds: 50, maximum_links: 100 });
