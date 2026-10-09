/*
 * FindPitches routing helpers (frontend concern, no data).
 *
 * Canonical market identifiers are ALWAYS the uppercase market codes used by the backend:
 *   GB, US, CA, AU, IE, NZ, SG, HK
 * Customer-facing URLs use friendly SEO slugs (GB → /uk/). Translation happens only here.
 *
 * The offline draft is a set of static files, so "clean" paths such as /uk/stall-holders-wanted/kent/
 * are opened as  seo.html?path=/uk/stall-holders-wanted/kent/  — the canonical (clean) URL is still
 * what the SEO layer emits in <link rel=canonical>, sitemaps and hreflang.
 */
(function () {
  const FP = (window.FP = window.FP || {});
  const MARKET_ORDER = ['GB', 'US', 'CA', 'AU', 'IE', 'NZ', 'SG', 'HK'];
  const SLUG = { GB: 'uk', US: 'us', CA: 'ca', AU: 'au', IE: 'ie', NZ: 'nz', SG: 'sg', HK: 'hk' };
  const FROM_SLUG = Object.fromEntries(Object.entries(SLUG).map(([k, v]) => [v, k]));
  const SITE = 'https://findpitches.com';

  const routes = {
    SITE, MARKET_ORDER,
    slugOf: code => SLUG[String(code || '').toUpperCase()] || null,
    // Accepts a route slug ('uk'), a canonical code ('GB') or legacy lowercase codes; returns canonical code or null.
    marketOf(v) {
      if (!v) return null; const s = String(v).trim();
      if (SLUG[s.toUpperCase()]) return s.toUpperCase();
      return FROM_SLUG[s.toLowerCase()] || null;
    },
    /* Canonical (production) paths */
    marketPath: m => `/${SLUG[m]}/`,
    opportunityPath: (m, id) => `/${SLUG[m]}/opportunity/${encodeURIComponent(id)}/`,
    finderPath: m => `/${SLUG[m]}/find-pitches/`,
    abs: path => SITE + path,
    /* Draft (static file) links */
    draft: {
      finder: (m, params) => 'finder.html?' + new URLSearchParams(Object.assign({ cc: SLUG[m] }, params || {})).toString(),
      opportunity: id => 'opportunity.html?id=' + encodeURIComponent(id),
      seo: path => 'seo.html?path=' + encodeURIComponent(path)
    }
  };
  FP.routes = routes;
})();
