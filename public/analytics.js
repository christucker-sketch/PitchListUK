(function () {
  const ATTR_KEY = 'pitchlist_attribution';
  const FIRST_TOUCH_KEY = 'pitchlist_first_touch_v1';
  const ANALYTICS_SESSION_KEY = 'pitchlist_analytics_session_v2';
  const ANALYTICS_SESSION_PATTERN = /^as_[a-f0-9]{32}$/;
  const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const CLICK_ID_KEYS = ['gclid', 'fbclid'];
  const ATTRIBUTION_ALIASES = {
    utm_source: 'source',
    utm_medium: 'medium',
    utm_campaign: 'campaign',
    utm_term: 'term',
    utm_content: 'content'
  };
  let volatileAnalyticsSessionId = '';

  function decoded(value) {
    let output = String(value || '');
    for (let i = 0; i < 3; i += 1) {
      try {
        const next = decodeURIComponent(output.replace(/\+/g, ' '));
        if (next === output) break;
        output = next;
      } catch {
        break;
      }
    }
    return output;
  }

  function sensitiveKey(value) {
    const key = decoded(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    return key === 'token'
      || key === 'session'
      || key === 'checkout'
      || key.endsWith('token')
      || key.startsWith('session')
      || key.endsWith('session')
      || key.includes('accesstoken')
      || key.includes('sessionid')
      || key.includes('sessionidentifier')
      || key.includes('stripesession')
      || key.includes('checkoutsession')
      || key.includes('checkoutid')
      || key.includes('checkoutidentifier');
  }

  function sensitiveFragment(value) {
    const text = decoded(value).toLowerCase();
    return /(?:access[\s_-]*token|session[\s_-]*(?:id|identifier)|checkout[\s_-]*(?:session|id)|(?:^|[?&#;\s])(?:token|session|checkout)\s*[=:])/.test(text)
      || /\b(?:cs_(?:test|live)|sess_|cus_|sub_)[a-z0-9_-]+\b/.test(text)
      || /\bas_[a-f0-9]{32}\b/.test(text)
      || /^(?:[a-f0-9]{24}|[a-f0-9]{64})$/.test(text.trim());
  }

  function safeValue(value, max) {
    const output = String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
    return sensitiveFragment(output) ? '' : output;
  }

  function clickIdPresence(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    return undefined;
  }

  function safeLink(value) {
    const raw = String(value || '').trim();
    if (/^mailto:/i.test(raw)) return 'mailto';
    try {
      const url = new URL(raw, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol) || sensitiveFragment(url.pathname)) return '';
      return url.origin === window.location.origin ? url.pathname : url.hostname;
    } catch {
      return '';
    }
  }

  function safeProperties(value, depth) {
    if (depth > 5) return undefined;
    if (Array.isArray(value)) {
      return value.map(item => safeProperties(item, depth + 1)).filter(item => item !== undefined).slice(0, 20);
    }
    if (value && typeof value === 'object') {
      const output = {};
      for (const [rawKey, item] of Object.entries(value).slice(0, 80)) {
        const key = decoded(rawKey).toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').slice(0, 50);
        const compact = key.replace(/[^a-z0-9]/g, '');
        if (!key || sensitiveKey(rawKey) || ['query', 'search', 'searchparams'].includes(compact)) continue;
        if (CLICK_ID_KEYS.includes(compact)) {
          const presence = clickIdPresence(item);
          if (presence !== undefined) output[key] = presence;
          continue;
        }
        let cleaned;
        if (typeof item === 'string' && ['url', 'href', 'path'].includes(compact)) cleaned = safeLink(item);
        else if (typeof item === 'string' && compact === 'referrer') cleaned = safeReferrer(item);
        else cleaned = safeProperties(item, depth + 1);
        if (cleaned !== undefined && cleaned !== '') output[key] = cleaned;
      }
      return output;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    const output = safeValue(value, 160);
    return output || undefined;
  }

  function safeReferrer(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || sensitiveFragment(url.pathname)) return '';
      return `${url.origin}${url.pathname}`.slice(0, 220);
    } catch {
      return '';
    }
  }

  function firstTouch() {
    const current = {
      first_landing_path: safeLink(window.location.pathname || '/') || '/',
      first_referrer: safeReferrer(document.referrer)
    };
    try {
      const stored = safeProperties(JSON.parse(window.sessionStorage.getItem(FIRST_TOUCH_KEY) || '{}'), 0) || {};
      if (stored.first_landing_path) return stored;
      window.sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(current));
    } catch {
      // First-touch attribution is optional when session storage is unavailable.
    }
    return current;
  }

  function attribution() {
    const params = new URLSearchParams(window.location.search);
    const current = {};
    for (const key of ATTRIBUTION_KEYS) {
      const value = safeValue(params.get(key) || '', 160);
      if (value) current[key] = value;
    }
    const clickPresence = Object.fromEntries(CLICK_ID_KEYS.map(key => [
      key,
      params.getAll(key).some(value => String(value).trim().length > 0)
    ]));
    const hasCampaign = Object.keys(current).length > 0 || CLICK_ID_KEYS.some(key => clickPresence[key]);
    const currentAttribution = { ...current, ...clickPresence };
    try {
      if (hasCampaign) localStorage.setItem(ATTR_KEY, JSON.stringify(currentAttribution));
      if (hasCampaign) return currentAttribution;
      const stored = JSON.parse(localStorage.getItem(ATTR_KEY) || '{}');
      const storedCampaign = Object.fromEntries(ATTRIBUTION_KEYS.map(key => {
        const alias = ATTRIBUTION_ALIASES[key];
        const candidate = stored[key] ?? (alias ? stored[alias] : '');
        return [key, ['string', 'number'].includes(typeof candidate) ? safeValue(candidate, 160) : ''];
      }).filter(([, value]) => value));
      const storedAttribution = {
        ...storedCampaign,
        ...Object.fromEntries(CLICK_ID_KEYS.map(key => [key, stored[key] === true]))
      };
      localStorage.setItem(ATTR_KEY, JSON.stringify(storedAttribution));
      return storedAttribution;
    } catch {
      return currentAttribution;
    }
  }

  function analyticsSessionId() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return '';
    if (ANALYTICS_SESSION_PATTERN.test(volatileAnalyticsSessionId)) return volatileAnalyticsSessionId;
    try {
      const stored = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY) || '';
      if (ANALYTICS_SESSION_PATTERN.test(stored)) {
        volatileAnalyticsSessionId = stored;
        return stored;
      }
    } catch {
      // Storage is optional; a volatile cryptographic ID can still correlate this page.
    }
    const bytes = new Uint8Array(16);
    try {
      window.crypto.getRandomValues(bytes);
    } catch {
      return '';
    }
    volatileAnalyticsSessionId = `as_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    try {
      window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, volatileAnalyticsSessionId);
    } catch {
      // Analytics must continue without persistent session storage.
    }
    return volatileAnalyticsSessionId;
  }

  function post(payload) {
    const sessionId = analyticsSessionId();
    const properties = safeProperties(payload.properties || {}, 0) || {};
    const body = JSON.stringify({
      path: window.location.pathname || '/',
      page: safeValue(document.title, 120),
      referrer: safeReferrer(document.referrer),
      ...attribution(),
      ...(sessionId ? { analytics_session_id: sessionId } : {}),
      event: safeValue(payload.event, 80) || 'event',
      properties: { ...properties, ...firstTouch() }
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/event', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  }

  window.pitchlistTrack = function pitchlistTrack(event, properties) {
    post({ event, properties: properties || {} });
  };

  window.pitchlistTrack('page_view', {
    path: window.location.pathname
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const url = new URL(href, window.location.href);
    if (href.startsWith('mailto:')) {
      window.pitchlistTrack('link_click', { label: 'email', href });
      return;
    }
    if (url.origin !== window.location.origin) {
      window.pitchlistTrack('link_click', { label: link.textContent.trim().slice(0, 80), href: url.hostname });
      return;
    }
    if (url.pathname === '/find-pitches' || url.pathname === '/database') {
      window.pitchlistTrack('database_cta_click', { label: link.textContent.trim().slice(0, 80), from: window.location.pathname });
    }
  }, { capture: true });
}());
