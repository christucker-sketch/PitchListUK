import { canonicalUrl } from '../engine/candidate.mjs';
import { sourceDomain } from './storage.mjs';

const LINK_RE=/<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'<>]+))[^>]*>([\s\S]*?)<\/a>/gi;
const POSITIVE=/\b(vendor|vendors|exhibitor|exhibitors|seller|merchant|trader|booth|stall|apply|application|market|festival|fair|food\s*truck|artisan|maker|popup|pop-up)\b/i;
const NEGATIVE=/\b(login|privacy|terms|facebook|instagram|linkedin|twitter|youtube|sponsor|volunteer|donate|ticket|tickets|parking|contact us)\b/i;

export function extractSourceRouteLinks(html, baseUrl, { limit = 24 } = {}) {
  const base = new URL(String(baseUrl));
  const found = new Map();
  let match;
  while ((match = LINK_RE.exec(String(html || ''))) && found.size < Math.max(1, Math.min(Number(limit) || 24, 100))) {
    const href = match[1] ?? match[2] ?? match[3] ?? '';
    const label = stripTags(match[4] || '');
    let url;
    try { url = canonicalUrl(new URL(href, base).toString()); } catch { continue; }
    if (!url || !/^https?:/i.test(url)) continue;
    const u = new URL(url);
    if (sourceDomain(url) !== sourceDomain(base.toString())) continue;
    const signal = `${label} ${u.pathname.replace(/[-_/]+/g, ' ')}`;
    if (!POSITIVE.test(signal) || NEGATIVE.test(signal)) continue;
    found.set(url, Object.freeze({ url, label: label || null, route_type: classifyRoute(signal) }));
  }
  return Object.freeze([...found.values()]);
}

export async function runSourceFirstBatch(db, { fetchProvider, market = 'US', limit = 4, now = new Date() } = {}) {
  if (!db?.prepare || typeof fetchProvider?.fetch !== 'function') throw new Error('findpitches_v2_source_first_dependencies_missing');
  const timestamp = now.toISOString();
  const due = await db.prepare(
    `SELECT market, route_url, domain, route_type, refresh_minutes
       FROM source_routes
      WHERE market = ? AND status IN ('approved','productive')
        AND (next_check IS NULL OR next_check <= ?)
      ORDER BY reputation_score DESC, COALESCE(last_checked,'') ASC
      LIMIT ?`
  ).bind(market, timestamp, Math.max(1, Math.min(Number(limit) || 4, 20))).all();

  const rows = Array.isArray(due?.results) ? due.results : [];
  const out = { routes_checked: 0, links_found: 0, candidates_inserted: 0, classification_enqueued: 0, failures: 0 };

  for (const route of rows) {
    try {
      const page = await fetchProvider.fetch(route.route_url);
      if (!String(page.content_type || '').includes('html')) throw new Error('findpitches_v2_source_route_not_html');
      const links = extractSourceRouteLinks(page.body, page.final_url || route.route_url);
      out.routes_checked += 1;
      out.links_found += links.length;
      for (const link of links) {
        const candidateId = await stableCandidateId(link.url);
        const inserted = await db.prepare(
          `INSERT OR IGNORE INTO candidates (
            id, market, region_code, source_url, canonical_url, application_url,
            event_name, organiser, geography_json, evidence_json, score, status,
            rejection_reason, first_seen, last_checked, retry_count, run_id,
            opportunity_fingerprint
          ) VALUES (?, ?, NULL, ?, ?, NULL, ?, NULL, ?, ?, 0, 'discovered',
                    NULL, ?, ?, 0, NULL, NULL)`
        ).bind(candidateId, route.market, link.url, link.url, link.label,
          JSON.stringify({ discovery_market: route.market, source_route: route.route_url, asserted: false }),
          JSON.stringify([{ kind:'source_route_link', source:route.route_url, target:link.url, label:link.label, route_type:link.route_type }]),
          timestamp, timestamp).run();
        if (Number(inserted?.meta?.changes || 0) === 1) out.candidates_inserted += 1;

        const queued = await db.prepare(
          `INSERT OR IGNORE INTO classification_queue (
            candidate_id, status, attempts, available_at, lease_until,
            last_error, created_at, updated_at
          ) VALUES (?, 'ready', 0, ?, NULL, NULL, ?, ?)`
        ).bind(candidateId, timestamp, timestamp, timestamp).run();
        if (Number(queued?.meta?.changes || 0) === 1) out.classification_enqueued += 1;
      }
      const minutes = Math.max(60, Number(route.refresh_minutes || 10080));
      const next = new Date(now.getTime() + minutes * 60000).toISOString();
      await db.prepare(`UPDATE source_routes SET last_checked=?, last_seen=?, next_check=? WHERE market=? AND route_url=?`)
        .bind(timestamp, timestamp, next, route.market, route.route_url).run();
    } catch (error) {
      out.failures += 1;
      const next = new Date(now.getTime() + 24 * 60 * 60000).toISOString();
      await db.prepare(`UPDATE source_routes SET last_checked=?, next_check=? WHERE market=? AND route_url=?`)
        .bind(timestamp, next, route.market, route.route_url).run();
    }
  }
  return Object.freeze(out);
}

function classifyRoute(value) {
  if (/\b(apply|application)\b/i.test(value)) return 'application';
  if (/\b(farmers? market|night market|artisan market|market)\b/i.test(value)) return 'market';
  if (/\b(festival|fair)\b/i.test(value)) return 'event';
  return 'vendor_programme';
}
function stripTags(value) { return String(value).replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim().slice(0,240); }
async function stableCandidateId(url) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(url).toLowerCase()));
  return 'fpv2_'+[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,24);
}
