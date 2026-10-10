// Page script for alerts.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const U=FP.ui, {esc,fmt,when,card,toast,modal,fieldError,requireSignIn,signIn,upgrade,describeQuery,units,qs,days,cap,SELLS,TYPE_PLURAL} = U;
  const api=FP.api, R=FP.routes, track=FP.track; await FP.ready; const st=FP.state; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function gate(el, title, text, btn){ el.innerHTML=`<div class="gate"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-turf" type="button" id="gSign">${esc(btn||'Sign in or create a free account')}</button><p class="muted" style="font-size:.84rem;margin-top:12px">We email you a sign-in link. No password.</p></div>`; $('#gSign').onclick=()=>signIn().then(()=>location.reload()); }

  const A=$('#al'), T=api.meta.types();
  const FREQ={instant:'As soon as one appears',daily:'Daily summary',weekly:'Weekly summary'};
  // Alerts need backend matching and email sending, which don't exist yet. Say so rather than pretend.
  if(!st.session.signed_in) return gate(A,'Sign in to manage alerts','Alerts email you new checked listings that match what you’re looking for, so you hear about them first.');
  if(!st.entitled){ const m=st.m(); track('upgrade_viewed',{context:'alerts_page'});
    A.innerHTML=`<div class="gate"><h2>Alerts are part of Pro</h2><p>Set up alerts like these and we’ll email you as soon as a matching listing is checked:</p>
      <ul class="examples"><li>${esc(describeQuery({market:m.code,sells:'food',radius_km:m.search.radius?units.toKm(m.radius_options[1],m.distance_unit):undefined},m.postal.kind==='district'?'Wan Chai':m.code==='GB'?'Maidstone':m.code==='US'?'Dallas':'your area'))}</li><li>${esc(describeQuery({market:m.code,types:[m.code==='US'?'holiday_market':'christmas_market']}))}</li></ul>
      <a class="btn btn-flag" href="pricing.html">${U.proActionLabel()}</a></div>`; return; }

  const liveMarkets = st.markets.filter(m=>m.launch_status==='live');
  function nearestOpt(m, km){ if(km==null) return 'any'; const v=units.fromKm(+km,m.distance_unit); return String(m.radius_options.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a)); }
  function finderLink(q){ const m=st.m(q.market), p={}; if(q.q) p.q=q.q; if(q.types&&q.types.length) p.type=q.types.join(','); if(q.sells) p.sells=q.sells; if(q.when) p.when=q.when; if(m.search.radius) p.radius=nearestOpt(m,q.radius_km); return R.draft.finder(q.market,p); }

  // Create / edit an alert. Radius is shown in the market's unit and stored as radius_km.
  function editor(a){
    const q=(a&&a.query)||{market:liveMarkets.some(m=>m.code===st.market)?st.market:'GB'};
    modal(`<div class="dh"><h2>${a?'Edit alert':'New alert'}</h2><button class="x" data-close aria-label="Close">×</button></div>
      <form id="ed" class="ed" novalidate>
        <div class="field"><label for="eM">Country or region</label><select class="select" id="eM">${liveMarkets.map(m=>`<option value="${m.code}">${esc(m.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="eQ" id="eQl">Where</label><input class="input" id="eQ" value="${esc(q.q||'')}"></div>
        <div class="field" id="eRf"><label for="eR">Within</label><select class="select" id="eR"></select></div>
        <div class="field"><label for="eT">Type of event</label><select class="select" id="eT"><option value="">Any type</option>${Object.entries(T).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <div class="field"><label for="eS">What you sell</label><select class="select" id="eS"><option value="">Anything</option><option value="food">Street food &amp; catering</option><option value="craft">Crafts &amp; makers</option><option value="market">Produce &amp; market goods</option><option value="general">General retail</option></select></div>
        <div class="field"><label for="eW">When</label><select class="select" id="eW"><option value="">Any time</option><option value="30">Next 30 days</option><option value="90">Next 3 months</option><option value="xmas">Christmas season</option><option value="2027">2027 season</option></select></div>
        <div class="field"><label for="eF">How often</label><select class="select" id="eF">${Object.entries(FREQ).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
        <p class="alertdesc full" id="ePrev" aria-live="polite" style="margin:4px 0 0"></p>
        <button class="btn btn-turf full" type="submit">${a?'Save changes':'Create alert'}</button></form>`,{onOpen(m,close){
      const g=s=>m.querySelector(s);
      g('#eM').value=q.market; g('#eT').value=(q.types||[])[0]||''; g('#eS').value=q.sells||''; g('#eW').value=q.when||''; g('#eF').value=(a&&a.frequency)||'weekly';
      function setMarket(){ const mk=st.m(g('#eM').value); g('#eQl').textContent=mk.postal.kind==='district'?'District or place':mk.search.radius?`${mk.postal.label} or town`:`${mk.postal.label} or ${mk.region_label.singular}`; g('#eQ').placeholder='e.g. '+mk.postal.example;
        g('#eRf').hidden=!mk.search.radius; g('#eR').innerHTML=mk.radius_options.map(v=>`<option value="${v}">${v} ${units.word(mk.distance_unit,v)}</option>`).join('')+`<option value="any">Anywhere</option>`; g('#eR').value=nearestOpt(mk,q.radius_km); }
      const read=()=>{ const mk=st.m(g('#eM').value), r=g('#eR').value; return { market:mk.code, q:g('#eQ').value.trim(), radius_km: mk.search.radius && g('#eQ').value.trim() && r!=='any' ? Math.round(units.toKm(+r,mk.distance_unit)*10)/10 : undefined, types:g('#eT').value?[g('#eT').value]:[], sells:g('#eS').value||undefined, when:g('#eW').value||undefined }; };
      const prev=()=>{ const r=read(); g('#ePrev').textContent=describeQuery(r, r.q ? r.q.toUpperCase().length<=8&&/\d/.test(r.q)?r.q.toUpperCase():cap(r.q) : null); };
      setMarket(); prev(); g('#eM').onchange=()=>{ setMarket(); prev(); }; m.querySelector('form').addEventListener('input',prev); m.querySelector('form').addEventListener('change',prev);
      g('#ed').onsubmit=async e=>{ e.preventDefault(); const qq=read(), res=await api.geo.resolve({market:qq.market,q:qq.q});
        if(qq.q && res.kind==='unknown') return fieldError(g('#eQ'),`We don’t recognise “${qq.q}”. Try a ${st.m(qq.market).postal.label_mid} like ${st.m(qq.market).postal.example}.`);
        fieldError(g('#eQ'),null); if(res.label) qq.place_label=res.label; const name=describeQuery(qq,res.label);
        try{ if(a){ await api.alerts.update(a.id,{query:qq,name,frequency:g('#eF').value}); track('alert_updated',{id:a.id}); toast('Alert updated'); } else { await api.alerts.create({query:qq,name,frequency:g('#eF').value}); track('alert_created',{market:qq.market,frequency:g('#eF').value}); toast('Alert created: '+name); }
          close(); render(); }catch(x){ toast(x.message); } };
    }});
  }

  async function render(){
    let list; try{ list=await api.alerts.list(); }catch(e){ A.innerHTML=`<div class="notice warn" role="alert">We couldn’t load your alerts. ${esc(e.message)}</div>`; return; }
    A.innerHTML=`<div class="toolbar"><p style="margin:0" aria-live="polite"><b>${list.length}</b> ${list.length===1?'alert':'alerts'}${list.some(a=>a.paused)?` · ${list.filter(a=>a.paused).length} paused`:''}</p><div class="tb-r"><button class="btn btn-turf btn-sm" type="button" id="newAl">+ New alert</button></div></div>
      <div class="alist">${list.length?list.map(a=>{ const d=describeQuery(a.query,a.query.place_label); return `<article class="al ${a.paused?'paused':''}" data-al="${a.id}" aria-labelledby="h-${a.id}">
        <div class="top"><div><h3 id="h-${a.id}">${esc(d)}</h3><p class="meta">${a.paused?'<span class="status closed"><i aria-hidden="true"></i>Paused</span> ':'<span class="status open"><i aria-hidden="true"></i>On</span> '}${esc(FREQ[a.frequency]||a.frequency)}</p></div>
          <p class="meta" style="margin:0"><span class="n">${a.current_matches}</span> ${a.current_matches===1?'listing matches':'listings match'} now</p></div>
        <div class="ctl"><label class="sr" for="f-${a.id}">How often for: ${esc(d)}</label><select id="f-${a.id}" data-freq="${a.id}">${Object.entries(FREQ).map(([k,v])=>`<option value="${k}" ${a.frequency===k?'selected':''}>${v}</option>`).join('')}</select>
          <a class="btn btn-line btn-sm" href="${finderLink(a.query)}">See matches</a><button class="btn btn-line btn-sm" type="button" data-edit="${a.id}">Edit</button>
          <button class="btn btn-line btn-sm" type="button" data-pause="${a.id}" aria-pressed="${!!a.paused}">${a.paused?'Resume':'Pause'}</button><button class="btn btn-line btn-sm" type="button" data-del="${a.id}">Delete</button></div>
        ${a.sample.length?`<div class="sample">${a.sample.map(o=>card(o)).join('')}</div>`:'<p class="muted" style="margin:12px 0 0;font-size:.9rem">Nothing matches right now. We’ll email you when something does.</p>'}</article>`; }).join('')
      :'<div class="gate"><h2>No alerts yet</h2><p>Create one here, or use “Alert me” on any search in the Finder.</p></div>'}</div>
      ${FP.ui.draftNote('alerts are stored in this browser and no emails are sent.')}`;
    $('#newAl').onclick=()=>editor(null);
    A._list=list;
  }
  A.addEventListener('click',async e=>{ const d=e.target.closest('[data-del]'), p=e.target.closest('[data-pause]'), ed=e.target.closest('[data-edit]');
    if(ed) return editor(A._list.find(a=>a.id===ed.dataset.edit));
    if(d){ const a=A._list.find(x=>x.id===d.dataset.del); await api.alerts.remove(a.id); track('alert_deleted',{id:a.id}); await render(); $('#newAl').focus();
      toast('Alert deleted',{action:{label:'Undo',onClick:async()=>{ const n=await api.alerts.create({name:a.name,query:a.query,frequency:a.frequency}); if(a.paused) await api.alerts.update(n.id,{paused:true}); render(); toast('Alert restored'); }}}); }
    if(p){ const id=p.dataset.pause, paused=p.getAttribute('aria-pressed')!=='true'; await api.alerts.update(id,{paused}); track('alert_updated',{id,paused}); await render(); const b=document.querySelector(`[data-pause="${id}"]`); b&&b.focus(); toast(paused?'Alert paused. We won’t email you until you resume it.':'Alert resumed'); } });
  A.addEventListener('change',async e=>{ const f=e.target.closest('[data-freq]'); if(f){ await api.alerts.update(f.dataset.freq,{frequency:f.value}); track('alert_updated',{id:f.dataset.freq,frequency:f.value}); toast('We’ll now send: '+FREQ[f.value].toLowerCase()); await render(); const s=document.getElementById(f.id); s&&s.focus(); } });
  render();

})();
