// Page script for account.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const U=FP.ui, {esc,fmt,when,card,toast,modal,fieldError,requireSignIn,signIn,upgrade,describeQuery,units,qs,days,cap,SELLS,TYPE_PLURAL} = U;
  const api=FP.api, R=FP.routes, track=FP.track; await FP.ready; const st=FP.state; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function gate(el, title, text, btn){ el.innerHTML=`<div class="gate"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-turf" type="button" id="gSign">${esc(btn||'Sign in or create a free account')}</button><p class="muted" style="font-size:.84rem;margin-top:12px">We email you a sign-in link. No password.</p></div>`; $('#gSign').onclick=()=>signIn().then(()=>location.reload()); }

  const A=$('#acc'); let s=st.session;
  const expiredLink = qs.get('signin')==='expired';
  if (api.live && qs.get('signin')==='ok' && s.signed_in) toast('Signed in as '+s.user.email);
  // Back from Stripe Checkout: confirm with the server (which asks Stripe) before showing anything.
  let checkoutNote='', confirmed=false;
  if (api.live && s.signed_in && qs.get('checkout')==='success' && qs.get('session_id')) {
    try { await api.billing.confirmCheckout({session_id:qs.get('session_id')}); confirmed=true; s = st.session = await api.session.get(); U.renderHeader(); }
    catch(e){ checkoutNote=`<div class="notice warn" role="status" style="margin-bottom:18px">We couldn’t confirm your payment yet. If you completed checkout, your access will appear within a few minutes. ${esc(e.message||'')}</div>`; }
    history.replaceState(null,'','account.html');
  }
  if(!s.signed_in) { gate(A, expiredLink?'That sign-in link has expired':'Sign in to see your account', expiredLink?'Sign-in links work once and expire after 20 minutes. Request a new one.':'Your saved listings and plan live here.'); return; }
  const u=s.user, a=s.access, C=st.m(u.market||st.market);
  const tierLabel={free:'Free',trial:'Pro trial',pro:'Pro'}[a.tier];
  const pm=st.m(a.market||C.code); let price='';
  if(a.tier!=='free'){ try{ const pl=(await api.billing.plans({market:pm.code})).find(p=>p.id==='pro_monthly'); price=pl.price!=null?`${pl.price_label} / month`:'To be confirmed'; }catch(e){ price='—'; } }
  const d=iso=>esc(fmt(iso,C.code,{day:'numeric',month:'long',year:'numeric'}));
  const welcome = confirmed && a.tier!=='free';
  const welcomeHead = a.tier==='trial' ? 'You’re on Pro. Your free trial has started.' : 'You’re on Pro.';
  const welcomeBody = 'Where to apply is now shown on every listing, and you can set up alerts.';
  A.innerHTML=`${checkoutNote}${welcome?`<div class="welcome" role="status"><div><b style="font-size:1.1rem">${welcomeHead}</b><p>${welcomeBody}</p></div><a class="btn" href="finder.html" style="background:#fff;color:var(--turf)">Start searching</a></div>`:''}
  <div class="agrid">
    <form class="card" id="prof" novalidate aria-labelledby="profH"><h2 id="profH">Your details</h2>
      <p class="muted" style="margin:-6px 0 16px;font-size:.9rem">Used to show you the most relevant listings first. Only you can see this.</p>
      <div class="form">
        <div class="field"><label for="pBiz">Business name</label><input class="input" id="pBiz" autocomplete="organization" value="${esc(u.business_name||'')}"></div>
        <div class="field"><label for="pName">Your name</label><input class="input" id="pName" autocomplete="name" value="${esc(u.contact_name||'')}"></div>
        <div class="field"><label for="pEmail">Email</label><input class="input" id="pEmail" value="${esc(u.email)}" readonly aria-describedby="pEmailH"><span class="hint" id="pEmailH">You sign in with this address.</span></div>
        <div class="field"><label for="pPhone">Phone <span class="muted">(optional)</span></label><input class="input" id="pPhone" type="tel" autocomplete="tel" value="${esc(u.phone||'')}"></div>
        <div class="field"><label for="pMkt">Where you trade</label><select class="select" id="pMkt">${st.markets.map(m=>`<option value="${m.code}">${esc(m.name)}${m.launch_status==='live'?'':' (coming soon)'}</option>`).join('')}</select></div>
        <div class="field"><label for="pPc" id="pPcL"></label><input class="input" id="pPc" value="${esc(u.base_postcode||'')}"></div>
        <div class="field"><label for="pSpec">What you sell</label><select class="select" id="pSpec"><option value="">Choose…</option><option value="food">Street food &amp; catering</option><option value="craft">Crafts &amp; makers</option><option value="market">Produce &amp; market goods</option><option value="general">General retail</option></select></div>
        <div class="field"><label for="pReg">Areas you’ll travel to <span class="muted">(optional)</span></label><input class="input" id="pReg" value="${esc(u.regions||'')}"></div>
        <label class="chk full"><input type="checkbox" id="pOpt" ${u.public_listing_opt_in?'checked':''}> <span>When it launches, let organisers find my business and invite me to apply. <span class="muted">You can change this any time.</span></span></label>
      </div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:18px"><button class="btn btn-turf" type="submit">Save details</button><span class="okmsg" id="pOk" role="status"></span></div>
    </form>
    <div style="display:grid;gap:22px">
      <section class="card" aria-labelledby="planH"><h2 id="planH">Plan &amp; billing</h2>
        <div class="sub-row"><span>Plan</span><b><span class="tier ${a.tier}">${tierLabel}</span></b></div>
        ${a.tier==='trial'?`<div class="sub-row"><span>Free trial ends</span><b>${d(a.trial_ends)} (${Math.max(0,days(a.trial_ends))} days left)</b></div>`:''}
        ${a.tier!=='free'?`<div class="sub-row"><span>${a.cancel_at_period_end?'Pro ends':a.tier==='trial'?'First payment':'Renews'}</span><b>${d(a.renews_on)}</b></div><div class="sub-row"><span>Price</span><b>${esc(price)}</b></div>`:''}
        ${a.cancel_at_period_end?`<p class="notice warn" style="margin:14px 0 0">Your plan won’t renew. You keep Pro until ${d(a.renews_on)}, then move to Free.</p>`:''}
        ${a.tier==='free'&&(a.status==='canceled'||a.status==='expired')?`<p class="muted">Your Pro plan has ended. Search and saving stay free.</p>`:''}
        ${a.tier==='free'&&a.billing_review_required?`<p class="notice warn">Your billing needs review before another subscription can be started. Your existing billing account is preserved.</p>`:''}
        ${a.tier==='free'?`<p class="muted" style="font-size:.92rem">Free lets you search every checked listing and save pitches. Pro adds where to apply and alerts.</p>`:''}
        <div style="display:grid;gap:8px;margin-top:16px">${a.tier==='free'&&a.checkout_allowed!==false?`<a class="btn btn-flag" href="pricing.html">${a.trial_eligible===false?'Subscribe to Pro':'Try Pro free for 7 days'}</a>`:''}${(a.has_billing_account||a.tier!=='free')?`<button class="btn btn-line" type="button" id="portal">Manage billing</button>`:''}</div>
      </section>
      <section class="card" aria-labelledby="qlH"><h2 id="qlH">Your lists</h2><div class="links"><a class="btn btn-line" href="saved.html">Saved pitches (${st.saved.size})</a><a class="btn btn-line" href="alerts.html">Alerts</a><button class="btn btn-line" type="button" id="so">Sign out</button></div></section>
    </div>
  </div>`;
  $('#pSpec').value=u.specialty||''; $('#pMkt').value=C.code;
  const setPc=()=>{ const m=st.m($('#pMkt').value); $('#pPcL').innerHTML=(m.postal.kind==='district'?'Your district':'Your '+esc(m.postal.label_mid))+' <span class="muted">(optional)</span>'; $('#pPc').placeholder='e.g. '+m.postal.example; $('#pReg').placeholder=m.code==='GB'?'e.g. Kent, Sussex, London':m.code==='US'?'e.g. Texas, Oklahoma':'e.g. the '+m.region_label.plural+' you cover'; };
  setPc(); $('#pMkt').onchange=setPc;
  $('#prof').onsubmit=async e=>{ e.preventDefault(); const mk=$('#pMkt').value;
    await api.session.updateProfile({business_name:$('#pBiz').value.trim(),contact_name:$('#pName').value.trim(),phone:$('#pPhone').value.trim(),market:mk,base_postcode:$('#pPc').value.trim(),specialty:$('#pSpec').value,regions:$('#pReg').value.trim(),public_listing_opt_in:$('#pOpt').checked});
    st.market=mk; st.session=await api.session.get(); U.renderHeader(); $('#pOk').textContent='✓ Saved'; setTimeout(()=>$('#pOk').textContent='',2500); };
  $('#so').onclick=async()=>{ await api.session.signOut(); track('signed_out'); location.href='index.html'; };
  const pt=$('#portal');
  if(pt && api.live) pt.onclick=async()=>{ pt.disabled=true; pt.textContent='Opening billing…';
    try{ location.href=await api.billing.portal(); }catch(e){ pt.disabled=false; pt.textContent='Manage billing'; toast(e.message||'Billing is unavailable right now.'); } };

})();
