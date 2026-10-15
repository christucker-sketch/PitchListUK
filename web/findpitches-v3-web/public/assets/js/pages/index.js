// Page script for index.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const translateUI=FP.i18n.tr, uiHTML=FP.i18n.html;
await FP.ready;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s=>document.querySelector(s), R=FP.routes, st=FP.state, CFG=FP.seoConfig, SEO=FP.seo, esc=FP.ui.esc, api=FP.api;
const MARKETS = st.markets, M = Object.fromEntries(MARKETS.map(m=>[m.code,m]));
const cap = s=>s[0].toUpperCase()+s.slice(1);
// Illustrative example fees for the locale preview card only (fictional example listing, not data).
const EXAMPLE_FEE = {GB:[45,translateUI('a day')],US:[150,'per 10×10'],CA:[120,translateUI('per day')],AU:[80,translateUI('a day')],IE:[60,translateUI('a day')],NZ:[70,translateUI('a day')],SG:[180,translateUI('per day')],HK:[600,translateUI('per day')]};
const KEY={sport:'sport',christmas_market:'christmas',holiday_market:'christmas',food_festival:'food',market:'market',festival:'festival',show:'show',event:'event',street_trading:'street',concession:'concession'};
const TYPE={food:translateUI('Food'),christmas:translateUI('Christmas'),sport:translateUI('Sport'),craft:translateUI('Craft'),market:translateUI('Market'),festival:translateUI('Festival'),show:translateUI('Show'),event:translateUI('Event'),street:translateUI('Street'),concession:translateUI('Concession')};
const good=o=>!/^(Trader call|Street trading|Vendor call)/i.test(o.title);

/* ---------- data (all via FP.api) ---------- */
const dataMarkets = MARKETS.filter(m=>m.opportunity_count>0);
// Live mode: listings are subscriber-only and the API has no public counts or "coming up" feed, so the
// homepage shows no listing data at all (nothing public is derived from paid records).
const LIVE = false; // V3: full homepage (board, stats, SEO links)
const BOARD = {};
if (LIVE) {
  // Hard-coded example cards point at offline-draft fixtures, not live listings: hidden in live.
  ['#coming-up', '.proof', '#popular', 'section.seo', '.sreal', 'article.listing[aria-label="Example listing"]'].forEach(sel => document.querySelectorAll(sel).forEach(el => el.hidden = true));
  document.querySelectorAll('#reelTotal').forEach(e => e.closest('.tile').hidden = true);
} else {
  const home = st.home || await api.meta.home(), stats=home.stats;
  for (const m of dataMarkets) BOARD[m.code] = (home.upcoming[m.code]||[]).slice(0,11).map(o=>[o.dates.start,o.title,o.location.label,KEY[o.type]||'event',o.id]);
  fillLiveExamples(home);
  const areas=(home.regions.GB||[]).filter(r=>!r.parent_id&&r.opportunity_count>0);
  $('#coverageAreas').innerHTML=areas.length?areas.map(r=>uiHTML`<a href="${R.draft.seo(SEO.pathOf('GB',null,r))}">${esc(r.name)} <span>${r.opportunity_count} checked ${r.opportunity_count===1?'listing':'listings'}</span></a>`).join(''):uiHTML('<p>Regional coverage is still being checked. <a href="')+R.draft.finder('GB')+'">Browse every UK listing</a>.</p>';
  $('#stTotal').textContent=stats.total; document.querySelectorAll('#reelTotal').forEach(e=>e.textContent=stats.total); $('#stUS').textContent=(stats.markets.US||{}).regions||0; $('#stUK').textContent=(stats.markets.GB||{}).regions||0;
}

// Example content on the homepage is always a real, current listing from the V3 API (never hard-coded).
function fillLiveExamples(home){
  const U=FP.ui, live=dataMarkets.map(m=>m.code);
  try {
    const up=live.flatMap(c=>(home.upcoming[c]||[]).slice(0,12));
    const cards=[...document.querySelectorAll('[data-live-card]')];
    up.slice(0,cards.length).forEach((o,i)=>{ const el=cards[i]; el.innerHTML=uiHTML`<span class="t">${U.esc(o.type_label||translateUI('Listing'))}</span><b>${U.esc(o.title)}</b><span>${U.esc(o.location.label)}${o.dates.start?' · '+U.esc(fmtDate(o.dates.start,o.market)):''}</span><span class="ok">✓ Checked</span>`; el.hidden=false; });
    const ex=up.find(o=>o.market==='GB')||up[0], L=document.querySelector('[data-live-listing]');
    if (ex && L) { const f=k=>L.querySelector(`[data-f="${k}"]`); const st=U.appStatus(ex,ex.market);
      f('checked').textContent=ex.checked&&ex.checked.last_checked?fmtDate(ex.checked.last_checked,ex.market):''; f('type').textContent=ex.type_label||translateUI('Listing');
      f('title').textContent=ex.title; f('where').textContent=ex.location.label; f('when').textContent=U.when(ex,ex.market); f('apply').textContent=st.short||translateUI('Direct, via the organiser');
      f('link').href=R.draft.opportunity(ex.id); L.hidden=false; }
    const S=document.querySelector('[data-live-sport]'); const sport=home.sports;
    if (S && sport.length) { S.innerHTML=sport.slice(0,4).map(o=>uiHTML`<a class="scard" href="${R.draft.opportunity(o.id)}"><span class="t">${U.esc(o.type_label||translateUI('Sports'))}</span><b>${U.esc(o.title)}</b><span>${U.esc(o.location.label)}${o.dates.start?' · '+U.esc(fmtDate(o.dates.start,o.market)):''}</span><span class="cc2">${U.esc(o.market==='GB'?'UK':o.market)}</span></a>`).join(''); S.hidden=false; }
  } catch (e) { console.warn('homepage examples unavailable', e && e.code); }
}

function fmtDate(iso,code){ const m=M[code]||M.GB; if(m.date_format==='YYYY-MM-DD'&&FP.i18n.current==='en') return iso; return new Intl.DateTimeFormat(m.locale,{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z')); }
function money(n,code){ const m=M[code]; try{ return new Intl.NumberFormat(m.locale,{style:'currency',currency:m.currency,maximumFractionDigits:0}).format(n); }catch(e){ return n; } }

/* ---------- board ---------- */
const btabs=document.querySelector('.bhead .tabs');
btabs.innerHTML = dataMarkets.map((m,i)=>uiHTML`<button type="button" aria-pressed="${i===0}" data-b="${m.code}">${esc(m.name)}</button>`).join('');
function scramble(el,text){ if(RM){el.textContent=text;return;} const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let f=0; const N=10;
  const t=setInterval(()=>{f++; el.textContent=text.split('').map((ch,i)=>ch===' '||i<text.length*f/N?ch:chars[(Math.random()*36)|0]).join(''); if(f>=N){clearInterval(t);el.textContent=text;}},45); }
function renderBoard(code){
  if(!BOARD[code]&&dataMarkets[0]) code=dataMarkets[0].code;
  document.querySelectorAll('[data-b]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.b===code)));
  const body=$('#boardBody'); body.innerHTML='';
  if(!(BOARD[code]||[]).length){body.innerHTML=uiHTML('<tr><td colspan="4">No verified upcoming dates for this country yet. <a href="')+R.draft.finder(code||cur)+'">Browse all its current opportunities</a>.</td></tr>';return;}
  BOARD[code].forEach((r,i)=>{ const tr=document.createElement('tr'); tr.style.animationDelay=(i*0.06)+'s'; tr.style.cursor='pointer';
    tr.onclick=e=>{ if(!e.target.closest('a')) location.href=R.draft.opportunity(r[4]); };
    tr.innerHTML=uiHTML`<td>${fmtDate(r[0],code)}</td><td class="ev"><a href="${R.draft.opportunity(r[4])}" aria-label="${esc(r[1])}"></a></td><td class="wh">${esc(r[2])}</td><td><span class="ty ${r[3]==='sport'?'sport':''}">${TYPE[r[3]]}</span></td>`;
    body.appendChild(tr); setTimeout(()=>scramble(tr.querySelector('.ev a'),r[1]),i*60); });
}
btabs.addEventListener('click',e=>{const b=e.target.closest('[data-b]'); if(b) renderBoard(b.dataset.b);});

/* ---------- reel ---------- */
document.querySelectorAll('.col').forEach(c=>{c.innerHTML+=c.innerHTML;});

/* ---------- market lens + locale ---------- */
let cur = st.market;
const radius=$('#radius');
function setRadius(m){ const on=!!(m.search&&m.search.radius); $('#radiusF').hidden=!on; $('.console .grid').classList.toggle('nor',!on); const prev=radius.value; radius.innerHTML=m.radius_options.map(v=>uiHTML`<option value="${v}" aria-label="${v} ${FP.units.word(m.distance_unit,v)}">${v} ${FP.units.short(m.distance_unit)}</option>`).join('')+uiHTML('<option value="any">Anywhere</option>'); radius.value=[...radius.options].some(o=>o.value===prev)?prev:String(m.radius_options[2]||50); }
async function applyLocale(code,opts={}){
  cur=code; const m=M[code];
  if(st.market!==code){ st.market=code; FP.ui.renderHeader(); }
  const v=m.vocab, map={trader:v.trader, apps:v.apps, traders:v.traders, sport:v.sport, traderPl:v.traders_short, nameThe:m.the};
  document.querySelectorAll('[data-l]').forEach(el=>{ if(map[el.dataset.l]) el.textContent=map[el.dataset.l]; });
  $('#locLbl').textContent = LIVE ? translateUI('Town, area or keyword') : m.postal.kind==='district' ? translateUI('District or place') : m.search&&m.search.radius ? m.postal.label+translateUI(' or town') : m.postal.label+' or '+m.region_label.singular;
  if(!opts.keepInput) $('#loc').placeholder='e.g. '+m.postal.example;
  setRadius(m);
  setFaq(m);
  const intents=CFG.intentsFor(code);
  $('#popular').innerHTML=uiHTML('<span>Popular:</span>')+intents.slice(0,4).map(i=>uiHTML`<a href="${R.draft.seo(SEO.pathOf(code,i))}">${esc(i.labels[code])}</a>`).join('');
  if(!opts.keepHint) hintDefault();
  document.querySelectorAll('#clist button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.c===code)));
  $('#pvLabel').textContent=m.postal.kind==='district'?translateUI('District'):m.postal.label; $('#pvPh').textContent='e.g. '+m.postal.example;
  $('#pvDate').textContent=fmtDate('2026-11-27',code)+(m.date_format==='YYYY-MM-DD'?'':' – '+fmtDate('2026-12-20',code));
  $('#pvDist').textContent=m.distance_unit==='mi'?'3.8 mi':'6.1 km';
  $('#pvFeeL').textContent=cap(v.fee); $('#pvFee').textContent=translateUI("from {0} {1}",[money(EXAMPLE_FEE[code][0],code),EXAMPLE_FEE[code][1]]);
  $('#pvVocab').innerHTML=[[translateUI('You are a'),cap(v.trader)],[translateUI('You pay a'),v.fee],[translateUI('Dates'),m.date_format],[translateUI('Currency'),m.currency]].map(([a,b])=>uiHTML`<div><small>${a}</small><b>${esc(b)}</b></div>`).join('');
  $('#pvFoot').textContent = m.launch_status==='live' ? (m.opportunity_count!=null ? translateUI("Live now · {0} checked listings. The listing above is an example.",[m.opportunity_count]) : translateUI("Live now. The listing above is an example.",[])) : translateUI("Coming soon to {0}: search by {1}, distances in {2}, fees in {3}.",[m.name,m.postal.kind==='district'?translateUI('district (Hong Kong doesn’t use postcodes)'):m.postal.label_mid,m.distance_unit==='km'?'kilometres':'miles',m.currency]);
  $('#seoCols').innerHTML=intents.map(i=>uiHTML`<a href="${R.draft.seo(SEO.pathOf(code,i))}">${esc(i.labels[code])}</a>`).join('');
  if(!intents.length) $('#seoCols').innerHTML=uiHTML`<a href="${R.draft.seo(R.marketPath(code))}">Browse ${esc(m.name)}</a>`;
  $('#popular').hidden=!intents.length;
  $('#seoFor').textContent = m.launch_status==='live' ? translateUI("Each one is also broken down by {0}, so you can see what’s near you.",[m.region_label.singular]) : translateUI("{0} opens soon. These pages fill up as listings are checked.",[m.name]);
  if(!opts.keepBoard) renderBoard(code);
  $('#ecountry').value = M[code].launch_status==='live' ? (MARKETS.find(x=>x.launch_status!=='live')||M[code]).code : code;
}
$('#clist').innerHTML=MARKETS.map(m=>uiHTML`<li><button type="button" data-c="${m.code}"><span class="code">${esc(m.display_code)}</span><span>${esc(m.name)}<small>${esc(m.postal.kind==='district'?translateUI('District'):m.postal.label)} · ${m.distance_unit==='mi'?'miles':'kilometres'} · ${esc(m.currency)}</small></span><span class="st ${m.launch_status==='live'?'live':''}">${m.launch_status==='live'?(m.opportunity_count!=null?m.opportunity_count+' live':translateUI('Live')):translateUI('Coming soon')}</span></button></li>`).join('');
$('#clist').addEventListener('click',e=>{const b=e.target.closest('[data-c]'); if(b) applyLocale(b.dataset.c);});
$('#ecountry').innerHTML=MARKETS.map(m=>uiHTML`<option value="${m.code}">${esc(m.name)}${m.launch_status==='live'?translateUI(' (live now)'):''}</option>`).join('');

/* ---------- search ---------- */
const loc=$('#loc'), hint=$('#hint'), what=$('#what');
function hintDefault(){ const m=M[cur]; hint.innerHTML = m.launch_status==='live' ? uiHTML`Searching <b>${esc(m.the)}</b>. Use a postcode or ZIP Code from another country and we’ll switch.` : uiHTML`FindPitches opens in <b>${esc(m.name)}</b> soon. Search to see what’s coming and get notified.`; }
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
const article = m => ({GB:'a UK',US:'a US',CA:translateUI('a Canadian'),IE:translateUI('an Irish'),SG:translateUI('a Singapore')})[m.code] || 'a';
loc.addEventListener('input',()=>{
  const k=detect(loc.value);
  if(!k||k==='?'||k==='TOWN'){ if(!k) hintDefault(); else if(k==='TOWN') hint.innerHTML = cur==='HK' ? uiHTML`Searching districts and places in <b>Hong Kong</b>.` : uiHTML`Searching towns in <b>${esc(M[cur].name)}</b>.`; return; }
  if(k==='AUNZ'){ hint.innerHTML=uiHTML('Four digits. Is that <span class="pick"><button type="button" data-c="AU">Australia</button><button type="button" data-c="NZ">New Zealand</button></span>?'); return; }
  if(k!==cur){ applyLocale(k,{keepInput:true,keepHint:true}); const m=M[k]; hint.innerHTML=uiHTML`<span class="sw">Looks like ${article(m)} ${m.postal.label_mid}.</span> Switched to ${esc(m.name)}.`; }
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
  if(M[code].launch_status==='live'){ done.innerHTML=uiHTML`FindPitches is already live in ${esc(M[code].name)}. <a href="${R.draft.finder(code)}">Search now →</a>`; return; }
  try{ await api.waitlist.join({email:em.value.trim(),market:code}); FP.track('waitlist_joined',{market:code,from:'home'}); done.textContent=translateUI("You're on the list. We'll email {0} when {1} opens.",[em.value.trim(),M[code].name]); em.value=''; }
  catch(x){ done.textContent=x.message; em.setAttribute('aria-invalid','true'); em.focus(); }
});
$('#email').addEventListener('input',e=>e.target.removeAttribute('aria-invalid'));
async function setFaq(m){
  const live=MARKETS.filter(x=>x.launch_status==='live').map(x=>x.name), bld=MARKETS.filter(x=>x.launch_status!=='live').map(x=>x.name);
  $('#faqMarkets').textContent=translateUI("FindPitches supports local markets. Live now: {0}. Coming soon: {1}. Each country gets its own local search.",[FP.ui.listJoin(live),FP.ui.listJoin(bld)]);
  try{ const pro=(await api.billing.plans({market:m.code})).find(p=>p.id==='pro_monthly');
    if (LIVE) { $('#faqPrice').textContent = pro.price!=null ? translateUI("Listings are for subscribers. Pro is {0} a month{1}, and gives you every checked listing, full details and the organiser’s application page.",[pro.price_label,pro.trial_days?translateUI(" after a {0}-day free trial",[pro.trial_days]):'']) : translateUI("Listings are for subscribers. {0}",[pro.note||'']);
      $('#freeline').innerHTML = pro.price!=null ? (pro.trial_days?uiHTML`<b>Try Pro free for ${pro.trial_days} days</b>, then ${esc(pro.price_label)} a month.`:uiHTML`<b>Pro is ${esc(pro.price_label)} a month.</b>`)+translateUI(' Cancel any time.') : ''; return; }
    $('#faqPrice').textContent = pro.price!=null ? translateUI("Searching and saving are free. Pro is {0} a month after a 7-day first trial, and unlocks application and source links. Email alerts are coming later.",[pro.price_label]) : translateUI("Searching and saving are free. Pro unlocks application and source links. Email alerts are coming later. {0}",[pro.note||'']);
    $('#freeline').innerHTML = uiHTML`<b>Free to search.</b> No account needed.${pro.price!=null?translateUI(" Pro from {0} a month when you’re ready to apply.",[esc(pro.price_label)]):''}`;
  }catch(x){}
}

$('#bDraft').innerHTML=FP.ui.draftNote('the board shows real listings from sample data (UK checked Jul–Aug 2026, US batch of 9 Sep 2026).');
applyLocale(M[cur]?cur:'GB');
if(!LIVE && !BOARD[cur] && dataMarkets[0]) renderBoard(dataMarkets[0].code);
})();
