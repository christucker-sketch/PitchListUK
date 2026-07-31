const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://pitchlist.uk';
const TODAY = new Date().toISOString().slice(0, 10);
const UK_EXCLUDED_AREAS = new Set(['ireland']);
const MIN_AREA_ROWS = 2;
const MIN_EXTRA_AREA_ROWS = 1;
const MIN_INDEXABLE_AREA_ROWS = 8;
const EXTRA_AREA_PAGES = [
  {
    area: 'Belfast',
    slug: 'belfast',
    match: row => /\bbelfast\b/i.test(row.event_name || '') || /\bbelfast\b/i.test(row.organiser || '') || /\bbelfast\b/i.test(row.source_url || '')
  },
  {
    area: 'Antrim',
    slug: 'antrim',
    match: row => /\bantrim\b/i.test(row.event_name || '') || /\bantrim\b/i.test(row.organiser || '') || /\bantrim\b/i.test(row.source_url || '')
  }
];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadSnapshot(root) {
  const file = path.join(root, 'functions', '_data', 'opportunities.mjs');
  const source = fs.readFileSync(file, 'utf8')
    .replace(/^export const opportunitySnapshot = /, '')
    .replace(/;\s*$/, '');
  return JSON.parse(source);
}

function cleanArea(row) {
  const value = String(row.county || row.region || row.location || '').trim();
  if (!value) return '';
  if (UK_EXCLUDED_AREAS.has(value.toLowerCase())) return '';
  return value;
}

function splitValues(value) {
  return String(value || '')
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function categoryLabel(row) {
  const haystack = [
    row.route_type,
    row.buyer_fit_tags,
    row.vendor_categories,
    row.event_name
  ].join(' ').toLowerCase();
  if (haystack.includes('council') || haystack.includes('street_trading')) return 'council event';
  if (haystack.includes('market')) return 'market stallholder';
  if (haystack.includes('truck')) return 'food truck';
  if (haystack.includes('festival')) return 'festival trader';
  return 'trader';
}

function displayOpportunityName(row) {
  const eventName = String(row.event_name || '').trim();
  const organiser = String(row.organiser || '').trim();
  if (!eventName) return organiser || 'Trader opportunity';
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\s|$)/i.test(eventName) && organiser) return organiser;
  if (/\bDNU\b|community grants/i.test(eventName) && organiser) return organiser;
  if (eventName.length < 4 && organiser) return organiser;
  return eventName;
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const area = cleanArea(row);
    if (!area) continue;
    const slug = slugify(area);
    if (!slug) continue;
    const group = groups.get(slug) || {
      area,
      slug,
      rows: [],
      categories: new Map(),
      routeTypes: new Map(),
      updatedDates: []
    };
    group.rows.push(row);
    const label = categoryLabel(row);
    group.categories.set(label, (group.categories.get(label) || 0) + 1);
    if (row.route_type) group.routeTypes.set(row.route_type, (group.routeTypes.get(row.route_type) || 0) + 1);
    if (row.last_checked) group.updatedDates.push(row.last_checked);
    groups.set(slug, group);
  }
  return [...groups.values()]
    .filter(group => group.rows.length >= MIN_AREA_ROWS)
    .sort((a, b) => b.rows.length - a.rows.length || a.area.localeCompare(b.area));
}

function makeGroup(area, slug, rows) {
  const group = {
    area,
    slug,
    rows,
    categories: new Map(),
    routeTypes: new Map(),
    updatedDates: []
  };
  for (const row of rows) {
    const label = categoryLabel(row);
    group.categories.set(label, (group.categories.get(label) || 0) + 1);
    if (row.route_type) group.routeTypes.set(row.route_type, (group.routeTypes.get(row.route_type) || 0) + 1);
    if (row.last_checked) group.updatedDates.push(row.last_checked);
  }
  return group;
}

function extraAreaGroups(rows, existingGroups) {
  const existingSlugs = new Set(existingGroups.map(group => group.slug));
  return EXTRA_AREA_PAGES
    .filter(page => !existingSlugs.has(page.slug))
    .map(page => makeGroup(page.area, page.slug, rows.filter(row => page.match(row))))
    .filter(group => group.rows.length >= MIN_EXTRA_AREA_ROWS);
}

function topList(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label]) => label);
}

function pageShell({ title, description, canonical, body, structuredData, robots = 'index,follow,max-image-preview:large' }) {
  const jsonLd = structuredData ? `\n  <script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2).replace(/^/gm, '  ')}\n  </script>` : '';
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="${escapeHtml(robots)}" />
  <meta name="theme-color" content="#0b1020" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <link rel="stylesheet" href="/styles.css" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="PitchList UK" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />${jsonLd}
</head>
<body>
${body}
  <footer><strong>PitchList UK</strong><span><a href="/areas">UK area coverage</a> · <a href="/database">Search database</a> · <a href="mailto:hello@pitchlist.uk">hello@pitchlist.uk</a></span></footer>
</body>
</html>
`;
}

function areaPage(group, total) {
  const area = group.area;
  const rows = group.rows;
  const count = rows.length;
  const categories = topList(group.categories, 4);
  const latest = group.updatedDates.sort().at(-1) || TODAY;
  const categoryText = categories.length ? categories.join(', ') : 'festival trader and stallholder';
  const canonical = `${SITE_URL}/areas/${group.slug}`;
  const title = `${area} Trader Opportunities | PitchList UK`;
  const description = `Find ${area} trader opportunities, including ${categoryText} routes, from the PitchList UK online database.`;
  const polishedExamples = rows
    .map(row => ({ row, name: displayOpportunityName(row) }))
    .filter(item => item.name && !/community grants/i.test(item.name))
    .slice(0, 5);
  const body = `  <header class="hero seo-hero">
    <nav><strong><a href="/">PitchList UK</a></strong><a href="/database">Search database</a></nav>
    <section class="hero-grid">
      <div>
        <p class="eyebrow">Area coverage</p>
        <h1>${escapeHtml(area)} trader opportunities and stallholder application routes.</h1>
        <p class="lede">PitchList currently tracks ${count} online ${area} ${count === 1 ? 'row' : 'rows'} across ${escapeHtml(categoryText)} searches, with source and application routes unlocked inside the subscriber database.</p>
        <div class="actions"><a href="/database?q=${encodeURIComponent(area)}">Search ${escapeHtml(area)}</a><a class="ghost" href="/database">Preview locked rows</a></div>
      </div>
      <figure class="hero-card"><div class="photo"></div><figcaption>Coverage pages are generated from checked online database rows, not generic directory lists.</figcaption></figure>
    </section>
  </header>
  <main>
    <section class="stats seo-stats" aria-label="${escapeHtml(area)} PitchList coverage stats">
      <article><b>${count}</b><span>online ${area} rows</span></article>
      <article><b>${escapeHtml(latest)}</b><span>latest checked date</span></article>
      <article><b>${total}</b><span>UK customer-ready rows</span></article>
      <article><b>£4.99</b><span>monthly access after trial</span></article>
    </section>
    <section class="panel split">
      <div><p class="eyebrow">What we track</p><h2>${escapeHtml(area)} searches need source-linked routes.</h2></div>
      <p>Useful ${escapeHtml(area)} opportunities may appear under food festival trader applications, market stallholder forms, council event routes, food truck pitches, seasonal events, showground trader packs and organiser contact pages. PitchList groups those routes into a searchable database so traders can filter by area, postcode, category, freshness and confidence.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Current examples</p>
      <h2>Examples from the locked database.</h2>
      <div class="sample-table seo-sample-table" role="table">
        <div role="row" class="sample-row sample-header"><span>Opportunity</span><span>Area</span><span>Type</span><span>Checked</span></div>
        ${polishedExamples.map(({ row, name }) => `<div role="row" class="sample-row"><span>${escapeHtml(name)}</span><span>${escapeHtml(row.county || row.region || area)}</span><span>${escapeHtml(categoryLabel(row))}</span><span>${escapeHtml(row.last_checked || 'Recent')}</span></div>`).join('\n        ')}
        <div role="row" class="sample-row locked-row"><span>Full source and application routes unlock after trial signup</span><span>${escapeHtml(area)}</span><span>Subscriber database</span><span>Live search</span></div>
      </div>
    </section>
    <section class="panel">
      <p class="eyebrow">Related searches</p>
      <h2>${escapeHtml(area)} opportunity coverage.</h2>
      <div class="reach-strip">
        ${categories.map(label => `<span>${escapeHtml(area)} ${escapeHtml(label)} opportunities</span>`).join('')}
        <a href="/food-traders-wanted">Food traders wanted</a>
        <a href="/festival-trader-applications">Festival trader applications</a>
        <a href="/market-stallholder-applications">Market stallholder applications</a>
      </div>
    </section>
  </main>`;
  return pageShell({
    title,
    description,
    canonical,
    body,
    robots: count >= MIN_INDEXABLE_AREA_ROWS ? 'index,follow,max-image-preview:large' : 'noindex,follow,max-image-preview:large',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      url: canonical,
      description,
      isPartOf: { '@type': 'WebSite', name: 'PitchList UK', url: SITE_URL }
    }
  });
}

function hubPage(groups, snapshot) {
  const total = snapshot.total;
  const cards = groups.map(group => {
    const categories = topList(group.categories, 3).join(', ');
    const rowLabel = group.rows.length === 1 ? '1 row' : `${group.rows.length} rows`;
    return `<article><span>${rowLabel}</span><strong><a href="/areas/${group.slug}">${escapeHtml(group.area)} trader opportunities</a></strong><p>${escapeHtml(categories || 'festival trader and stallholder routes')}.</p></article>`;
  }).join('\n        ');
  const body = `  <header class="hero seo-hero">
    <nav><strong><a href="/">PitchList UK</a></strong><a href="/database">Search database</a></nav>
    <section class="hero-grid">
      <div>
        <p class="eyebrow">UK area coverage</p>
        <h1>Trader opportunity coverage by UK area.</h1>
        <p class="lede">Browse indexable PitchList area pages generated from ${total} online database rows. The public pages show coverage and examples; source links and application routes stay inside the subscriber database.</p>
        <div class="actions"><a href="/database">Search the database</a><a class="ghost" href="/areas">Browse area previews</a></div>
      </div>
      <figure class="hero-card"><div class="photo"></div><figcaption>Area pages help traders find coverage without exposing the paid lead routes.</figcaption></figure>
    </section>
  </header>
  <main>
    <section class="stats seo-stats" aria-label="PitchList area coverage stats">
      <article><b>${groups.length}</b><span>UK areas with online rows</span></article>
      <article><b>${total}</b><span>indexed online rows</span></article>
      <article><b>${escapeHtml(snapshot.exported_at.slice(0, 10))}</b><span>latest database export</span></article>
      <article><b>7 days</b><span>free trial before monthly access</span></article>
    </section>
    <section class="panel">
      <p class="eyebrow">Coverage map</p>
      <h2>Find trader applications by area.</h2>
      <div class="seo-area-grid">
        ${cards}
      </div>
    </section>
  </main>`;
  return pageShell({
    title: 'UK Trader Opportunity Coverage By Area | PitchList UK',
    description: 'Browse PitchList UK area coverage for festival trader applications, food trader opportunities, stallholder routes and food truck pitches.',
    canonical: `${SITE_URL}/areas`,
    body,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'UK Trader Opportunity Coverage By Area',
      url: `${SITE_URL}/areas`,
      description: 'PitchList UK area coverage pages generated from customer-ready trader opportunity rows.'
    }
  });
}

function appendSitemap(out, groups) {
  const sitemapFile = path.join(out, 'sitemap.xml');
  let sitemap = fs.readFileSync(sitemapFile, 'utf8').replace('</urlset>', '').trimEnd();
  const urls = [
    { loc: `${SITE_URL}/areas`, priority: '0.85' },
    ...groups
      .filter(group => group.rows.length >= MIN_INDEXABLE_AREA_ROWS)
      .map(group => ({ loc: `${SITE_URL}/areas/${group.slug}`, priority: '0.8' }))
  ];
  for (const url of urls) {
    sitemap += `\n  <url>\n    <loc>${url.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`;
  }
  sitemap += '\n</urlset>\n';
  fs.writeFileSync(sitemapFile, sitemap);
}

function generateSeoPages({ root = path.join(__dirname, '..'), out = path.join(root, 'public') } = {}) {
  const snapshot = loadSnapshot(root);
  const baseGroups = groupRows(snapshot.rows || []);
  const groups = [...baseGroups, ...extraAreaGroups(snapshot.rows || [], baseGroups)]
    .sort((a, b) => b.rows.length - a.rows.length || a.area.localeCompare(b.area));
  const areaDir = path.join(out, 'areas');
  fs.mkdirSync(areaDir, { recursive: true });
  const total = snapshot.total;
  fs.writeFileSync(path.join(areaDir, 'index.html'), hubPage(groups, snapshot));
  for (const group of groups) {
    fs.writeFileSync(path.join(areaDir, `${group.slug}.html`), areaPage(group, total));
  }
  appendSitemap(out, groups);
  console.log(`Generated ${groups.length + 1} SEO area pages`);
}

module.exports = { generateSeoPages };
