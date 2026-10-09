/*
 * FindPitches SEO core (offline draft).
 * Pure functions: path resolution, canonical/redirect rules, metadata, structured data,
 * indexability, internal links and sitemap entries. No DOM, no network. Designed so the same
 * logic can later run in a server/edge renderer against the real customer API.
 */
(function () {
  const FP = (window.FP = window.FP || {});
  const R = FP.routes, CFG = FP.seoConfig;
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const inPlace = name => /^the\s/i.test(name) ? 'the ' + name.slice(4) : name;
  // Regions like 'South East' read as 'the South East' mid-sentence.
  const placeOf = r => r.level === 'region' && /^(North|South|East|West|Yorkshire)/.test(r.name) ? 'the ' + r.name : inPlace(r.name);
  const TYPE_PLURAL = { christmas_market: 'Christmas markets', holiday_market: 'holiday markets', food_festival: 'food festivals', festival: 'festivals', market: 'markets', street_trading: 'street trading pitches', show: 'shows', concession: 'concessions', event: 'events', sport: 'sporting events' };
  const listJoin = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const clip = (s, n) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';

  /* ---------------- 1. Path resolution ---------------- */
  // ctx: { markets: [...], regions: { GB: [...regions] , ... } }
  function resolve(input, ctx) {
    let raw = String(input || '/').trim();
    const fromPitchList = /^(https?:\/\/)?(www\.)?\/?pitchlist\.uk/i.test(raw);
    raw = raw.replace(/^(https?:\/\/)?(www\.)?\/?pitchlist\.uk/i, '').replace(/^https?:\/\/[^/]+/i, '');
    if (fromPitchList && !raw.replace(/\//g, '')) return { kind: 'redirect', status: 301, to: '/uk/', reason: 'Legacy PitchList homepage' };
    const legacyHost = /^pitchlist\.uk/i.test(String(input || '')) || /^\/?pitchlist/i.test(raw);
    let path = raw.split(/[?#]/)[0];
    if (!path.startsWith('/')) path = '/' + path;
    const segs = path.split('/').filter(Boolean);
    const norm = '/' + segs.map(s => s.toLowerCase()).join('/') + (segs.length ? '/' : '');

    // Legacy PitchList areas pages: /areas/kent → /uk/kent/
    if (segs[0] && segs[0].toLowerCase() === 'areas' && segs[1]) {
      const s = segs[1].toLowerCase().replace(/\.html$/, ''); const slug = CFG.areaOverrides[s] || s;
      const ok = (ctx.regions.GB || []).some(r => r.slug === slug);
      return { kind: 'redirect', status: 301, to: ok ? `/uk/${slug}/` : '/uk/', reason: 'Legacy PitchList area page' };
    }
    // Legacy PitchList intent pages at the root: /stall-holders-wanted → /uk/stall-holders-wanted/
    if (segs.length === 1 && !R.marketOf(segs[0])) {
      const s = segs[0].toLowerCase().replace(/\.html$/, '');
      const hit = CFG.legacy.find(l => l.from === 'pitchlist.uk/' + s);
      if (hit) return { kind: 'redirect', status: 301, to: hit.to, reason: 'Legacy PitchList page' + (hit.note ? ` (${hit.note})` : '') };
      return { kind: 'not_found', reason: `No page at ${path}` };
    }
    if (!segs.length) return { kind: 'app', to: 'index.html', reason: 'Global homepage' };

    const market = R.marketOf(segs[0]);
    if (!market) return { kind: 'not_found', reason: `Unknown market "${segs[0]}"` };
    // Canonical codes in the URL (/gb/) redirect to the friendly slug (/uk/)
    if (segs[0].toLowerCase() !== R.slugOf(market)) return { kind: 'redirect', status: 301, to: norm.replace(/^\/[^/]+\//, `/${R.slugOf(market)}/`), reason: 'Market slug is the friendly form' };
    if (path !== norm) return { kind: 'redirect', status: 301, to: norm, reason: 'Lowercase + trailing slash canonical form' };

    const regions = ctx.regions[market] || [];
    const regionBy = s => regions.find(r => r.slug === s) || null;
    const a = segs[1] && segs[1].toLowerCase(), b = segs[2] && segs[2].toLowerCase();
    if (segs.length > 3) return { kind: 'not_found', reason: 'Too many path segments' };
    if (!a) return page(market, null, null);
    if (a === 'find-pitches') return { kind: 'app', to: R.draft.finder(market), reason: 'Finder (application page, not an SEO landing page)' };
    if (a === 'opportunity' && b) return { kind: 'app', to: R.draft.opportunity(segs[2]), reason: 'Opportunity page' };
    const ia = CFG.bySlug(market, a), ra = regionBy(a);
    if (!b) {
      if (ia) return page(market, ia, null);
      if (ra && !CFG.hubOnly(market)) return page(market, null, ra);
      return { kind: 'not_found', reason: `Nothing called "${a}" in ${market}` };
    }
    const ib = CFG.bySlug(market, b), rb = regionBy(b);
    if (ia && rb && ia.generic) return { kind: 'redirect', status: 301, to: `/${R.slugOf(market)}/${rb.slug}/`, reason: `"${ia.labels[market]}" in a region is the same page as the region page` };
    if (ia && rb) return page(market, ia, rb);
    if (ra && ib && ib.generic) return { kind: 'redirect', status: 301, to: `/${R.slugOf(market)}/${ra.slug}/`, reason: `"${ib.labels[market]}" in a region is the same page as the region page` };
    if (ra && ib) return { kind: 'redirect', status: 301, to: `/${R.slugOf(market)}/${ib.slugs[market]}/${ra.slug}/`, reason: 'Canonical order is /market/intent/region/' };
    return { kind: 'not_found', reason: `No page for "${a}/${b}"` };

    function page(m, intent, region) {
      const p = `/${R.slugOf(m)}/` + (intent ? intent.slugs[m] + '/' : '') + (region ? region.slug + '/' : '');
      const type = intent && region ? 'combo' : intent ? 'intent' : region ? 'region' : 'market';
      return { kind: 'page', type, market: m, intent, region, path: p, legacyHost };
    }
  }

  /* ---------------- 2. Search filters for a page ---------------- */
  function filters(d) {
    const f = { market: d.market };
    if (d.intent) Object.assign(f, JSON.parse(JSON.stringify(d.intent.filters)));
    if (d.region) f.region = d.region.id;
    return f;
  }
  const pathOf = (m, intent, region) => `/${R.slugOf(m)}/` + (intent ? intent.slugs[m] + '/' : '') + (region ? region.slug + '/' : '');

  /* ---------------- 3. Counts & indexability ---------------- */
  function countFor(inv, intent, region) {
    if (!inv) return 0;
    if (intent && region) return inv.combos[intent.key + '|' + region.id] || 0;
    if (intent) return inv.intents[intent.key] || 0;
    if (region) return inv.regions[region.id] || 0;
    return inv.market_total || 0;
  }
  // Indexability is more than a listing count. A page is indexable only when ALL checks pass:
  //   launch      the market is customer-live (launch_status from the market registry)
  //   eligibility at least thresholds.eligibility_min live listings (configurable, in seo-config.js)
  //   unique      its listings aren't identical to a broader page's (child pages must add something)
  //   relevance   it targets a genuine place/intent (not a catch-all bucket; not blocked by market policy)
  // Pages that fail stay useful to visitors but are noindex,follow, left out of the sitemap, the indexable inventory and
  // automated internal links.
  function assess(market, inv, regById, intent, region) {
    const min = CFG.thresholds.eligibility_min, code = market.code;
    const count = countFor(inv, intent, region); const checks = [];
    const live = market.launch_status === 'live';
    checks.push({ id: 'launch', label: 'Market is live', ok: live, detail: live ? `${market.name} is customer-live` : `${market.name} is ${market.launch_status}: not launched for customers yet` });
    checks.push({ id: 'eligibility', label: `At least ${min} live listings`, ok: count >= min, detail: `${count} live listing${count === 1 ? '' : 's'}${count < min ? ': thin page' : ''}` });
    const bad = CFG.nonIndexableRegions || {};
    const okParent = r => r && !bad[r.id];
    let dup = null;
    if (count > 0) {
      const parent = region && region.parent_id ? regById[region.parent_id] : null;
      if (intent && region) {
        if (count === countFor(inv, null, region)) dup = pathOf(code, null, region);
        else if (okParent(parent) && count === countFor(inv, intent, parent)) dup = pathOf(code, intent, parent);
      } else if (region) { if (okParent(parent) && count === countFor(inv, null, parent)) dup = pathOf(code, null, parent); }
      else if (intent && !intent.generic) { if (count === countFor(inv, null, null)) dup = pathOf(code); }
    }
    checks.push({ id: 'unique', label: 'Adds listings beyond a broader page', ok: !dup, detail: dup ? `Same listings as ${dup}` : count ? 'Distinct set of listings' : 'n/a (no listings)' });
    let rel = null;
    if (region && bad[region.id]) rel = bad[region.id];
    if ((intent || region) && CFG.hubOnly(code)) rel = (CFG.marketPolicy[code] || {}).note || 'Market is hub-only';
    checks.push({ id: 'relevance', label: 'Genuine place and intent', ok: !rel, detail: rel || (region ? `${region.name} (${region.level})` : intent ? intent.labels[code] : 'Market hub') });
    const fail = checks.find(c => !c.ok);
    return { count, eligible: count >= min, indexable: !fail, reason: fail ? fail.detail : 'Passes all checks', checks, duplicate_of: dup };
  }
  const indexability = (d, market, inv, regById) => assess(market, inv, regById || {}, d.intent, d.region);

  /* ---------------- 4. Metadata ---------------- */
  function words(market) { const L = market.vocab.listings || 'Opportunities'; return { noun: L.toLowerCase(), Noun: L }; }
  function seasonYear(search) {
    const ys = {}; (search.results || []).forEach(o => { if (o.dates.start) { const y = o.dates.start.slice(0, 4); ys[y] = (ys[y] || 0) + 1; } });
    const top = Object.entries(ys).sort((a, b) => b[1] - a[1])[0]; return top ? top[0] : null;
  }
  function meta(d, data) {
    const { market, search, inventory, regionPath, today } = data;
    const regById = Object.fromEntries((data.regions || []).map(r => [r.id, r]));
    const visible = data.visible || (search.results || []);
    const w = words(market);
    const place = d.region ? placeOf(d.region) : market.the;
    const label = d.intent ? d.intent.labels[d.market] : null;
    const count = countFor(inventory, d.intent, d.region);
    const ix = indexability(d, market, inventory, regById);
    const h1 = d.type === 'market' ? `${w.Noun} across ${market.the}`
      : d.type === 'region' ? `${w.Noun} in ${place}`
      : `${label} in ${place}`;
    const season = d.intent && ['festivals', 'christmas'].includes(d.intent.key) ? seasonYear(search) : null;
    const hubLong = `${w.Noun}, markets & festivals across ${market.the}`;
    let title = (d.type === 'market' ? ((hubLong + ' | FindPitches').length <= 65 ? hubLong : `${w.Noun} across ${market.the}`)
      : d.type === 'region' ? `${w.Noun} in ${place}: markets, fairs & festivals` : `${label}${season ? ' ' + season : ''} in ${place}`);
    if ((title + ' | FindPitches').length > 65 && d.type === 'region') title = `${w.Noun} in ${place}`;
    title = title + ' | FindPitches';
    const next = (search.results || []).filter(o => o.dates.start && o.dates.start >= today).sort((a, b) => a.dates.start.localeCompare(b.dates.start))[0];
    const fmt = iso => new Intl.DateTimeFormat(market.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
    const typesTop = Object.entries((search.facets && search.facets.types) || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => TYPE_PLURAL[k] || k);
    const description = clip(count
      ? `${d.intent ? label + ' in ' + place + ': ' + count + ' checked listings' : count + ' checked ' + w.noun + ' in ' + place}${typesTop.length ? ', including ' + listJoin(typesTop) : ''}. ${next ? `Next: ${next.title}, ${fmt(next.dates.start)}. ` : ''}Every listing links to the organiser.`
      : `Find ${d.intent ? label.toLowerCase() : w.noun} in ${place} on FindPitches. Checked listings straight from organisers, with alerts when new ones appear.`, 155);

    const canonical = R.abs(d.path);
    // Breadcrumbs follow the URL structure: market › intent › region ancestors › region
    const bc = [{ name: 'FindPitches', path: '/' }, { name: market.name, path: pathOf(d.market) }];
    if (d.intent) bc.push({ name: label, path: pathOf(d.market, d.intent) });
    (regionPath || []).forEach(r => bc.push({ name: r.name, path: pathOf(d.market, d.intent, r) }));

    // hreflang: only for pages that exist as equivalents in other markets (market hubs and market-level intents)
    const hreflang = [];
    if (ix.indexable && (d.type === 'market' || d.type === 'intent')) {
      (data.markets || []).forEach(m => {
        if (m.launch_status !== 'live') return;
        if (d.type === 'intent' && !CFG.intentFor(m.code, d.intent.key)) return;
        const inv = data.inventories && data.inventories[m.code]; if (!inv) return;
        const eq = d.type === 'intent' ? CFG.intentFor(m.code, d.intent.key) : null;
        if (assess(m, inv, {}, eq, null).indexable) hreflang.push({ lang: m.locale, href: R.abs(pathOf(m.code, d.type === 'intent' ? CFG.intentFor(m.code, d.intent.key) : null)) });
      });
      if (hreflang.length) hreflang.push({ lang: 'x-default', href: R.abs('/') });
    }

    const faq = faqs(d, data, { count, place, label, w, next, fmt });
    // Structured data is deliberately conservative (see docs/SEO_SYSTEM.md):
    //  - BreadcrumbList mirrors the visible breadcrumb exactly.
    //  - ItemList lists exactly the listings visible on the page (never the full count, never hidden items).
    //  - No FAQPage on commercial landing pages (the visible FAQ stays). No Event here: events live on opportunity pages.
    const jsonld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: bc.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: R.abs(b.path) })) }];
    if (visible.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'ItemList', name: h1, numberOfItems: visible.length,
      itemListElement: visible.map((o, i) => ({ '@type': 'ListItem', position: i + 1, url: R.abs(R.opportunityPath(o.market, o.id)), name: o.title })) });
    const intro = [];
    if (count) intro.push(`${count} checked ${d.intent ? 'listings' : w.noun} in ${place}${typesTop.length ? ', including ' + listJoin(typesTop) : ''}.${next ? ` The next one starts ${fmt(next.dates.start)}.` : ''}`);
    else intro.push(market.launch_status === 'live' ? `There are no live listings for this search right now.` : `FindPitches is building coverage in ${market.name}. Listings appear here once they’ve been checked.`);
    if (d.intent) intro.push(d.intent.blurb);
    intro.push('Every listing comes from the organiser’s own page and shows when we last checked it. You apply direct: we never take a cut.');
    const keywords = d.intent && d.intent.keywords ? (d.intent.keywords[d.market] || []) : [];
    return { title, description, h1, canonical, robots: ix.indexable ? 'index,follow' : 'noindex,follow', indexable: ix.indexable, eligible: ix.eligible, index_reason: ix.reason, checks: ix.checks, keywords, count, hreflang, breadcrumbs: bc, jsonld, faq, intro, label, place, season, next };
  }

  function faqs(d, data, x) {
    const m = data.market, g = (CFG.guidance[m.code] || []).slice(0, 3);
    const what = d.intent ? x.label.toLowerCase() : x.w.noun;
    const out = [
      { q: `How many ${what} are there in ${x.place}?`, a: x.count ? `FindPitches currently lists ${x.count} checked ${d.intent ? 'listings' : x.w.noun} in ${x.place}. The list updates as organisers open and close applications.` : `There are none live right now. Set an alert and we’ll email you when one is checked.` },
      { q: `How do I apply?`, a: `Each listing links to the organiser’s own application page. Organisers often ask for ${g.length ? g.join(', ') : 'insurance and photos of your stall'}.` },
      { q: `Does FindPitches guarantee me a ${m.vocab.pitch}?`, a: `No. Organisers choose their ${m.vocab.traders_short}. We make sure every listing is real, comes from the organiser, and shows when it was last checked.` }
    ];
    if (x.next) out.splice(1, 0, { q: `When is the next one?`, a: `${x.next.title} starts ${x.fmt(x.next.dates.start)} (${x.next.location.label}).` });
    return out;
  }

  /* ---------------- 5. Internal links ---------------- */
  // Automated internal links point ONLY at indexable pages (full assess(), not just a count).
  function links(d, data) {
    const { inventory: inv, regions, market } = data;
    const out = []; const intents = CFG.intentsFor(d.market);
    const regById = Object.fromEntries(regions.map(r => [r.id, r]));
    const L = (label, intent, region) => { const a = assess(market, inv, regById, intent, region); return a.indexable ? { label, path: pathOf(d.market, intent, region), count: a.count } : null; };
    const pageIntent = d.intent && d.intent.generic ? null : d.intent; // generic intent × region is the region page
    const keep = a => a.filter(Boolean);
    if (d.region) {
      const other = keep(intents.filter(i => !i.generic && (!d.intent || i.key !== d.intent.key)).map(i => L(i.labels[d.market], i, d.region)));
      if (other.length) out.push({ title: `More ways to trade in ${placeOf(d.region)}`, links: other });
      const kids = keep(regions.filter(r => r.parent_id === d.region.id).map(r => L(r.name, pageIntent, r)));
      if (kids.length) out.push({ title: `Areas in ${placeOf(d.region)}`, links: kids.sort((a, b) => a.label.localeCompare(b.label)) });
      if (d.region.parent_id && regById[d.region.parent_id]) { const l = L(regById[d.region.parent_id].name, pageIntent, regById[d.region.parent_id]); if (l) out.push({ title: 'Wider area', links: [l] }); }
      const sib = keep(regions.filter(r => r.id !== d.region.id && r.parent_id === d.region.parent_id).map(r => L(r.name, pageIntent, r))).sort((a, b) => b.count - a.count).slice(0, 12);
      if (sib.length) out.push({ title: d.intent ? `${d.intent.labels[d.market]} nearby` : 'Nearby', links: sib });
    } else {
      if (!d.intent) { const ints = keep(intents.map(i => L(i.labels[d.market], i, null))); if (ints.length) out.push({ title: 'Popular searches', links: ints }); }
      const top = keep(regions.filter(r => r.level !== 'county').map(r => L(r.name, pageIntent, r))).sort((a, b) => a.label.localeCompare(b.label));
      const lv = regions.find(r => r.level !== 'county'); // label from the taxonomy level, not the country
      if (top.length) out.push({ title: lv && lv.level === 'state' ? 'By state' : 'By region', links: top });
      const counties = keep(regions.filter(r => r.level === 'county').map(r => L(r.name, pageIntent, r))).sort((a, b) => a.label.localeCompare(b.label));
      if (counties.length) out.push({ title: 'By county', links: counties });
      if (d.intent) { const ints = keep(intents.filter(i => i.key !== d.intent.key).map(i => L(i.labels[d.market], i, null))); if (ints.length) out.push({ title: 'Related searches', links: ints }); }
    }
    return out;
  }

  /* ---------------- 6. Inventory → page list & sitemap ---------------- */
  // Every page the system can render for a market, with its full indexability assessment.
  function pages(market, inv, regions) {
    const regById = Object.fromEntries(regions.map(r => [r.id, r]));
    const list = []; const add = (type, intent, region, label) => { const a = assess(market, inv, regById, intent, region); list.push({ type, path: pathOf(market.code, intent, region), label, count: a.count, eligible: a.eligible, indexable: a.indexable, reason: a.reason, checks: a.checks, keywords: intent && intent.keywords ? intent.keywords[market.code] || [] : [] }); };
    add('market', null, null, market.name);
    const ints = CFG.intentsFor(market.code);
    ints.forEach(i => add('intent', i, null, i.labels[market.code]));
    if (!CFG.hubOnly(market.code)) regions.filter(r => inv.regions[r.id]).forEach(r => add('region', null, r, r.name));
    ints.filter(i => !i.generic).forEach(i => regions.forEach(r => { if (inv.combos[i.key + '|' + r.id]) add('combo', i, r, `${i.labels[market.code]} · ${r.name}`); }));
    return list;
  }
  function sitemapXml(entries, lastmod) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries.map(e => `  <url><loc>${esc(R.abs(e.path))}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n') + `\n</urlset>\n`;
  }

  FP.seo = { placeOf, resolve, filters, meta, links, pages, sitemapXml, pathOf, countFor, indexability, assess };
})();
