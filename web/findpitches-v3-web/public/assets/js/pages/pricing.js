// Page script for pricing.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const U=FP.ui, {esc,fmt,when,card,toast,modal,fieldError,requireSignIn,signIn,upgrade,describeQuery,units,qs,days,cap,SELLS,TYPE_PLURAL} = U;
  const api=FP.api, R=FP.routes, track=FP.track; await FP.ready; const st=FP.state; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function gate(el, title, text, btn){ el.innerHTML=`<div class="gate"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-turf" type="button" id="gSign">${esc(btn||'Sign in or create a free account')}</button><p class="muted" style="font-size:.84rem;margin-top:12px">We email you a sign-in link. No password.</p></div>`; $('#gSign').onclick=()=>signIn().then(()=>location.reload()); }

  let pc = st.m().code;
  if (qs.get('checkout')==='cancelled') { $('#note').dataset.flash='Checkout was cancelled. You haven’t been charged.'; history.replaceState(null,'','pricing.html'); }
  track('upgrade_viewed',{context: qs.get('from')||'pricing_page', market: pc});
  $('#pcSel').innerHTML=st.markets.map(m=>`<option value="${m.code}">${esc(m.name)} (${esc(m.currency)})${m.launch_status==='live'?'':' · coming soon'}</option>`).join(''); $('#pcSel').value=pc; $('#pcSel').onchange=e=>{pc=e.target.value;render();};
  const startLabel = p => p.trial_days ? `Start ${p.trial_days}-day free trial` : 'Subscribe';
  async function render(){
    const plans=await api.billing.plans({market:pc}); const s=st.session, m=st.m(pc), a=s.access||{};
    const current = s.signed_in ? a.tier : null;
    const flash = $('#note').dataset.flash ? `<div class="notice info" style="max-width:900px;margin-bottom:18px" role="status">${esc($('#note').dataset.flash)}</div>` : '';
    $('#note').innerHTML = flash + (m.launch_status!=='live' ? `<div class="notice warn" style="max-width:900px;margin-bottom:18px">FindPitches isn’t open in ${esc(m.name)} yet, so there’s nothing to buy. <a href="${R.draft.finder(pc)}">Get notified when it opens</a>.</div>`
      : current==='trial' ? `<div class="notice info" style="max-width:900px;margin-bottom:18px" role="status">You’re on the Pro free trial: ${Math.max(0,days(a.trial_ends))} days left. <a href="account.html">Manage your plan</a></div>` : '');
    $('#plans').innerHTML=plans.map(p=>{
      const isPro=p.id!=='free', unpriced=p.price==null, live=m.launch_status==='live';
      const btn = isPro
        ? (st.entitled ? `<a class="btn btn-line" href="account.html">${current==='trial'?'You’re on the trial · Manage':'You’re on Pro · Manage'}</a>`
          : !live ? `<button class="btn btn-flag" type="button" disabled>Opens with ${esc(m.name)}</button>`
          : unpriced ? `<button class="btn btn-flag" type="button" disabled>Price being confirmed</button>`
          : `<button class="btn btn-flag" type="button" data-start="${p.id}">${startLabel(p)}</button>`)
        : (s.signed_in ? (false ? `` : `<a class="btn btn-line" href="finder.html">${current==='free'?'Your current plan · Search':'Always included'}</a>`) : `<button class="btn btn-line" type="button" id="freeSign">Create a free account</button>`);
      return `<article class="plan ${isPro?'pro':''}" aria-labelledby="pl-${p.id}">${isPro?'<span class="badge">Most traders choose Pro</span>':''}<h2 id="pl-${p.id}">${esc(p.name)}</h2>
        <p class="price">${unpriced?'<span style="font-size:2rem">To be confirmed</span>':esc(p.price_label)} ${p.interval&&!unpriced?`<small>/ ${p.interval}</small>`:''}</p>
        ${isPro?`<p class="muted" style="margin:0">${unpriced?esc(p.note||''):p.trial_days?`${p.trial_days}-day free trial, then ${esc(p.price_label)} a ${esc(p.interval||'month')}. Cancel any time.`:`${esc(p.price_label)} a ${esc(p.interval||'month')}. Cancel any time.`}</p>`:'<p class="muted" style="margin:0">No card. No time limit.</p>'}
        <ul>${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${btn}</article>`;}).join('');
    const fs=$('#freeSign'); if(fs) fs.onclick=()=>signIn('Create your free account with just your email.').then(()=>render());
    $$('[data-start]').forEach(b=>b.onclick=async()=>{ const s=await requireSignIn('Sign in or create a free account to start your trial.'); if(!s) return;
      if (st.entitled) return render();
      b.disabled=true; b.textContent='Opening secure checkout…';
      try{ const r=await api.billing.startCheckout({plan_id:b.dataset.start,market:pc}); track('checkout_started',{plan:b.dataset.start,market:pc}); location.href=r.checkout_url; }catch(e){ b.disabled=false; b.textContent=startLabel(plans.find(p=>p.id===b.dataset.start)||{}); toast(e.message); } });
  }
  document.addEventListener('fp:session',render);
  render();

})();
