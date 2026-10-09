// Page script for organisers.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const U=FP.ui, {esc,fmt,when,card,toast,modal,fieldError,requireSignIn,signIn,upgrade,describeQuery,units,qs,days,cap,SELLS,TYPE_PLURAL} = U;
  const api=FP.api, R=FP.routes, track=FP.track; await FP.ready; const st=FP.state; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function gate(el, title, text, btn){ el.innerHTML=`<div class="gate"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-turf" type="button" id="gSign">${esc(btn||'Sign in or create a free account')}</button><p class="muted" style="font-size:.84rem;margin-top:12px">We email you a sign-in link. No password.</p></div>`; $('#gSign').onclick=()=>signIn().then(()=>location.reload()); }

  $('#ofNote').innerHTML=FP.ui.draftNote('submissions are saved in this browser only. Nothing is sent.');
  const LBL={event_name:'Event name',organiser_name:'Organiser',email:'Contact email',market:'Country or region',location:'Venue and location',application_url:'Where traders apply',start:'First trading day',end:'Last trading day'};
  $('#market').innerHTML+=st.markets.map(c=>`<option value="${c.code}" ${c.code===st.market?'selected':''}>${esc(c.name)}</option>`).join('');
  const sym=m=>new Intl.NumberFormat(m.locale,{style:'currency',currency:m.currency,maximumFractionDigits:0}).format(45);
  function setMarket(){ const m=st.m($('#market').value||st.market); $('#location').placeholder = m.postal.kind==='district' ? 'Venue name and district' : `Venue name and ${m.postal.label_mid}`; $('#feeL').innerHTML=esc(cap(m.vocab.fee))+' <span class="muted">(optional)</span>'; $('#fee').placeholder=`e.g. ${sym(m)} a day`; }
  setMarket(); $('#market').onchange=setMarket;
  $('#of').onsubmit=async e=>{ e.preventDefault();
    const ids=['event_name','organiser_name','email','market','location','start','end','application_url','fee','deadline','notes']; const form={}; ids.forEach(k=>form[k]=$('#'+k).value.trim());
    form.categories=[...document.querySelectorAll('input[name=cats]:checked')].map(i=>i.value);
    ids.forEach(k=>fieldError($('#'+k),null)); $('#ofErr').innerHTML='';
    const bad={};
    ['event_name','organiser_name','email','market','location','application_url'].forEach(k=>{ if(!form[k]) bad[k]=`Enter ${LBL[k].toLowerCase()}`; });
    if(form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) bad.email='Enter an email address like name@example.com';
    if(form.application_url && !/^https?:\/\/[^\s.]+\.[^\s]+/.test(form.application_url)) bad.application_url='Enter a full web address starting with https://';
    if(form.start && form.end && form.end<form.start) bad.end='The last trading day can’t be before the first';
    if(form.market==='' ) bad.market='Choose a country or region';
    const keys=Object.keys(bad);
    if(keys.length){ $('#ofErr').innerHTML=`<div class="notice warn" style="margin-top:14px"><div><b>${keys.length===1?'There’s a problem':'There are '+keys.length+' problems'} with the form</b><ul style="margin:6px 0 0;padding-left:18px">${keys.map(k=>`<li><a href="#${k}">${esc(bad[k])}</a></li>`).join('')}</ul></div></div>`;
      keys.slice().reverse().forEach(k=>fieldError($('#'+k),bad[k])); return; }
    try{ const r=await api.organisers.submitListing(form); track('organiser_submitted',{market:form.market});
      $('#of').innerHTML=`<h2 class="display" style="font-size:1.3rem" tabindex="-1" id="ofDone">Thanks, we’ve got it.</h2><p>Your reference is <b>${esc(r.reference)}</b>. ${FP.api.live?`We’ll review “${esc(form.event_name)}” against your own page and email ${esc(form.email)} if we have questions.`:`We’ll check “${esc(form.event_name)}” against your own page, then email ${esc(form.email)} when it’s live.`}</p>${FP.ui.draftNote('saved in this browser only. Nothing was sent.')}<a class="btn btn-line" href="organisers.html#submit">List another event</a>`; $('#ofDone').focus(); }
    catch(x){ $('#ofErr').innerHTML=`<p class="notice warn" style="margin-top:14px">${esc(x.message)}</p>`; } };
  $('#talk').onclick=()=>modal(`<div class="dh"><h2>Talk to us about partnerships</h2><button class="x" data-close aria-label="Close">×</button></div><form id="tk" novalidate style="display:grid;gap:12px">
    <div class="field"><label for="tkN">Organisation</label><input class="input" id="tkN" autocomplete="organization"></div><div class="field"><label for="tkE">Email</label><input class="input" id="tkE" type="email" autocomplete="email"></div>
    <div class="field"><label for="tkM">What would you like to do?</label><textarea class="textarea" id="tkM"></textarea></div><button class="btn btn-turf" type="submit">Send</button>${FP.ui.draftNote('nothing is sent.')}</form>`,{onOpen(m,close){ m.querySelector('#tk').onsubmit=e=>{ e.preventDefault(); const em=m.querySelector('#tkE'); if(!/.+@.+\..+/.test(em.value)) return fieldError(em,'Enter an email address like name@example.com'); if(!FP.api.live){ close(); toast('Thanks. We’ll be in touch (simulated).'); return; }
      FP.api.organisers.contact({organisation:m.querySelector('#tkN').value.trim(),email:em.value.trim(),message:m.querySelector('#tkM').value.trim()})
        .then(()=>{ close(); toast('Thanks. We’ll be in touch.'); })
        .catch(x=>fieldError(m.querySelector('#tkM'), x.status===400?'Tell us a little about what you’d like to do':(x.message||'That didn’t send. Please try again.'))); }; }});

})();
