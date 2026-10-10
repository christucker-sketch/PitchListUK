// Page script for finder.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const U = FP.ui, {esc,fmt,card,factsHTML,applyPanel,freshness,units,describeQuery,createAlert,qs,TYPE_PLURAL,SELLS,cap} = U;
  const api = FP.api, G = window.FP_GEO, NS = 'http://www.w3.org/2000/svg', track = FP.track, R = FP.routes;
  const $ = s=>document.querySelector(s), $$ = s=>[...document.querySelectorAll(s)];
  await FP.ready;
  const st = FP.state, C = st.m(), MK = C.code, UNIT = C.distance_unit, CAN = C.search || {};
  // Which outline to draw for a market (presentation asset, not a status check). Markets without one show list only.
  const MAPS = { GB: 'uk', US: 'us' }; const MAP = C.opportunity_count > 0 ? MAPS[MK] : null;
  const T = api.meta.types();
  const PAGE = 25;

  /* ---------- search state (URL = shareable). radius is in the market's display unit; the API receives radius_km. ---------- */
  const me = st.session && st.session.signed_in && st.session.user && st.session.user.market === MK ? st.session.user.base_postcode : '';
  const DEF_R = String(C.radius_options[2] || 50);
  const S = { q: qs.get('q') ?? (me || ''), sells: qs.get('sells')||'', radius: qs.get('radius')|| DEF_R, when: qs.get('when')||'',
    types: new Set((qs.get('type')||'').split(',').filter(Boolean)), sort: qs.get('sort')||'', view: qs.get('view')||'list', month: qs.get('month')||'', page:1 };
  if (!CAN.radius && S.sort==='nearest') S.sort='';
  let last = null, shown = [], selected = null, busy = false;
  const REGS = MAP==='us' ? await api.meta.regions({market:MK}) : []; const ID2CODE = Object.fromEntries(REGS.filter(x=>x.code).map(x=>[x.id,x.code.slice(3)]));

  /* ---------- controls driven by market config ---------- */
  $('#qLbl').textContent = C.postal.kind==='district' ? 'District or place' : CAN.radius ? `${C.postal.label} or town` : `Place or ${C.region_label.singular}`;
  $('#q').placeholder = CAN.radius ? 'e.g. ' + C.postal.example : 'Town or ' + C.region_label.singular;
  if (C.postal.kind==='district') $('#q').setAttribute('autocomplete','address-level2');
  $('#q').value = S.q;
  if (CAN.radius) { $('#radius').innerHTML = C.radius_options.map(v=>`<option value="${v}">${v} ${units.word(UNIT,v)}</option>`).join('') + `<option value="any">Anywhere in ${esc(C.the)}</option>`; if(![...$('#radius').options].some(o=>o.value===S.radius)) S.radius=DEF_R; $('#radius').value = S.radius; }
  else { $('#radiusF').remove(); S.radius = 'any'; }
  $('#sells').value = S.sells; $('#when').value = S.when;
  const radiusKm = () => CAN.radius && S.radius!=='any' ? Math.round(units.toKm(+S.radius, UNIT)*10)/10 : undefined;
  const query = () => ({ market:MK, q:S.q, radius_km:radiusKm(), sells:S.sells||undefined, when:S.when||undefined, types:[...S.types] });

  function syncUrl(){
    const u = new URL(location.href), p = u.searchParams, set=(k,v)=>v?p.set(k,v):p.delete(k);
    p.delete('market'); set('cc',R.slugOf(MK)); set('q',S.q); set('sells',S.sells); set('radius',CAN.radius && S.radius!==DEF_R?S.radius:''); set('when',S.when);
    set('type',[...S.types].join(',')); set('sort',S.sort); set('view',S.view==='list'?'':S.view); set('month',S.month);
    history.replaceState(null,'',u.toString());
  }
  const moreCount = () => [S.sells, CAN.radius && S.radius!==DEF_R, S.when].filter(Boolean).length;
  const setMoreTxt = () => { const n=moreCount(); $('#moreTxt').textContent = n ? `More filters · ${n} set` : 'More filters'; };

  /* ---------- copy ---------- */
  function heading(loc){
    const one = S.types.size===1 ? [...S.types][0] : null;
    let what = one ? (TYPE_PLURAL[one]||T[one]) : C.vocab.listings;
    if (!one && S.sells==='food') what = `Food ${C.vocab.traders_short} wanted`;
    if (loc.kind==='point') return S.radius==='any' || !CAN.radius ? `${what} across ${C.the}` : `${what} near ${loc.label}`;
    if (loc.kind==='region') return `${what} in ${loc.label}`;
    if (loc.kind==='unresolved') return `${what} in ${loc.label}`;
    return `${what} across ${C.the}`;
  }
  const sortWord = s => ({nearest:'nearest first',soonest:'soonest first',recently_checked:'most recently checked first',az:'A to Z'})[s];

  /* ---------- search ---------- */
  async function search({append=false, reason='search', focusFirstNew=false}={}){
    if (busy && !append) { /* newest request wins */ }
    busy = true;
    if (!append) { S.page=1; selected=null; $('#list').setAttribute('aria-busy','true'); if(!last) $('#list').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>'; }
    syncUrl(); setMoreTxt();
    const params = Object.assign(query(), { sort:S.sort||undefined, month:S.month||undefined, page:S.page, page_size:PAGE });
    let r; const my = (search.seq = (search.seq||0)+1);
    try { r = await api.opportunities.search(params); }
    catch(e){ busy=false; $('#list').removeAttribute('aria-busy'); $('#list').innerHTML=`<div class="zero" role="alert"><h2>Search didn’t work</h2><p class="muted">${esc(e.message)}. Try again in a moment.</p><button class="btn btn-line btn-sm" type="button" id="retry">Try again</button></div>`; $('#retry').onclick=()=>search(); return; }
    if (my !== search.seq) return; // a newer search replaced this one
    busy=false; $('#list').removeAttribute('aria-busy');
    const prevCount = shown.length;
    last = r; shown = append ? shown.concat(r.results) : r.results;
    if (r.coverage==='none') return renderCoverage(r);
    $('#sort').value = S.sort || r.sort; $('#sort').querySelector('[value=nearest]').disabled = r.location.kind!=='point';
    renderHead(r); renderChips(r); renderFilters(r); renderView();
    const s = $('#sum'); s.classList.remove('updated'); void s.offsetWidth; if(!U.RM && reason!=='init') s.classList.add('updated');
    $('#status').textContent = append ? `Showing ${shown.length} of ${r.total}.` : `${r.total} ${r.total===1?'result':'results'}. ${heading(r.location)}, ${sortWord(r.sort)}.`;
    if (append && focusFirstNew) { const el = $$('#list .ocard')[prevCount]; if (el) el.querySelector('h3 a').focus(); }
  }

  function renderHead(r){
    const loc=r.location;
    $('#h1').textContent = heading(loc); document.title = heading(loc) + ' | FindPitches';
    let sum = `<b>${r.total}</b> checked ${r.total===1?'listing':'listings'}`;
    // The radius and place are shown in the heading and the filter chip below, so the summary stays short.
    if (r.next_start && r.total) sum += ` · next on ${esc(fmt(r.next_start,MK,{weekday:'short',day:'numeric',month:'short'}))}`;
    $('#sum').innerHTML = sum;
    const h=$('#lochint'), dn = t => U.draftNote(t,{inline:true});
    const draft = CAN.geocoder==='draft_postcode_areas' ? dn('distance is measured from the postcode area centre.') : CAN.geocoder==='draft_zip_to_state' ? dn('ZIP Codes match to their state until listings are geocoded.') : '';
    if (loc.kind==='point') h.innerHTML = `Searching from <b>${esc(loc.label)}</b>${draft}`;
    else if (loc.kind==='region') h.innerHTML = `Showing <b>${esc(loc.label)}</b>${CAN.radius?'':`. ${esc(C.name)} listings are grouped by ${esc(C.region_label.singular)} for now.`}${draft}`;
    else if (loc.kind==='unresolved') h.innerHTML = `Showing listings whose location includes “<b>${esc(loc.label)}</b>”.`;
    else if (loc.kind==='unknown') h.innerHTML = `<div class="notice warn" role="alert">We couldn’t find “${esc(loc.query)}”, so this shows all of ${esc(C.the)}. Try a ${esc(C.postal.label_mid)} like ${esc(C.postal.example)}${CAN.radius?' or a town name':' or a '+esc(C.region_label.singular)+' name'}.</div>`;
    else h.innerHTML = CAN.radius ? `Add your ${esc(C.postal.label_mid)} to see what’s near you.` : `Search by place name or ${esc(C.region_label.singular)}.`;
  }

  function renderChips(r){
    const counts=r.facets.types, all=Object.values(counts).reduce((a,b)=>a+b,0)+(r.facets.unclassified_types||0);
    const order = Object.keys(T).filter(k=>counts[k]||S.types.has(k)).sort((a,b)=>(a==='sport')-(b==='sport')||(counts[b]||0)-(counts[a]||0));
    $('#chips').innerHTML = `<button type="button" class="chip" data-t="" aria-pressed="${!S.types.size}">All types <small>${all}</small></button><span class="sep" aria-hidden="true"></span>` +
      order.map(k=>`<button type="button" class="chip ${k==='sport'?'sport':''}" data-t="${k}" aria-pressed="${S.types.has(k)}">${esc(T[k])} <small>${counts[k]||0}</small></button>`).join('');
  }

  // Every active filter as a removable chip, so it's always clear why results look the way they do.
  function renderFilters(r){
    const F=[];
    if (S.q && r.location.kind!=='unknown') F.push(['q', r.location.kind==='point' && CAN.radius && S.radius!=='any' ? `Within ${S.radius} ${units.short(UNIT)} of ${r.location.label}` : `In ${r.location.label||S.q}`]);
    if (S.sells) F.push(['sells', $('#sells').selectedOptions[0].textContent]);
    if (S.when) F.push(['when', $('#when').selectedOptions[0].textContent]);
    if (S.month) F.push(['month', fmt(S.month+'-15',MK,{month:'long',year:'numeric'})]);
    S.types.forEach(t=>F.push(['type:'+t, T[t]]));
    $('#afilters').innerHTML = F.length ? `<span class="sr">Active filters:</span>` + F.map(([k,l])=>`<button type="button" class="afilter" data-rm="${esc(k)}" aria-label="Remove filter: ${esc(l)}">${esc(l)}<span aria-hidden="true">×</span></button>`).join('') + (F.length>1?`<button type="button" class="clearall" id="clearAll">Clear all</button>`:'') : '';
  }
  function removeFilter(k){
    if (k==='q') { S.q=''; $('#q').value=''; }
    else if (k==='sells') { S.sells=''; $('#sells').value=''; }
    else if (k==='when') { S.when=''; $('#when').value=''; }
    else if (k==='month') S.month='';
    else if (k.startsWith('type:')) S.types.delete(k.slice(5));
    track('filters_changed',{removed:k.split(':')[0]}); search({reason:'filter'});
  }

  function renderView(){
    $$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===S.view)));
    const fm=$('#fmain'); fm.className='fmain v-'+S.view+(MAP?'':' nomap');
    $('#cal').hidden = S.view!=='season'; $('#list').hidden = S.view==='season'; $('#mapwrap').hidden = S.view==='season' || !MAP;
    if (S.view==='season') renderSeason(); else { renderList(); if (MAP) renderMap(); }
  }

  function renderList(){
    const r = last, L = $('#list');
    if (!r.total) return renderZero(r);
    let html=''; shown.forEach((o,i)=>{ html+=card(o); if(i===4 && !st.entitled && st.proAvailable) html+=`<div class="upsell"><div><b>Found one you like?</b><p>Everything here is free to browse. Pro adds the organiser’s application page for every listing, plus alerts when new ones appear.</p></div><a class="btn btn-flag" href="pricing.html">${U.proActionLabel()}</a></div>`; });
    if (r.total > PAGE) { const pct = Math.round(100*shown.length/r.total);
      html += `<div class="pager"><p>Showing ${shown.length} of ${r.total}</p><div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>${r.total>shown.length?`<button class="btn btn-line" type="button" id="more">Show ${Math.min(PAGE,r.total-shown.length)} more</button>`:''}</div>`; }
    L.innerHTML = html;
    $$('#list .ocard').forEach(el=>el.setAttribute('aria-current',String(el.dataset.id===selected)));
  }

  function renderZero(r){
    const sugs=[];
    if (S.types.size) sugs.push(['types','Show all types']);
    if (S.when||S.month) sugs.push(['time','Any time']);
    if (S.sells) sugs.push(['sells','Anything, not just '+$('#sells').selectedOptions[0].textContent.toLowerCase()]);
    const opts=C.radius_options, next=opts.find(v=>v>+S.radius);
    if (CAN.radius && r.location.kind==='point' && S.radius!=='any') sugs.push(next?['widen',`Widen to ${next} ${units.word(UNIT,next)}`]:['anywhere',`Anywhere in ${C.the}`]);
    if (S.q) sugs.push(['anywhere',`Search all of ${C.the}`]);
    $('#list').innerHTML = `<div class="zero"><h2>No listings match this search yet</h2>
      <p class="muted" style="margin:0">${esc(describeQuery(query(), r.location.label))}. New listings are checked and added every week.</p>
      <div class="sugs">${sugs.map(([k,l])=>`<button class="btn btn-line btn-sm" type="button" data-sug="${k}">${esc(l)}</button>`).join('')}<button class="btn btn-turf btn-sm" type="button" data-sug="alert">Alert me when one appears</button></div></div>`;
  }
  function applySuggestion(k){
    if (k==='alert') return makeAlert();
    if (k==='types') S.types.clear();
    if (k==='time') { S.when=''; S.month=''; $('#when').value=''; }
    if (k==='sells') { S.sells=''; $('#sells').value=''; }
    if (k==='widen') { S.radius=String(C.radius_options.find(v=>v>+S.radius)); $('#radius').value=S.radius; }
    if (k==='anywhere') { S.q=''; $('#q').value=''; }
    track('filters_changed',{suggestion:k}); search({reason:'filter'}).then(()=>$('#h1').focus());
  }

  /* ---------- map ---------- */
  function projUK(lat,lng){ const M=G.uk, p=lat*Math.PI/180; return [M.k*lng*Math.PI/180+M.tx, M.ty-M.k*Math.log(Math.tan(Math.PI/4+p/2))]; }
  function renderMap(){
    const svg=$('#map'), r=last; svg.innerHTML='';
    const ids=new Set(shown.map(o=>o.id));
    if (MAP==='uk'){
      const M=G.uk, loc=r.location; let vb=`0 0 ${M.W} ${M.H}`, z=1; const rk=radiusKm();
      let extra='';
      if (loc.kind==='point' && rk){ const [x,y]=projUK(loc.lat,loc.lng); const rpx=M.k*(rk/6371)/Math.cos(loc.lat*Math.PI/180); const w=Math.max(rpx*2.5,120); vb=`${x-w/2} ${y-w*0.6} ${w} ${w*1.2}`; z=M.W/w;
        extra=`<circle class="radius" cx="${x}" cy="${y}" r="${rpx}" style="stroke-width:${1.2/z}px;stroke-dasharray:${4/z} ${4/z}"/><circle class="home" cx="${x}" cy="${y}" r="${7/z}" style="stroke-width:${2/z}px"/>`; }
      // Scale strokes by hand: vector-effect on this large path mis-renders its fill when zoomed in Chromium.
      svg.insertAdjacentHTML('beforeend',`<path class="land" d="${M.svg}" style="stroke-width:${1/z}px"/>`+extra);
      svg.setAttribute('viewBox',vb);
      const pts=r.map_points.filter(p=>p.lat!=null);
      pts.forEach(p=>{ const [x,y]=projUK(p.lat,p.lng); const c=document.createElementNS(NS,'circle'); c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',(ids.has(p.id)?6:3.8)/z); c.style.strokeWidth=1.4/z;
        c.setAttribute('class','pin'+(p.type==='sport'?' sport':'')+(ids.has(p.id)?'':' dim')+(p.id===selected?' hot':'')); c.dataset.id=p.id; c.dataset.n=p.title; svg.appendChild(c); });
      $('#mapTitle').innerHTML=`<b>${esc(loc.kind==='point'?loc.label:C.name)}</b>`; $('#mapCount').textContent=`${pts.length} on the map`;
      $('#mapNote').innerHTML=`<span class="legend"><span><i></i>Listing</span><span><i class="sp"></i>Sports event</span></span> Pale pins are further down the list. Area-wide listings aren’t pinned.`;
      svg.setAttribute('aria-label',`Map of ${pts.length} listings${loc.kind==='point'?' around '+loc.label:''}. The list has every result.`);
    } else if (MAP==='us'){
      const M=G.us; svg.setAttribute('viewBox',`0 0 ${M.W} ${M.H}`);
      const counts={}; Object.entries(r.facets.regions).forEach(([id,n])=>{ const c=ID2CODE[id]; if(c) counts[c]=(counts[c]||0)+n; }); const max=Math.max(1,...Object.values(counts)), sel=r.location.kind==='region'?(r.location.region_code||ID2CODE[r.location.region_id]||''):'';
      Object.entries(M.states).forEach(([ab,s])=>{ const p=document.createElementNS(NS,'path'); p.setAttribute('d',s.d); const c=counts[ab]||0; p.setAttribute('class','st'+(sel===ab?' sel':'')); p.style.fill=c?`rgba(20,94,57,${(0.08+0.5*c/max).toFixed(2)})`:'#fff'; p.dataset.st=ab; p.dataset.n=`${s.n}: ${c} ${c===1?'listing':'listings'}`; svg.appendChild(p); });
      // No pins: US listings have no coordinates yet, so the map only shades states (no invented positions).
      $('#mapTitle').innerHTML=`<b>${esc(sel?r.location.label:C.name)}</b>${sel?' · <a href="#" id="allStates">All states</a>':''}`;
      $('#mapCount').textContent=`${Object.keys(counts).length} states with listings`;
      $('#mapNote').innerHTML='Darker states have more listings. Choose a state to see them.';
      svg.setAttribute('aria-label',`Map of the United States shaded by number of listings per state${sel?', '+r.location.label+' selected':''}. Search by state or ZIP Code above.`);
      const a=$('#allStates'); if(a) a.onclick=e=>{e.preventDefault();S.q='';$('#q').value='';track('filters_changed',{removed:'q'});search({reason:'filter'});};
    }
    renderMapSel();
  }
  function renderMapSel(){
    const box=$('#mapsel'); const o = selected && (shown.find(x=>x.id===selected) || (last.map_points.find(p=>p.id===selected)));
    if (!o) { box.hidden=true; return; }
    const full = shown.find(x=>x.id===selected);
    box.innerHTML=`<div><b>${esc(o.title)}</b><span>${full?esc(U.when(full,MK)) + ' · ' + esc(full.location.label):'Further down the list'}</span></div><div class="acts"><button class="btn btn-turf btn-sm" type="button" data-qv="${esc(o.id)}">Details</button><button class="x" type="button" id="selX" aria-label="Clear selection">×</button></div>`;
    box.hidden=false; $('#selX').onclick=()=>select(null);
  }
  function select(id, {scroll=true}={}){
    selected=id;
    $$('#list .ocard').forEach(el=>el.setAttribute('aria-current',String(el.dataset.id===id)));
    $$('.pin').forEach(p=>p.classList.toggle('hot',p.dataset.id===id));
    renderMapSel();
    if (id && scroll && S.view==='list' && innerWidth>900) { const el=document.querySelector(`#list .ocard[data-id="${CSS.escape(id)}"]`); if(el) el.scrollIntoView({block:'nearest',behavior:U.RM?'auto':'smooth'}); }
  }

  function renderSeason(){
    const r=last, ms=[]; const t=new Date(U.TODAY+'T12:00:00Z'); for(let i=0;i<12;i++){ const d=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+i,15)); ms.push(d.toISOString().slice(0,7)); }
    const c=r.facets.months, max=Math.max(1,...ms.map(m=>c[m]||0));
    $('#months').innerHTML=ms.map(m=>`<button type="button" class="mo" data-m="${m}" aria-label="${fmt(m+'-15',MK,{month:'long',year:'numeric'})}: ${c[m]||0} listings"><b aria-hidden="true">${c[m]||0}</b><div class="bar" style="height:${Math.round(4+150*(c[m]||0)/max)}px"></div><span aria-hidden="true">${fmt(m+'-15',MK,{month:'short'})}</span></button>`).join('');
    $('#calNote').textContent = r.facets.undated ? `${r.facets.undated} more ${r.facets.undated===1?'listing is':'listings are'} regular or year-round (street trading, weekly markets) and aren’t shown by month.` : '';
  }

  /* ---------- coverage-building market ---------- */
  function renderCoverage(r){
    $('#strip').hidden = true; $('#ctrls').hidden = true; $('#afilters').innerHTML='';
    $('#h1').textContent = `Find pitches in ${C.name}`; document.title = `${C.name}: coming soon | FindPitches`;
    $("#sum").innerHTML = "";
    $('#fmain').className='fmain v-list nomap'; $('#mapwrap').hidden=true; $('#cal').hidden=true;
    $('#list').innerHTML = U.coverageBuilding(MK);
    $('#status').textContent = `${C.name} is coming soon. No listings yet.`;
  }

  /* ---------- quick view drawer (focus-trapped; Escape closes; focus returns) ---------- */
  let opener=null;
  async function openDrawer(id, from){
    opener=document.activeElement; select(id,{scroll:false});
    const D=$('#drawer'); D.innerHTML='<div class="skel" style="height:40px;margin-bottom:12px"></div><div class="skel" style="height:220px"></div>'; D.hidden=false; $('#scrim').hidden=false; document.body.style.overflow='hidden';
    let o; try { o = await api.opportunities.get(id); } catch(e){ D.innerHTML=`<div class="dtop"><span></span><button class="x" type="button" data-closedrawer aria-label="Close">×</button></div><h2 id="dName" tabindex="-1">Listing not available</h2><p class="muted">It may have been removed. <a href="finder.html">Back to search</a></p>`; $('#dName').focus(); return; }
    const inList = shown.find(x=>x.id===id); if (inList) o.distance_km = inList.distance_km;
    const f=freshness(o,MK), on=st.saved.has(o.id), sp=o.type==='sport';
    track('opportunity_opened',{id, market:MK, from: from||'finder_list', locked:o.access.locked});
    D.innerHTML=`<div class="dtop"><span class="ty ${sp?'sport':''}">${esc(o.type_label)}</span><button class="x" type="button" data-closedrawer aria-label="Close quick view">×</button></div>
      <h2 id="dName" tabindex="-1">${esc(o.title)}</h2><p class="muted" style="margin:0">${esc(o.location.label)}</p>
      ${factsHTML(o,{from:last&&last.location.label})}
      ${applyPanel(o)}
      ${o.notes?`<p class="dnote">${esc(o.notes)}</p>`:''}
      <p class="fresh ${f.cls}"><i aria-hidden="true"></i>${esc(f.long)}</p>
      <div class="dfoot"><button class="btn btn-line" type="button" data-save="${esc(o.id)}" aria-pressed="${on}">${on?'★ Saved':'☆ Save'}</button><a class="btn btn-line" href="${R.draft.opportunity(o.id)}">Full listing</a></div>`;
    $('#dName').focus();
  }
  function closeDrawer(){ if($('#drawer').hidden) return; $('#drawer').hidden=true; $('#scrim').hidden=true; document.body.style.overflow=''; if(opener && document.contains(opener)) opener.focus(); }
  $('#drawer').addEventListener('keydown',e=>{
    if (e.key==='Escape') { e.stopPropagation(); closeDrawer(); }
    if (e.key==='Tab') { const f=[...$('#drawer').querySelectorAll('a[href],button:not([disabled])')]; if(!f.length) return; const a=f[0], z=f[f.length-1];
      if (e.shiftKey && (document.activeElement===a||document.activeElement.id==='dName')) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement===z) { e.preventDefault(); a.focus(); } }
  });

  function makeAlert(){ createAlert(query(), { placeLabel: last && last.location && last.location.kind!=='unknown' ? last.location.label : null }); }

  /* ---------- events ---------- */
  $('#sform').addEventListener('submit',e=>{ e.preventDefault(); S.q=$('#q').value.trim(); S.sells=$('#sells').value; if(CAN.radius) S.radius=$('#radius').value; S.when=$('#when').value; S.month='';
    track('search_submitted',{market:MK, has_location:!!S.q, radius_km:radiusKm()||null, sells:S.sells||null, when:S.when||null});
    $('#sform').classList.remove('open'); $('#moreBtn').setAttribute('aria-expanded','false');
    search().then(()=>{ if (innerWidth<=760) $('#h1').focus(); }); });
  ['sells','radius','when'].forEach(id=>{ const el=$('#'+id); if(el) el.addEventListener('change',()=>{ S[id]=el.value; S.month=''; track('filters_changed',{[id]:el.value||null}); search({reason:'filter'}); }); });
  $('#moreBtn').onclick=()=>{ const o=$('#sform').classList.toggle('open'); $('#moreBtn').setAttribute('aria-expanded',String(o)); };
  $('#sort').onchange=e=>{ S.sort=e.target.value; track('sort_changed',{sort:S.sort}); search({reason:'sort'}); };
  $('#alertBtn').onclick=makeAlert;
  $$('[data-view]').forEach(b=>b.onclick=()=>{ S.view=b.dataset.view; track('view_changed',{view:S.view}); syncUrl(); renderView(); $('#status').textContent = {list:'Showing the list.',map:'Showing the map.',season:'Showing listings by month.'}[S.view]; });
  document.addEventListener('click',e=>{
    const t=e.target;
    if (t.closest('[data-closedrawer]')||t===$('#scrim')) return closeDrawer();
    const chip=t.closest('.chip[data-t]'); if(chip){ const v=chip.dataset.t; if(!v) S.types.clear(); else S.types.has(v)?S.types.delete(v):S.types.add(v); track('filters_changed',{types:[...S.types]}); return search({reason:'filter'}).then(()=>{ const c=document.querySelector(`.chip[data-t="${v}"]`); c&&c.focus(); }); }
    const rm=t.closest('[data-rm]'); if(rm) return removeFilter(rm.dataset.rm);
    if (t.closest('#clearAll')) { S.q=''; S.sells=''; S.when=''; S.month=''; S.types.clear(); ['q','sells','when'].forEach(i=>$('#'+i).value=''); track('filters_changed',{cleared:true}); return search({reason:'filter'}).then(()=>$('#h1').focus()); }
    const sg=t.closest('[data-sug]'); if(sg) return applySuggestion(sg.dataset.sug);
    if (t.closest('#more')) { S.page++; track('results_loaded_more',{page:S.page}); return search({append:true, focusFirstNew:true}); }
    const mo=t.closest('.mo'); if(mo){ S.month=mo.dataset.m; S.view='list'; track('filters_changed',{month:S.month}); return search({reason:'filter'}).then(()=>$('#h1').focus()); }
    const qv=t.closest('[data-qv]'); if(qv) return openDrawer(qv.dataset.qv,'map');
    const pin=t.closest('.pin'); if(pin) return select(pin.dataset.id);
    const stt=t.closest('.st'); if(stt){ S.q=stt.dataset.st; $('#q').value=S.q; track('filters_changed',{state:S.q}); return search({reason:'filter'}); }
    const open=t.closest('a[data-open]'); if(open && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button===0 && open.closest('#list')){ e.preventDefault(); return openDrawer(open.dataset.open,'finder_list'); }
  });
  $('#list').addEventListener('mouseover',e=>{ const r=e.target.closest('.ocard'); $$('.pin').forEach(p=>p.classList.toggle('hot',(r&&p.dataset.id===r.dataset.id)||p.dataset.id===selected)); });
  const tip=$('#tip');
  $('#map').addEventListener('mousemove',e=>{ const p=e.target.closest('.pin,.st'); if(!p){tip.hidden=true;return;} tip.textContent=p.dataset.n; tip.hidden=false; tip.style.left=Math.min(e.clientX+12,innerWidth-250)+'px'; tip.style.top=(e.clientY+12)+'px'; if(p.classList.contains('pin')) $$('#list .ocard').forEach(r=>r.classList.toggle('hot',r.dataset.id===p.dataset.id)); });
  $('#map').addEventListener('mouseleave',()=>{tip.hidden=true;$$('#list .ocard.hot').forEach(r=>r.classList.remove('hot'));});
  document.addEventListener('fp:session',()=>search({reason:'session'}));
  document.addEventListener('fp:saved',e=>{ const b=document.querySelector(`#drawer [data-save]`); if(b){ const on=st.saved.has(b.dataset.save); b.textContent=on?'★ Saved':'☆ Save'; } });

  search({reason:'init'});
})();
