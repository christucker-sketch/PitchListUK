// Local development server for the V3 site: serves public/ and a STUB of the V3 customer API (/api/v3/*)
// backed by dev/fixtures/opportunities.json (producer data mapped by contract/reference/map-producer-record.mjs).
// It exists so the site can be run, reviewed and tested with no other system at all. Not for production.
//   node dev/stub-server.mjs [--port 8790]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const args = process.argv.slice(2);
const PORT = +(args[args.indexOf('--port') + 1] || 0) || 8790;

// ---- load the stub engine (browser-style script) into a sandbox with the site's routes + SEO config
const fx = JSON.parse(fs.readFileSync(path.join(root, 'dev', 'fixtures', 'opportunities.json'), 'utf8'));
const today = fx.generated_from.today;
const sandbox = { console, structuredClone, setTimeout, Promise, Date, Math, JSON, URL, URLSearchParams };
sandbox.window = sandbox;
sandbox.FP_CONFIG = { today, mockLatency: [0, 0] };
sandbox.FP_FIXTURES = { opportunities: fx.opportunities };
vm.createContext(sandbox);
for (const f of ['public/assets/js/routes.js', 'public/assets/js/seo/seo-config.js', 'dev/stub-engine.js'])
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
const API = sandbox.FP.mockApi;

// ---- HTTP helpers
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function send(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({ 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' }, headers));
  res.end(body);
}
const json = (res, status, obj, headers) => send(res, status, JSON.stringify(obj), Object.assign({ 'content-type': 'application/json' }, headers || {}));
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => c.split('=').map(decodeURIComponent)));
const readBody = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch (e) { r({}); } }); });
const list = v => (v ? String(v).split(',').filter(Boolean) : undefined);

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\/v3/, '') || '/';
  const q = Object.fromEntries(url.searchParams);
  const c = cookies(req);
  let csrf = c.fp_csrf; const setCookie = [];
  if (!csrf) { csrf = crypto.randomBytes(16).toString('hex'); setCookie.push(`fp_csrf=${csrf}; Path=/; SameSite=Strict`); }
  if (req.method !== 'GET' && req.headers['x-csrf-token'] !== c.fp_csrf) return json(res, 403, { ok: false, error: 'csrf_failed', message: 'Refresh the page and try again.' });
  const body = req.method === 'GET' ? {} : await readBody(req);
  const ok = (obj, status = 200) => json(res, status, Object.assign({ ok: true }, obj), setCookie.length ? { 'set-cookie': setCookie } : {});
  const m = (re) => p.match(re);
  try {
    if (req.method === 'GET' && p === '/markets') return ok({ markets: await API.meta.markets() });
    if (req.method === 'GET' && p === '/stats') return ok(await API.meta.stats());
    if (req.method === 'GET' && p === '/regions') return ok({ regions: await API.meta.regions({ market: q.market }) });
    if (req.method === 'GET' && p === '/geo/resolve') return ok({ location: await API.geo.resolve({ market: q.market, q: q.q }) });
    if (req.method === 'GET' && p === '/opportunities') return ok(await API.opportunities.search(Object.assign({}, q, { types: list(q.types), organiser_types: list(q.organiser_types) })));
    if (req.method === 'GET' && p === '/opportunities/count') return ok(await API.opportunities.count(Object.assign({}, q, { types: list(q.types), organiser_types: list(q.organiser_types) })));
    if (req.method === 'GET' && p === '/opportunities/upcoming') return ok({ items: await API.opportunities.upcoming({ market: q.market, limit: +q.limit || 10, type: q.type }) });
    if (req.method === 'POST' && p === '/opportunities/by-ids') return ok({ items: await API.opportunities.byIds(body.ids || []) });
    if (req.method === 'GET' && m(/^\/opportunities\/([^/]+)$/)) return ok({ opportunity: await API.opportunities.get(decodeURIComponent(m(/^\/opportunities\/([^/]+)$/)[1])) });
    if (req.method === 'POST' && p === '/seo/inventory') return ok(await API.seo.inventory({ market: body.market, intents: body.intents || [] }));
    if (req.method === 'GET' && p === '/session') return ok(await API.session.get());
    if (req.method === 'POST' && p === '/session/link') { const r = await API.session.requestLink({ email: body.email });
      return ok({ sent: true, dev_link: `${url.origin}/api/v3/session/verify?token=${encodeURIComponent(r._mock_token)}&next=${encodeURIComponent(body.next || '/account.html')}` }); }
    if (req.method === 'GET' && p === '/session/verify') { await API.session.completeLink({ token: q.token });
      res.writeHead(303, { location: q.next && q.next.startsWith('/') ? q.next : '/account.html?signin=ok' }); return res.end(); }
    if (req.method === 'POST' && p === '/session/verify') return ok(await API.session.completeLink({ token: body.token }));
    if (req.method === 'POST' && p === '/session/logout') return ok(await API.session.signOut());
    if (req.method === 'PATCH' && p === '/session/profile') return ok(await API.session.updateProfile(body));
    if (req.method === 'GET' && p === '/saved') {
      const s = await API.session.get(); if (!s.signed_in) return json(res, 401, { ok: false, error: 'auth_required', message: 'Sign in first' });
      return q.expand ? ok(await API.saved.list()) : ok({ ids: await API.saved.ids() }); }
    if (req.method === 'POST' && p === '/saved') return ok(await API.saved.add(body.id));
    if (req.method === 'DELETE' && m(/^\/saved\/([^/]+)$/)) return ok(await API.saved.remove(decodeURIComponent(m(/^\/saved\/([^/]+)$/)[1])));
    if (req.method === 'GET' && p === '/alerts') return ok({ alerts: await API.alerts.list() });
    if (req.method === 'POST' && p === '/alerts') return ok({ alert: await API.alerts.create(body) });
    if (req.method === 'PATCH' && m(/^\/alerts\/([^/]+)$/)) return ok({ alert: await API.alerts.update(m(/^\/alerts\/([^/]+)$/)[1], body) });
    if (req.method === 'DELETE' && m(/^\/alerts\/([^/]+)$/)) return ok(await API.alerts.remove(m(/^\/alerts\/([^/]+)$/)[1]));
    if (req.method === 'GET' && p === '/billing/plans') return ok({ plans: await API.billing.plans({ market: q.market }) });
    if (req.method === 'POST' && p === '/billing/checkout') return ok(await API.billing.startCheckout(body));
    if (req.method === 'POST' && p === '/billing/confirm') return ok(await API.billing.completeCheckout({ session_id: body.session_id }));
    if (req.method === 'POST' && p === '/billing/portal') return ok({ url: '/account.html' });
    if (req.method === 'POST' && m(/^\/inbox\/(organiser_submission|partnership_enquiry|listing_report|waitlist)$/)) {
      const kind = m(/^\/inbox\/([a-z_]+)$/)[1];
      const r = kind === 'organiser_submission' ? await API.organisers.submitListing(body) : kind === 'listing_report' ? await API.feedback.report(body)
        : kind === 'waitlist' ? await API.waitlist.join(body) : { reference: 'PE-' + Date.now().toString(36) };
      return ok(Object.assign({ reference: r.reference || 'OK' }, r)); }
    return json(res, 404, { ok: false, error: 'not_found', message: 'No such endpoint' });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e.code || 'internal_error', message: e.message, fields: e.fields });
  }
}

function serveStatic(req, res, url) {
  let f = decodeURIComponent(url.pathname);
  if (f === '/') f = '/index.html';
  const file = path.normalize(path.join(pub, f));
  if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    return send(res, 404, 'Not found', { 'content-type': 'text/plain' });
  send(res, 200, fs.readFileSync(file), { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/favicon.ico') return send(res, 204, '');
  if (url.pathname.startsWith('/api/v3/')) return api(req, res, url);
  return serveStatic(req, res, url);
}).listen(PORT, '127.0.0.1', () => console.log(`FindPitches V3 site + stub API on http://127.0.0.1:${PORT} (${fx.opportunities.length} opportunities, today=${today})`));
