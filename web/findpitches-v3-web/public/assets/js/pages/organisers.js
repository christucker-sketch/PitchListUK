// Page script for organisers.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const translateUI=FP.i18n.tr, uiHTML=FP.i18n.html;
  const U=FP.ui, {esc,fmt,when,card,toast,modal,fieldError,requireSignIn,signIn,upgrade,describeQuery,units,qs,days,cap,SELLS,TYPE_PLURAL} = U;
  const api=FP.api, R=FP.routes, track=FP.track; await FP.ready; const st=FP.state; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function gate(el, title, text, btn){ el.innerHTML=uiHTML`<div class="gate"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-turf" type="button" id="gSign">${esc(btn||translateUI('Sign in or create a free account'))}</button><p class="muted" style="font-size:.84rem;margin-top:12px">We email you a sign-in link. No password.</p></div>`; $('#gSign').onclick=()=>signIn().then(()=>location.reload()); }

  $('#ofNote').innerHTML=FP.ui.draftNote('submissions are saved in this browser only. Nothing is sent.');
  const LBL={event_name:translateUI('Event name'),organiser_name:translateUI('Organiser'),email:translateUI('Contact email'),market:translateUI('Country or region'),location:translateUI('Venue and location'),application_url:translateUI('Where traders apply'),start:translateUI('First trading day'),end:translateUI('Last trading day')};
  $('#market').innerHTML+=st.markets.map(c=>uiHTML`<option value="${c.code}" ${c.code===st.market?'selected':''}>${esc(c.name)}</option>`).join('');
  const sym=m=>new Intl.NumberFormat(m.locale,{style:'currency',currency:m.currency,maximumFractionDigits:0}).format(45);
  function setMarket(){ const m=st.m($('#market').value||st.market); $('#location').placeholder = m.postal.kind==='district' ? translateUI('Venue name and district') : translateUI("Venue name and {0}",[m.postal.label_mid]); $('#feeL').innerHTML=esc(cap(m.vocab.fee))+uiHTML(' <span class="muted">(optional)</span>'); $('#fee').placeholder=translateUI("e.g. {0} a day",[sym(m)]); }
  setMarket(); $('#market').onchange=setMarket;
  $('#of').onsubmit=async e=>{ e.preventDefault();
    const ids=['event_name','organiser_name','email','market','location','start','end','application_url','fee','deadline','notes']; const form={}; ids.forEach(k=>form[k]=$('#'+k).value.trim());
    form.categories=[...document.querySelectorAll('input[name=cats]:checked')].map(i=>i.value);
    ids.forEach(k=>fieldError($('#'+k),null)); $('#ofErr').innerHTML='';
    const bad={};
    ['event_name','organiser_name','email','market','location','application_url'].forEach(k=>{ if(!form[k]) bad[k]=translateUI("Enter {0}",[LBL[k].toLowerCase()]); });
    if(form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) bad.email='Enter an email address like name@example.com';
    if(form.application_url && !/^https?:\/\/[^\s.]+\.[^\s]+/.test(form.application_url)) bad.application_url='Enter a full web address starting with https://';
    if(form.start && form.end && form.end<form.start) bad.end=translateUI('The last trading day can’t be before the first');
    if(form.market==='' ) bad.market=translateUI('Choose a country or region');
    const keys=Object.keys(bad);
    if(keys.length){ $('#ofErr').innerHTML=uiHTML`<div class="notice warn" style="margin-top:14px"><div><b>${keys.length===1?translateUI('There’s a problem'):translateUI('There are ')+keys.length+' problems'} with the form</b><ul style="margin:6px 0 0;padding-left:18px">${keys.map(k=>uiHTML`<li><a href="#${k}">${esc(bad[k])}</a></li>`).join('')}</ul></div></div>`;
      keys.slice().reverse().forEach(k=>fieldError($('#'+k),bad[k])); return; }
    try{ const r=await api.organisers.submitListing(form); track('organiser_submitted',{market:form.market});
      $('#of').innerHTML=uiHTML`<h2 class="display" style="font-size:1.3rem" tabindex="-1" id="ofDone">Thanks, we’ve got it.</h2><p>Your reference is <b>${esc(r.reference)}</b>. ${FP.api.live?translateUI("We’ll review “{0}” against your own page and email {1} if we have questions.",[esc(form.event_name),esc(form.email)]):translateUI("We’ll check “{0}” against your own page, then email {1} when it’s live.",[esc(form.event_name),esc(form.email)])}</p>${FP.ui.draftNote('saved in this browser only. Nothing was sent.')}<a class="btn btn-line" href="organisers.html#submit">List another event</a>`; $('#ofDone').focus(); }
    catch(x){ $('#ofErr').innerHTML=uiHTML`<p class="notice warn" style="margin-top:14px">${esc(x.message)}</p>`; } };
  $('#talk').onclick=()=>modal(uiHTML`<div class="dh"><h2>Talk to us about partnerships</h2><button class="x" data-close aria-label="Close">×</button></div><form id="tk" novalidate style="display:grid;gap:12px">
    <div class="field"><label for="tkN">Organisation</label><input class="input" id="tkN" autocomplete="organization"></div><div class="field"><label for="tkE">Email</label><input class="input" id="tkE" type="email" autocomplete="email"></div>
    <div class="field"><label for="tkM">What would you like to do?</label><textarea class="textarea" id="tkM"></textarea></div><button class="btn btn-turf" type="submit">Send</button>${FP.ui.draftNote('nothing is sent.')}</form>`,{onOpen(m,close){ m.querySelector('#tk').onsubmit=e=>{ e.preventDefault(); const em=m.querySelector('#tkE'); if(!/.+@.+\..+/.test(em.value)) return fieldError(em,'Enter an email address like name@example.com'); if(!FP.api.live){ close(); toast('Thanks. We’ll be in touch (simulated).'); return; }
      FP.api.organisers.contact({organisation:m.querySelector('#tkN').value.trim(),email:em.value.trim(),message:m.querySelector('#tkM').value.trim()})
        .then(()=>{ close(); toast(translateUI('Thanks. We’ll be in touch.')); })
        .catch(x=>fieldError(m.querySelector('#tkM'), x.status===400?translateUI('Tell us a little about what you’d like to do'):(x.message||translateUI('That didn’t send. Please try again.')))); }; }});

})();
