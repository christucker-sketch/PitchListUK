// Page script for index.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
await FP.ready;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s=>document.querySelector(s), R=FP.routes, st=FP.state, CFG=FP.seoConfig, SEO=FP.seo, esc=FP.ui.esc, api=FP.api;
const MARKETS = st.markets, M = Object.fromEntries(MARKETS.map(m=>[m.code,m]));
const cap = s=>s[0].toUpperCase()+s.slice(1);
// Illustrative example fees for the locale preview card only (fictional example listing, not data).
const EXAMPLE_FEE = {GB:[45,'a day'],US:[150,'per 10×10'],CA:[120,'per day'],AU:[80,'a day'],IE:[60,'a day'],NZ:[70,'a day'],SG:[180,'per day'],HK:[600,'per day']};
const KEY={sport:'sport',christmas_market:'christmas',holiday_market:'christmas',food_festival:'food',market:'market',festival:'festival',show:'show',event:'event',street_trading:'street',concession:'concession'};
const TYPE={food:'Food',christmas:'Christmas',sport:'Sport',craft:'Craft',market:'Market',festival:'Festival',show:'Show',event:'Event',street:'Street',concession:'Concession'};
const good=o=>!/^(Trader call|Street trading|Vendor call)/i.test(o.title);

/* ---------- data (all via FP.api) ---------- */
const dataMarkets = MARKETS.filter(m=>m.draft_has_data);
// Live mode: listings are subscriber-only and the API has no public counts or "coming up" feed, so the
// homepage shows no listing data at all (nothing public is derived from paid records).
const LIVE = false; // V3: full homepage (board, stats, SEO links)
const BOARD = {};
if (LIVE) {
  // Hard-coded example cards point at offline-draft fixtures, not live listings: hidden in live.
  ['#coming-up', '.proof', '#popular', 'section.seo', '.sreal', 'article.listing[aria-label="Example listing"]'].forEach(sel => document.querySelectorAll(sel).forEach(el => el.hidden = true));
  document.querySelectorAll('#reelTotal').forEach(e => e.closest('.tile').hidden = true);
} else {
  const stats = await api.meta.stats();
  for (const m of dataMarkets) BOARD[m.code] = (await api.opportunities.upcoming({market:m.code,limit:30})).filter(good).slice(0,11).map(o=>[o.dates.start,o.title,o.location.label,KEY[o.type]||'event',o.id]);
  await fillLiveExamples();
  $('#stTotal').textContent=stats.total; document.querySelectorAll('#reelTotal').forEach(e=>e.textContent=stats.total); $('#stUS').textContent=(stats.markets.US||{}).regions||0; $('#stUK').textContent=(stats.markets.GB||{}).regions||0;
}

// Example content on the homepage is always a real, current listing from the V3 API (never hard-coded).
async function fillLiveExamples(){
  const U=FP.ui, live=dataMarkets.map(m=>m.code);
  try {
    const up=[]; for (const c of live) up.push(...(await api.opportunities.upcoming({market:c,limit:12})).filter(good));
    const cards=[...document.querySelectorAll('[data-live-card]')];
    up.slice(0,cards.length).forEach((o,i)=>{ const el=cards[i]; el.innerHTML=`<span class="t">${U.esc(o.type_label||'Listing')}</span><b>${U.esc(o.title)}</b><span>${U.esc(o.location.label)}${o.dates.start?' · '+U.esc(fmtDate(o.dates.start,o.market)):''}</span><span class="ok">✓ Checked</span>`; el.hidden=false; });
    const ex=up.find(o=>o.market==='GB')||up[0], L=document.querySelector('[data-live-listing]');
    if (ex && L) { const f=k=>L.querySelector(`[data-f="${k}"]`); const st=U.appStatus(ex,ex.market);
      f('checked').textContent=ex.checked&&ex.checked.last_checked?fmtDate(ex.checked.last_checked,ex.market):''; f('type').textContent=ex.type_label||'Listing';
      f('title').textContent=ex.title; f('where').textContent=ex.location.label; f('when').textContent=U.when(ex,ex.market); f('apply').textContent=st.short||'Direct, via the organiser';
      f('link').href=R.draft.opportunity(ex.id); L.hidden=false; }
    const S=document.querySelector('[data-live-sport]'); const sport=[];
    for (const c of live) { const r=await api.opportunities.search({market:c,types:['sport'],page_size:2}); sport.push(...r.results); }
    if (S && sport.length) { S.innerHTML=sport.slice(0,4).map(o=>`<a class="scard" href="${R.draft.opportunity(o.id)}"><span class="t">${U.esc(o.type_label||'Sports')}</span><b>${U.esc(o.title)}</b><span>${U.esc(o.location.label)}${o.dates.start?' · '+U.esc(fmtDate(o.dates.start,o.market)):''}</span><span class="cc2">${U.esc(o.market==='GB'?'UK':o.market)}</span></a>`).join(''); S.hidden=false; }
  } catch (e) { console.warn('homepage examples unavailable', e && e.code); }
}

function fmtDate(iso,code){ const m=M[code]||M.GB; if(m.date_format==='YYYY-MM-DD') return iso; return new Intl.DateTimeFormat(m.locale,{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z')); }
function money(n,code){ const m=M[code]; try{ return new Intl.NumberFormat(m.locale,{style:'currency',currency:m.currency,maximumFractionDigits:0}).format(n); }catch(e){ return n; } }

/* ---------- board ---------- */
const btabs=document.querySelector('.bhead .tabs');
btabs.innerHTML = dataMarkets.map((m,i)=>`<button type="button" aria-pressed="${i===0}" data-b="${m.code}">${esc(m.name)}</button>`).join('');
function scramble(el,text){ if(RM){el.textContent=text;return;} const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let f=0; const N=10;
  const t=setInterval(()=>{f++; el.textContent=text.split('').map((ch,i)=>ch===' '||i<text.length*f/N?ch:chars[(Math.random()*36)|0]).join(''); if(f>=N){clearInterval(t);el.textContent=text;}},45); }
function renderBoard(code){
  if(!BOARD[code]) code=dataMarkets[0].code;
  document.querySelectorAll('[data-b]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.b===code)));
  const body=$('#boardBody'); body.innerHTML='';
  BOARD[code].forEach((r,i)=>{ const tr=document.createElement('tr'); tr.style.animationDelay=(i*0.06)+'s'; tr.style.cursor='pointer';
    tr.onclick=e=>{ if(!e.target.closest('a')) location.href=R.draft.opportunity(r[4]); };
    tr.innerHTML=`<td>${fmtDate(r[0],code)}</td><td class="ev"><a href="${R.draft.opportunity(r[4])}" aria-label="${esc(r[1])}"></a></td><td class="wh">${esc(r[2])}</td><td><span class="ty ${r[3]==='sport'?'sport':''}">${TYPE[r[3]]}</span></td>`;
    body.appendChild(tr); setTimeout(()=>scramble(tr.querySelector('.ev a'),r[1]),i*60); });
}
btabs.addEventListener('click',e=>{const b=e.target.closest('[data-b]'); if(b) renderBoard(b.dataset.b);});

/* ---------- reel ---------- */
document.querySelectorAll('.col').forEach(c=>{c.innerHTML+=c.innerHTML;});

/* ---------- market lens + locale ---------- */
let cur = st.market;
const radius=$('#radius');
function setRadius(m){ const on=!!(m.search&&m.search.radius); $('#radiusF').hidden=!on; $('.console .grid').classList.toggle('nor',!on); const prev=radius.value; radius.innerHTML=m.radius_options.map(v=>`<option value="${v}" aria-label="${v} ${FP.units.word(m.distance_unit,v)}">${v} ${FP.units.short(m.distance_unit)}</option>`).join('')+'<option value="any">Anywhere</option>'; radius.value=[...radius.options].some(o=>o.value===prev)?prev:String(m.radius_options[2]||50); }
async function applyLocale(code,opts={}){
  cur=code; const m=M[code];
  if(st.market!==code){ st.market=code; FP.ui.renderHeader(); }
  const v=m.vocab, map={trader:v.trader, apps:v.apps, traders:v.traders, sport:v.sport, traderPl:v.traders_short, nameThe:m.the};
  document.querySelectorAll('[data-l]').forEach(el=>{ if(map[el.dataset.l]) el.textContent=map[el.dataset.l]; });
  $('#locLbl').textContent = LIVE ? 'Town, area or keyword' : m.postal.kind==='district' ? 'District or place' : m.search&&m.search.radius ? m.postal.label+' or town' : m.postal.label+' or '+m.region_label.singular;
  if(!opts.keepInput) $('#loc').placeholder='e.g. '+m.postal.example;
  setRadius(m);
  setFaq(m);
  const intents=CFG.intentsFor(code);
  $('#popular').innerHTML='<span>Popular:</span>'+intents.slice(0,4).map(i=>`<a href="${R.draft.seo(SEO.pathOf(code,i))}">${esc(i.labels[code])}</a>`).join('');
  if(!opts.keepHint) hintDefault();
  document.querySelectorAll('#clist button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.c===code)));
  $('#pvLabel').textContent=m.postal.kind==='district'?'District':m.postal.label; $('#pvPh').textContent='e.g. '+m.postal.example;
  $('#pvDate').textContent=fmtDate('2026-11-27',code)+(m.date_format==='YYYY-MM-DD'?'':' – '+fmtDate('2026-12-20',code));
  $('#pvDist').textContent=m.distance_unit==='mi'?'3.8 mi':'6.1 km';
  $('#pvFeeL').textContent=cap(v.fee); $('#pvFee').textContent=`from ${money(EXAMPLE_FEE[code][0],code)} ${EXAMPLE_FEE[code][1]}`;
  $('#pvVocab').innerHTML=[['You are a',cap(v.trader)],['You pay a',v.fee],['Dates',m.date_format],['Currency',m.currency]].map(([a,b])=>`<div><small>${a}</small><b>${esc(b)}</b></div>`).join('');
  $('#pvFoot').textContent = m.launch_status==='live' ? (m.opportunity_count!=null ? `Live now · ${m.opportunity_count} checked listings. The listing above is an example.` : `Live now. The listing above is an example.`) : `Coming soon to ${m.name}: search by ${m.postal.kind==='district'?'district (Hong Kong doesn’t use postcodes)':m.postal.label_mid}, distances in ${m.distance_unit==='km'?'kilometres':'miles'}, fees in ${m.currency}.`;
  $('#seoCols').innerHTML=intents.map(i=>`<a href="${R.draft.seo(SEO.pathOf(code,i))}">${esc(i.labels[code])}</a>`).join('');
  if(!intents.length) $('#seoCols').innerHTML=`<a href="${R.draft.seo(R.marketPath(code))}">Browse ${esc(m.name)}</a>`;
  $('#popular').hidden=!intents.length;
  $('#seoFor').textContent = m.launch_status==='live' ? `Each one is also broken down by ${m.region_label.singular}, so you can see what’s near you.` : `${m.name} opens soon. These pages fill up as listings are checked.`;
  if(BOARD[code] && !opts.keepBoard) renderBoard(code);
  $('#ecountry').value = M[code].launch_status==='live' ? (MARKETS.find(x=>x.launch_status!=='live')||M[code]).code : code;
}
$('#clist').innerHTML=MARKETS.map(m=>`<li><button type="button" data-c="${m.code}"><span class="code">${esc(m.display_code)}</span><span>${esc(m.name)}<small>${esc(m.postal.kind==='district'?'District':m.postal.label)} · ${m.distance_unit==='mi'?'miles':'kilometres'} · ${esc(m.currency)}</small></span><span class="st ${m.launch_status==='live'?'live':''}">${m.launch_status==='live'?(m.opportunity_count!=null?m.opportunity_count+' live':'Live'):'Coming soon'}</span></button></li>`).join('');
$('#clist').addEventListener('click',e=>{const b=e.target.closest('[data-c]'); if(b) applyLocale(b.dataset.c);});
$('#ecountry').innerHTML=MARKETS.map(m=>`<option value="${m.code}">${esc(m.name)}${m.launch_status==='live'?' (live now)':''}</option>`).join('');

/* ---------- search ---------- */
const loc=$('#loc'), hint=$('#hint'), what=$('#what');
function hintDefault(){ const m=M[cur]; hint.innerHTML = m.launch_status==='live' ? `Searching <b>${esc(m.the)}</b>. Use a postcode or ZIP Code from another country and we’ll switch.` : `FindPitches opens in <b>${esc(m.name)}</b> soon. Search to see what’s coming and get notified.`; }
function detect(v){
  const s=v.trim().toUpperCase(); if(!s) return null;
  if(/^\d{6}$/.test(s)) return 'SG';
  if(/^\d{5}(-?\d{4})?$/.test(s)) return 'US';
  if(/^\d{4}$/.test(s)) return 'AUNZ';
  if(/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]( ?\d([ABCEGHJ-NPRSTV-Z]\d?)?)?$/.test(s)) return 'CA';
  if(/^([AC-FHKNPRTV-Y]\d{2}|D6W)( ?[0-9AC-FHKNPRTV-Y]{1,4})?$/.test(s) && !/^[BEGLMNSW]\d{1,2}$/.test(s)) return 'IE';
  if(/^((?:[BEGLMNSW]|[A-PR-UWYZ][A-HK-Y])\d[A-Z\d]?)( ?\d([ABD-HJLNP-UW-Z]{0,2}))?$/.test(s)) return 'GB';
  if(/^[A-Z][A-Z .'-]{2,}$/.test(s)) return 'TOWN';
  return '?';
}
const article = m => ({GB:'a UK',US:'a US',CA:'a Canadian',IE:'an Irish',SG:'a Singapore'})[m.code] || 'a';
loc.addEventListener('input',()=>{
  const k=detect(loc.value);
  if(!k||k==='?'||k==='TOWN'){ if(!k) hintDefault(); else if(k==='TOWN') hint.innerHTML = cur==='HK' ? `Searching districts and places in <b>Hong Kong</b>.` : `Searching towns in <b>${esc(M[cur].name)}</b>.`; return; }
  if(k==='AUNZ'){ hint.innerHTML='Four digits. Is that <span class="pick"><button type="button" data-c="AU">Australia</button><button type="button" data-c="NZ">New Zealand</button></span>?'; return; }
  if(k!==cur){ applyLocale(k,{keepInput:true,keepHint:true}); const m=M[k]; hint.innerHTML=`<span class="sw">Looks like ${article(m)} ${m.postal.label_mid}.</span> Switched to ${esc(m.name)}.`; }
});
hint.addEventListener('click',e=>{const b=e.target.closest('[data-c]'); if(b) applyLocale(b.dataset.c,{keepInput:true});});
$('#search').addEventListener('submit',e=>{
  e.preventDefault(); const v=loc.value.trim(); const p={};
  if(v) p.q=v; const w=what.value;
  if (LIVE) { const OFFER={food:'food',craft:'craft',market:'market',general:'',christmas:'',sport:''}; if(OFFER[w]) p.offering=OFFER[w]; if(w==='christmas'&&!v) p.q='christmas'; if(w==='sport'&&!v) p.q='sport'; }
  else { if(['food','craft','market','general'].includes(w)) p.sells=w; if(w==='sport') p.type='sport'; if(w==='christmas') p.type='christmas_market,holiday_market'; }
  if(!LIVE && M[cur].search&&M[cur].search.radius){ p.radius=radius.value; }
  FP.track('home_search_submitted',{market:cur,has_location:!!v,what:w});
  location.href=R.draft.finder(cur,p);
});
if (LIVE) $('#sportGo').href = 'finder.html'; else $('#sportGo').href = R.draft.seo(SEO.pathOf(dataMarkets.find(m=>m.code==='US')?'US':cur, CFG.intentFor('US','sports')));

$('#earlyForm').addEventListener('submit',async e=>{
  e.preventDefault(); const em=$('#email'), done=$('#done'), code=$('#ecountry').value;
  if(M[code].launch_status==='live'){ done.innerHTML=`FindPitches is already live in ${esc(M[code].name)}. <a href="${R.draft.finder(code)}">Search now →</a>`; return; }
  try{ await api.waitlist.join({email:em.value.trim(),market:code}); FP.track('waitlist_joined',{market:code,from:'home'}); done.textContent=`You're on the list. We'll email ${em.value.trim()} when ${M[code].name} opens.`; em.value=''; }
  catch(x){ done.textContent=x.message; em.setAttribute('aria-invalid','true'); em.focus(); }
});
$('#email').addEventListener('input',e=>e.target.removeAttribute('aria-invalid'));
async function setFaq(m){
  const live=MARKETS.filter(x=>x.launch_status==='live').map(x=>x.name), bld=MARKETS.filter(x=>x.launch_status!=='live').map(x=>x.name);
  $('#faqMarkets').textContent=`FindPitches is built for eight markets. Live now: ${FP.ui.listJoin(live)}. Coming soon: ${FP.ui.listJoin(bld)}. Each country gets its own local search.`;
  try{ const pro=(await api.billing.plans({market:m.code})).find(p=>p.id==='pro_monthly');
    if (LIVE) { $('#faqPrice').textContent = pro.price!=null ? `Listings are for subscribers. Pro is ${pro.price_label} a month${pro.trial_days?` after a ${pro.trial_days}-day free trial`:''}, and gives you every checked listing, full details and the organiser’s application page.` : `Listings are for subscribers. ${pro.note||''}`;
      $('#freeline').innerHTML = pro.price!=null ? (pro.trial_days?`<b>Try Pro free for ${pro.trial_days} days</b>, then ${esc(pro.price_label)} a month.`:`<b>Pro is ${esc(pro.price_label)} a month.</b>`)+' Cancel any time.' : ''; return; }
    $('#faqPrice').textContent = pro.price!=null ? `Searching and saving are free. Pro is ${pro.price_label} a month after a 7-day free trial, and adds the organiser’s application page for every listing plus alerts.` : `Searching and saving are free. Pro adds the organiser’s application page for every listing plus alerts. ${pro.note||''}`;
    $('#freeline').innerHTML = `<b>Free to search.</b> No account needed.${pro.price!=null?` Pro from ${esc(pro.price_label)} a month when you’re ready to apply.`:''}`;
  }catch(x){}
}

$('#bDraft').innerHTML=FP.ui.draftNote('the board shows real listings from sample data (UK checked Jul–Aug 2026, US batch of 9 Sep 2026).');
applyLocale(M[cur]?cur:'GB');
if(!LIVE && !BOARD[cur] && dataMarkets[0]) renderBoard(dataMarkets[0].code);
})();
