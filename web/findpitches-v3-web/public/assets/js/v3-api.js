/*
 * FindPitches V3 API client: the ONLY data adapter of the V3 site.
 *
 * Talks to this site's own origin under /api/v3/* (contract: contract/V3_CUSTOMER_API.md). Credentials, the
 * database, entitlement checks and redaction all live server-side in V3. Responses are already in the screen
 * shapes the pages render (contract §3), so this file only does transport, CSRF and error mapping.
 *
 * Nothing here refers to, or falls back to, any other system or any built-in data.
 */
(function () {
  const FP = (window.FP = window.FP || {});
  const translateUI=FP.i18n.tr, uiHTML=FP.i18n.html;
  const BASE = (window.FP_CONFIG && window.FP_CONFIG.apiBase) || '/api/v3';

  class ApiError extends Error {
    constructor(code, status, message, extra) { super(message || code); this.code = code; this.status = status; Object.assign(this, extra || {}); }
  }
  const notAvailable = (what) => Promise.reject(new ApiError('not_available', 501, translateUI("{0} isn’t available here.",[what])));

  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)fp_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  const qs = (p) => {
    const u = new URLSearchParams();
    Object.entries(p || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v)) { if (v.length) u.set(k, v.join(',')); } else u.set(k, String(v));
    });
    const s = u.toString();
    return s ? '?' + s : '';
  };

  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method, credentials: 'same-origin',
        headers: Object.assign({ accept: 'application/json' },
          body !== undefined ? { 'content-type': 'application/json' } : {},
          method !== 'GET' ? { 'x-csrf-token': csrfToken() } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new ApiError('network_error', 0, translateUI('We couldn’t reach FindPitches. Check your connection and try again.'));
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.ok === false) {
      throw new ApiError((data && data.error) || 'internal_error', res.status,
        (data && translateUI(data.message)) || translateUI('Something went wrong. Please try again.'), data && data.fields ? { fields: data.fields } : {});
    }
    return data;
  }
  // The server issues the fp_csrf cookie on the first GET (session). Make sure one exists before any write.
  let primed = null;
  const prime = () => (primed = primed || (csrfToken() ? Promise.resolve() : call('GET', '/session').catch(() => {})));
  const send = async (method, path, body = {}) => { await prime(); return call(method, path, body); };

  function takeSeoResponse(path) {
    const node=document.getElementById('fp-seo-response');if(!node)return null;
    // Consume once, including invalid/expired data. Never keep a browser cache.
    node.remove();
    try {
      const data=JSON.parse(node.textContent),now=Date.now(),created=Date.parse(data.created_at),expires=Date.parse(data.expires_at);
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
      const part=type=>parts.find(p=>p.type===type).value,day=part('year')+'-'+part('month')+'-'+part('day');
      if(FP.state?.session?.signed_in||data.schema!=='findpitches-v3-anonymous-seo-response-v1'||data.path!==path||
        !Number.isFinite(created)||!Number.isFinite(expires)||now<created||now>=expires||expires-created>10000||data.london_day!==day||
        !data.page||!Array.isArray(data.page.search?.results)||!data.page.search.results.every(r=>r.access?.locked===true&&r.access.application_url===null&&r.access.source_url===null))return null;
      return data.page;
    }catch{return null;}
  }

  // Event-type labels are presentation config (contract §3.4), shipped with the site.
  const TYPES = {
    christmas_market: translateUI('Christmas market'), holiday_market: translateUI('Holiday market'), food_festival: translateUI('Food festival'), festival: translateUI('Festival'),
    market: translateUI('Market'), street_trading: translateUI('Street trading'), show: translateUI('Show'), concession: translateUI('Concession'), event: translateUI('Event'), sport: translateUI('Sports & stadiums')
  };

  FP.v3Api = {
    live: true,           // a real service: real sign-in, real payments, server-side entitlement
    ApiError,
    meta: {
      async home() { return call('GET', '/home'); },
      async markets(p) { return (await call('GET', '/markets'+qs(p))).markets; },
      async stats() { return call('GET', '/stats'); },
      types() { return TYPES; },
      async regions({ market, registry_only }) { return (await call('GET', '/regions' + qs({ market, registry_only }))).regions; }
    },
    geo: {
      async resolve({ market, q }) { return (await call('GET', '/geo/resolve' + qs({ market, q }))).location; }
    },
    opportunities: {
      async search(p = {}) {
        return call('GET', '/opportunities' + qs({
          market: p.market, q: p.q, q_text: p.q_text, region: p.region, radius_km: p.radius_km, types: p.types, sells: p.sells,
          organiser_types: p.organiser_types, when: p.when, month: p.month, sort: p.sort, page: p.page, page_size: p.page_size
        }));
      },
      async count(p = {}) {
        return call('GET', '/opportunities/count' + qs({
          market: p.market, q: p.q, q_text: p.q_text, region: p.region, radius_km: p.radius_km, types: p.types, sells: p.sells,
          organiser_types: p.organiser_types, when: p.when, month: p.month
        }));
      },
      async get(id) { return (await call('GET', '/opportunities/' + encodeURIComponent(id))).opportunity; },
      async upcoming({ market, limit = 10, type } = {}) { return (await call('GET', '/opportunities/upcoming' + qs({ market, limit, type }))).items; },
      async byIds(ids) { return (await send('POST', '/opportunities/by-ids', { ids })).items; }
    },
    seo: {
      async page(path) { return takeSeoResponse(path)??(await call('GET', '/seo/page'+qs({path}))).page; },
      async inventory({ market, intents }) {
        return send('POST', '/seo/inventory', { market, intents: (intents || []).map(i => ({ key: i.key, filters: i.filters || {} })) });
      }
    },
    session: {
      async get() { return call('GET', '/session'); },
      async requestLink({ email }) {
        const r = await send('POST', '/session/link', { email, next: location.pathname + location.search, locale: FP.i18n.current });
        return { sent: true, email, dev_link: r.dev_link || null };
      },
      async completeLink({ token }) { return send('POST', '/session/verify', { token }); },
      async signOut() { await send('POST', '/session/logout'); return { ok: true }; },
      async updateProfile(fields) { return send('PATCH', '/session/profile', fields); }
    },
    saved: {
      async ids() {
        try { return (await call('GET', '/saved')).ids; }
        catch (e) { if (e.status === 401) return []; throw e; }
      },
      async list() { return call('GET', '/saved?expand=1'); },
      async add(id) { return send('POST', '/saved', { id }); },
      async remove(id) { return send('DELETE', '/saved/' + encodeURIComponent(id)); }
    },
    alerts: {
      async list() { return (await call('GET', '/alerts')).alerts; },
      async create(a) { return (await send('POST', '/alerts', a)).alert; },
      async update(id, patch) { return (await send('PATCH', '/alerts/' + encodeURIComponent(id), patch)).alert; },
      async remove(id) { return send('DELETE', '/alerts/' + encodeURIComponent(id)); }
    },
    billing: {
      async plans({ market, currency } = {}) { return (await call('GET', '/billing/plans' + qs({ market: market || 'GB',currency }))).plans; },
      async startCheckout({ plan_id, market, currency }) { const r = await send('POST', '/billing/checkout', { plan_id, market, locale: FP.i18n.current,...(currency?{currency}:{}) }); return { checkout_url: r.checkout_url }; },
      async confirmCheckout({ session_id }) { return send('POST', '/billing/confirm', { session_id }); },
      async portal() { return (await send('POST', '/billing/portal', {locale:FP.i18n.current})).url; },
      async summary() { return (await call('GET', '/billing/summary')).billing; },
      async change(action, revision) { return (await send('POST', '/billing/change', {action, revision})).billing; },
      async updatePayment(revision) { return (await send('POST', '/billing/payment', {revision, locale:FP.i18n.current})).checkout_url; },
      async confirmPayment(session_id) { return (await send('POST', '/billing/payment/confirm', {session_id})).billing; },
      // Hosted Portal remains an explicit recovery fallback only.
      getCheckout: () => notAvailable(translateUI('Checkout details')), completeCheckout: () => notAvailable(translateUI('Checkout')),
      cancel: () => notAvailable(translateUI('Cancelling here')), resume: () => notAvailable(translateUI('Resuming here'))
    },
    organisers: {
      async submitListing(form) { return send('POST', '/inbox/organiser_submission', form); },
      async contact(form) { return send('POST', '/inbox/partnership_enquiry', form); }
    },
    feedback: { async report(r) { return send('POST', '/inbox/listing_report', r); } },
    waitlist: { async join(r) { return send('POST', '/inbox/waitlist', r); } },
    // No analytics service is connected. Events stay in FP.track.log (in the page) only.
    analytics: { track() {} }
  };
})();
