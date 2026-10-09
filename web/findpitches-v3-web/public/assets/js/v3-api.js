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
  const BASE = (window.FP_CONFIG && window.FP_CONFIG.apiBase) || '/api/v3';

  class ApiError extends Error {
    constructor(code, status, message, extra) { super(message || code); this.code = code; this.status = status; Object.assign(this, extra || {}); }
  }
  const notAvailable = (what) => Promise.reject(new ApiError('not_available', 501, `${what} isn’t available here.`));

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
      throw new ApiError('network_error', 0, 'We couldn’t reach FindPitches. Check your connection and try again.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.ok === false) {
      throw new ApiError((data && data.error) || 'internal_error', res.status,
        (data && data.message) || 'Something went wrong. Please try again.', data && data.fields ? { fields: data.fields } : {});
    }
    return data;
  }
  // The server issues the fp_csrf cookie on the first GET (session). Make sure one exists before any write.
  let primed = null;
  const prime = () => (primed = primed || (csrfToken() ? Promise.resolve() : call('GET', '/session').catch(() => {})));
  const send = async (method, path, body = {}) => { await prime(); return call(method, path, body); };

  // Event-type labels are presentation config (contract §3.4), shipped with the site.
  const TYPES = {
    christmas_market: 'Christmas market', holiday_market: 'Holiday market', food_festival: 'Food festival', festival: 'Festival',
    market: 'Market', street_trading: 'Street trading', show: 'Show', concession: 'Concession', event: 'Event', sport: 'Sports & stadiums'
  };

  FP.v3Api = {
    live: true,           // a real service: real sign-in, real payments, server-side entitlement
    ApiError,
    meta: {
      async markets() { return (await call('GET', '/markets')).markets; },
      async stats() { return call('GET', '/stats'); },
      types() { return TYPES; },
      async regions({ market }) { return (await call('GET', '/regions' + qs({ market }))).regions; }
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
      async inventory({ market, intents }) {
        return send('POST', '/seo/inventory', { market, intents: (intents || []).map(i => ({ key: i.key, filters: i.filters || {} })) });
      }
    },
    session: {
      async get() { return call('GET', '/session'); },
      async requestLink({ email }) {
        const r = await send('POST', '/session/link', { email, next: location.pathname + location.search });
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
      async plans({ market } = {}) { return (await call('GET', '/billing/plans' + qs({ market: market || 'GB' }))).plans; },
      async startCheckout({ plan_id, market }) { const r = await send('POST', '/billing/checkout', { plan_id, market }); return { checkout_url: r.checkout_url }; },
      async confirmCheckout({ session_id }) { return send('POST', '/billing/confirm', { session_id }); },
      async portal() { return (await send('POST', '/billing/portal')).url; },
      // Plan changes and cancellation happen in the payment provider's hosted portal (billing.portal).
      getCheckout: () => notAvailable('Checkout details'), completeCheckout: () => notAvailable('Checkout'),
      cancel: () => notAvailable('Cancelling here'), resume: () => notAvailable('Resuming here')
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
