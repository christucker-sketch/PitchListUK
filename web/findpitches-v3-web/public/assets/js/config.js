/*
 * FindPitches V3 — runtime configuration (browser). No environment-specific values and no secrets.
 * The site always talks to its own origin: every data call goes to /api/v3/* (see contract/V3_CUSTOMER_API.md).
 * There is no mock mode and no fallback data in this build.
 */
(function () {
  window.FP_CONFIG = Object.freeze({
    mode: 'v3',
    build: 'findpitches-v3-web',
    today: new Date().toISOString().slice(0, 10),
    apiBase: '/api/v3'
  });
})();

/* ---------- Network guard: scripts may only talk to this site ---------- */
(function guard() {
  const ok = (url) => {
    try { const u = new URL(url, location.href); return u.origin === location.origin; }
    catch (e) { return false; }
  };
  const block = (what, url) => { const msg = `[FindPitches] Blocked ${what} to ${url}: the browser only talks to this site's own /api.`; console.error(msg); return msg; };
  const f = window.fetch;
  if (f) window.fetch = function (input, init) { const url = typeof input === 'string' ? input : (input && input.url); if (!ok(url)) return Promise.reject(new Error(block('fetch', url))); return f.call(this, input, init); };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) { if (!ok(url)) throw new Error(block('XHR', url)); return open.apply(this, arguments); };
  if (navigator.sendBeacon) { const sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (url, d) => { if (!ok(url)) { block('beacon', url); return false; } return sb(url, d); }; }
  if (window.WebSocket) { const WS = window.WebSocket; window.WebSocket = function (url, p) { if (!ok(url)) throw new Error(block('WebSocket', url)); return new WS(url, p); }; }
  if (window.EventSource) { const ES = window.EventSource; window.EventSource = function (url, c) { if (!ok(url)) throw new Error(block('EventSource', url)); return new ES(url, c); }; }
})();
