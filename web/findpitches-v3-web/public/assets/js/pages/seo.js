// Page script for seo.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const translateUI=FP.i18n.tr, uiHTML=FP.i18n.html;
  const {esc,card,toast,createAlert,qs} = FP.ui;
  const api=FP.api, R=FP.routes, SEO=FP.seo, CFG=FP.seoConfig, TODAY=FP_CONFIG.today;
  const P=document.getElementById('page');
  await FP.ready; const st=FP.state;
  const path = qs.get('path') || R.marketPath(st.market);

  // Regions are needed to resolve paths (and GB for legacy /areas/ URLs)
  const seg0 = path.replace(/^https?:\/\/[^/]+/,'').split('/').filter(Boolean)[0] || '';
  const mk0 = R.marketOf(seg0) || 'GB';
  const regionsFor = {}; for (const m of new Set([mk0,'GB'])) regionsFor[m] = await api.meta.regions({market:m});
  const d = SEO.resolve(path, { markets: st.markets, regions: regionsFor });

  if (d.kind==='redirect') return renderRedirect(d);
  if (d.kind==='app') { location.replace(FP.i18n.pathFor('/'+d.to.replace(/^\//,''),FP.i18n.current)); return; }
  if (d.kind==='not_found') return render404(d);

  /* ---------- data for the page (all via FP.api) ---------- */
  const market = st.m(d.market); if (st.market!==d.market) { st.market = d.market; } FP.ui.renderHeader();
  const regions = regionsFor[d.market] || await api.meta.regions({market:d.market});
  const invFor = m => api.seo.inventory({market:m, intents: CFG.intentsFor(m).map(i=>({key:i.key, filters:i.filters}))});
  const filters = SEO.filters(d);
  const others = (d.type==='market' || d.type==='intent') && market.launch_status==='live' ? st.markets.filter(x=>x.launch_status==='live' && x.code!==d.market) : [];
  // These reads are independent. Do not make visitors wait for each country's
  // inventory before starting their own results request.
  const [inventory, search, otherInventories] = await Promise.all([
    invFor(d.market),
    api.opportunities.search(Object.assign({}, filters, { sort:'soonest', page_size:12 })),
    Promise.all(others.map(m=>invFor(m.code)))
  ]);
  const inventories = { [d.market]: inventory };
  otherInventories.forEach((inv,i)=>inventories[others[i].code]=inv);
  const regById = Object.fromEntries(regions.map(r=>[r.id,r]));
  const regionPath = []; if (d.region) { let r=d.region; while(r){ regionPath.unshift(r); r=r.parent_id?regById[r.parent_id]:null; } }
  const visible = search.results; // exactly what the page shows (ItemList mirrors this)
  const originalMeta = SEO.meta(d, { market, search, visible, inventory, inventories, markets: st.markets, regions, regionPath, today: TODAY });
  const M=FP.i18n.meta(originalMeta,d,market,FP.i18n.current,document.querySelector('meta[name=fp-localisation-indexable]')?.content==='true');
  const L = SEO.links(d, { inventory, regions, market });
  FP.track('seo_page_viewed',{path:d.path,type:d.type,count:M.count,indexable:M.indexable});

  /* ---------- <head>: what the server would render ---------- */
  document.title = M.title;
  setMeta('description', M.description); setMeta('robots', document.querySelector('meta[name="fp-environment"]')?.content === 'restricted_shadow_preview' ? 'noindex,nofollow' : M.robots);
  addLink('canonical', M.canonical);
  M.hreflang.forEach(h=>{ const l=document.createElement('link'); l.rel='alternate'; l.hreflang=h.lang; l.href=h.href; document.head.appendChild(l); });
  M.jsonld.forEach(j=>{ const s=document.createElement('script'); s.type='application/ld+json'; s.textContent=JSON.stringify(j); document.head.appendChild(s); });
  document.documentElement.lang = FP.i18n.current;

  /* ---------- page ---------- */
  const finderParams = { q: d.region ? d.region.slug : '' };
  if (filters.types) finderParams.type = filters.types.join(','); if (filters.sells) finderParams.sells = filters.sells; if (!d.region) finderParams.radius='any';
  const finderHref = R.draft.finder(d.market, finderParams);
  const lastChecked = search.results.map(o=>o.checked.last_checked).filter(Boolean).sort().pop();
  const guide = CFG.guidance[d.market] || [];
  const noData = search.coverage==='none';

  P.innerHTML = uiHTML`
  <section class="lhero"><div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">${M.breadcrumbs.map((b,i)=> i===M.breadcrumbs.length-1 ? uiHTML`<span>${esc(b.name)}</span>` : (i===0?uiHTML`<a href="index.html">${esc(b.name)}</a>`:uiHTML`<span><a href="${R.draft.seo(b.path)}">${esc(b.name)}</a></span>`)).join('')}</nav>
    <p class="kick">${esc(market.name)}</p>
    <h1>${esc(M.h1)}</h1>
    <p class="intro">${esc(M.intro[0])}</p>
    ${M.count?uiHTML`<div class="statrow"><div><b>${M.count}</b>${M.count===1?'listing':'listings'}</div>${M.next?uiHTML`<div><b>${esc(new Intl.DateTimeFormat(market.locale,{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(M.next.dates.start+'T12:00:00Z')))}</b>next start</div>`:''}<div><b>${Object.keys(search.facets.types).length}</b>event types</div>${lastChecked?uiHTML`<div><b>${esc(new Intl.DateTimeFormat(market.locale,{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(lastChecked+'T12:00:00Z')))}</b>last checked</div>`:''}</div>`:''}
    <div class="ctas">${M.count?uiHTML`<a class="btn btn-flag" href="${finderHref}">See all ${M.count} in the Finder</a>`:''}${market.launch_status==='live'?uiHTML`<button class="btn btn-line" type="button" id="alertBtn">Alert me to new ones</button>`:''}</div>
  </div></section>

  <div class="wrap section"><div class="lgrid">
    <div>
      ${noData ? FP.ui.coverageBuilding(d.market)
        : M.count ? uiHTML`<div class="results"><h2>${d.intent?translateUI('Latest listings'):translateUI('Coming up')}${d.region?' in '+esc(M.place):''}</h2>${visible.map(o=>card(o)).join('')}${M.count>search.results.length?uiHTML`<a class="btn btn-line" href="${finderHref}">See all ${M.count} in the Finder →</a>`:''}</div>`
        : uiHTML`<div class="zero"><h2>Nothing live for this search right now</h2><p class="muted" style="margin:0">Organisers open applications all year. Try a wider area below. Email alerts are coming later.</p></div>`}
      ${L.map(g=>uiHTML`<section class="lblock"><h2>${esc(g.title)}</h2><div class="linkgrid">${g.links.map(l=>uiHTML`<a href="${R.draft.seo(l.path)}">${esc(l.label)}<small>${l.count}</small></a>`).join('')}</div></section>`).join('')}
      <section class="lblock faq"><h2>Questions</h2>${M.faq.map((f,i)=>uiHTML`<details ${i===0?'open':''}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>
    </div>
    <aside class="side">
      ${d.intent?uiHTML`<div class="card"><h3>${esc(d.intent.labels[d.market])}</h3><p class="muted" style="margin:0">${esc(d.intent.blurb)}</p></div>`:''}
      <div class="card"><h3>Before you apply</h3><p class="muted" style="margin:0 0 8px;font-size:.92rem">Organisers in ${esc(market.the)} often ask for:</p><ul>${guide.map(g=>uiHTML`<li>${esc(g)}</li>`).join('')}</ul></div>
      <div class="card"><h3>How FindPitches works</h3><p class="muted" style="margin:0;font-size:.92rem">${esc(M.intro[M.intro.length-1])}</p><a class="link" href="index.html#checked" style="display:inline-block;margin-top:8px">How we check listings</a></div>
      ${M.hreflang.filter(h=>h.lang!=='x-default'&&h.lang!==market.locale).length?uiHTML`<div class="card"><h3>Also on FindPitches</h3>${M.hreflang.filter(h=>h.lang!=='x-default'&&h.lang!==market.locale).map(h=>{const pth=h.href.replace(R.SITE,''); const mm=st.m(R.marketOf(pth.split('/')[1])); return uiHTML`<a class="link" style="display:block;margin:4px 0" href="${R.draft.seo(pth)}">${esc(mm.name)}</a>`;}).join('')}</div>`:''}
    </aside>
  </div></div>
`;

  /* ---------- alert ---------- */
  const ab=document.getElementById('alertBtn');
  if (ab) ab.onclick=()=>{ const q={market:d.market, q:d.region?d.region.id:'', types:filters.types||[], sells:filters.sells, organiser_types:filters.organiser_types}; createAlert(q,{placeLabel:d.region?d.region.name:null}); };


  /* ---------- helpers ---------- */
  function setMeta(n,c){ let m=document.querySelector(`meta[name="${n}"]`); if(!m){m=document.createElement('meta');m.name=n;document.head.appendChild(m);} m.content=c; }
  function addLink(rel,href){ let l=document.querySelector('link[rel='+rel+']');if(!l){l=document.createElement('link');l.rel=rel;document.head.appendChild(l);}l.href=href; }
  function renderRedirect(x){
    document.title=translateUI('Redirecting… | FindPitches');
    P.innerHTML=uiHTML`<div class="wrap section sys"><div class="card"><h1 class="display" style="font-size:1.4rem;margin:0 0 10px">This page has moved</h1>
      <p class="muted">Taking you to the new page…</p><a class="btn btn-turf" href="${R.draft.seo(x.to)}" id="go">Go to the new page</a>
      ${FP.ui.draftNote(`${x.status} redirect ${path} → ${x.to}. ${x.reason}. Production does this on the server with no page shown.`)}</div></div>`;
    if (!qs.get('stay')) setTimeout(()=>location.replace(R.draft.seo(x.to)),1600);
  }
  function render404(x){
    document.title=translateUI('Page not found | FindPitches'); setMeta('robots','noindex');
    P.innerHTML=uiHTML`<div class="wrap section sys"><div class="card"><h1 class="display" style="font-size:1.4rem;margin:0 0 10px">We can’t find that page</h1>
      <p class="muted">It may have moved, or the link may be incomplete.</p><div style="display:flex;flex-wrap:wrap;gap:8px"><a class="btn btn-turf" href="finder.html">Find pitches</a><a class="btn btn-line" href="${R.draft.seo(R.marketPath(st.market))}">Browse ${esc(st.m().name)}</a></div>
      ${FP.ui.draftNote(`404. ${x.reason}. Production returns a real 404 status.`)}</div></div>`;
  }
})();
