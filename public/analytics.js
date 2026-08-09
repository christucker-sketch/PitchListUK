(function () {
  const SESSION_KEY = 'pitchlist_analytics_session';
  const ATTR_KEY = 'pitchlist_attribution';

  function randomId() {
    if (window.crypto && crypto.getRandomValues) {
      const array = new Uint8Array(12);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function sessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = randomId();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      return '';
    }
  }

  function attribution() {
    const params = new URLSearchParams(window.location.search);
    const current = {
      source: params.get('utm_source') || '',
      medium: params.get('utm_medium') || '',
      campaign: params.get('utm_campaign') || '',
      content: params.get('utm_content') || '',
      term: params.get('utm_term') || ''
    };
    const hasCampaign = Object.values(current).some(Boolean) || params.has('fbclid') || params.has('gclid');
    try {
      if (hasCampaign) localStorage.setItem(ATTR_KEY, JSON.stringify(current));
      return hasCampaign ? current : JSON.parse(localStorage.getItem(ATTR_KEY) || '{}');
    } catch {
      return current;
    }
  }

  function post(payload) {
    const body = JSON.stringify({
      url: window.location.href,
      page: document.title,
      referrer: document.referrer,
      session_id: sessionId(),
      ...attribution(),
      ...payload
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
    path: window.location.pathname,
    query: window.location.search.slice(0, 180)
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
    if (url.pathname === '/database') {
      window.pitchlistTrack('database_cta_click', { label: link.textContent.trim().slice(0, 80), from: window.location.pathname });
    }
  }, { capture: true });
}());
