// Page script for pricing.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const translateUI=FP.i18n.tr, uiHTML=FP.i18n.html;
  const U=FP.ui, {esc,fmt,when,card,toast,modal,fieldError,requireSignIn,signIn,upgrade,describeQuery,units,qs,days,cap,SELLS,TYPE_PLURAL} = U;
  const api=FP.api, R=FP.routes, track=FP.track; await FP.ready; const st=FP.state; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function gate(el, title, text, btn){ el.innerHTML=uiHTML`<div class="gate"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-turf" type="button" id="gSign">${esc(btn||translateUI('Sign in or create a free account'))}</button><p class="muted" style="font-size:.84rem;margin-top:12px">We email you a sign-in link. No password.</p></div>`; $('#gSign').onclick=()=>signIn().then(()=>location.reload()); }

  let pc = st.m().code;
  const globalPro=st.session?.capabilities?.public_mode===true;
  let currency=st.market==='US'?'USD':st.market==='IE'?'EUR':'GBP';
  let renderEpoch=0;
  if (qs.get('checkout')==='cancelled') { $('#note').dataset.flash=translateUI('Checkout was cancelled. You haven’t been charged.'); history.replaceState(null,'','pricing.html'); }
  track('upgrade_viewed',{context: qs.get('from')||'pricing_page', market: pc});
  if(globalPro){const label=document.querySelector('label[for=pcSel]');if(label)label.textContent=translateUI('Billing currency');$('#pcSel').innerHTML=['GBP','USD','EUR'].map(c=>uiHTML`<option value="${c}">${c}</option>`).join('');$('#pcSel').value=currency;$('#pcSel').onchange=e=>{currency=e.target.value;render();};}
  else $('#pcSel').innerHTML=st.markets.map(m=>uiHTML`<option value="${m.code}">${esc(m.name)} (${esc(m.currency)})${m.launch_status==='live'?'':translateUI(' · coming soon')}</option>`).join(''); if(!globalPro){$('#pcSel').value=pc; $('#pcSel').onchange=e=>{pc=e.target.value;render();};}
  const trialOffered = p => p.trial_days && st.session.access?.trial_eligible!==false;
  const startLabel = p => trialOffered(p) ? translateUI("Start {0}-day free trial",[p.trial_days]) : translateUI('Subscribe');
  async function render(){
    const epoch=++renderEpoch,priceMarket=pc,priceCurrency=currency;
    const plans=await api.billing.plans({market:priceMarket,...(globalPro?{currency:priceCurrency}:{})});if(epoch!==renderEpoch)return;const s=st.session, m=st.m(priceMarket), a=s.access||{};
    const current = s.signed_in ? a.tier : null;
    const flash = $('#note').dataset.flash ? uiHTML`<div class="notice info" style="max-width:900px;margin-bottom:18px" role="status">${esc($('#note').dataset.flash)}</div>` : '';
    $('#note').innerHTML = flash + (!globalPro&&m.launch_status!=='live' ? uiHTML`<div class="notice warn" style="max-width:900px;margin-bottom:18px">FindPitches isn’t open in ${esc(m.name)} yet, so there’s nothing to buy. <a href="${R.draft.finder(pc)}">Get notified when it opens</a>.</div>`
      : current==='trial' ? uiHTML`<div class="notice info" style="max-width:900px;margin-bottom:18px" role="status">You’re on the Pro free trial: ${Math.max(0,days(a.trial_ends))} days left. <a href="account.html">Manage your plan</a></div>` : '');
    $('#plans').innerHTML=plans.map(p=>{
      const isPro=p.id!=='free', unpriced=p.price==null, live=globalPro||m.launch_status==='live';
      const btn = isPro
        ? (st.entitled ? uiHTML`<a class="btn btn-line" href="account.html">${current==='trial'?translateUI('You’re on the trial · Manage'):translateUI('You’re on Pro · Manage')}</a>`
          : !live ? uiHTML`<button class="btn btn-flag" type="button" disabled>Opens with ${esc(m.name)}</button>`
          : p.checkout_enabled===false ? uiHTML`<button class="btn btn-flag" type="button" disabled>Checkout coming shortly</button>`
          : unpriced ? uiHTML`<button class="btn btn-flag" type="button" disabled>Price being confirmed</button>`
          : s.signed_in && a.checkout_allowed===false ? uiHTML`<a class="btn btn-line" href="account.html">${a.billing_review_required?translateUI('Review billing'):translateUI('Manage billing')}</a>`
          : uiHTML`<button class="btn btn-flag" type="button" data-start="${p.id}">${startLabel(p)}</button>`)
        : (s.signed_in ? (false ? `` : uiHTML`<a class="btn btn-line" href="finder.html">${current==='free'?translateUI('Your current plan · Search'):translateUI('Always included')}</a>`) : uiHTML`<button class="btn btn-line" type="button" id="freeSign">Create a free account</button>`);
      return uiHTML`<article class="plan ${isPro?'pro':''}" aria-labelledby="pl-${p.id}">${isPro?uiHTML('<span class="badge">Most traders choose Pro</span>'):''}<h2 id="pl-${p.id}">${esc(translateUI(p.name))}</h2>
        <p class="price">${unpriced?uiHTML('<span style="font-size:2rem">To be confirmed</span>'):esc(FP.i18n.money(p))} ${p.interval&&!unpriced?uiHTML`<small>/ ${translateUI(p.interval)}</small>`:''}</p>
        ${isPro?uiHTML`<p class="muted" style="margin:0">${unpriced?esc(translateUI(p.note||'')):trialOffered(p)?translateUI("{0}-day free trial, then {1} a {2}. Cancel any time.",[p.trial_days,esc(FP.i18n.money(p)),esc(translateUI(p.interval||'month'))]):translateUI("{0} a {1}. Cancel any time.",[esc(FP.i18n.money(p)),esc(translateUI(p.interval||'month'))])}</p>`:uiHTML('<p class="muted" style="margin:0">No card. No time limit.</p>')}
        <ul>${p.features.map(f=>uiHTML`<li>${esc(translateUI(f))}</li>`).join('')}</ul>${isPro&&p.note?uiHTML`<p class="muted">${esc(translateUI(p.note))}</p>`:''}${btn}</article>`;}).join('');
    const fs=$('#freeSign'); if(fs) fs.onclick=()=>signIn(translateUI('Create your free account with just your email.')).then(()=>render());
    $$('[data-start]').forEach(b=>b.onclick=async()=>{ const s=await requireSignIn(translateUI('Sign in or create a free account to continue.')); if(!s) return;
      if (st.entitled) return render();
      if (st.session.access?.checkout_allowed===false) return render();
      b.disabled=true; b.textContent=translateUI('Opening secure checkout…');
      try{ const r=await api.billing.startCheckout({plan_id:b.dataset.start,market:priceMarket,...(globalPro?{currency:priceCurrency}:{})}); track('checkout_started',{plan:b.dataset.start,market:priceMarket}); location.href=r.checkout_url; }catch(e){ b.disabled=false; b.textContent=startLabel(plans.find(p=>p.id===b.dataset.start)||{}); toast(e.message); } });
  }
  document.addEventListener('fp:session',render);
  render();

})();
