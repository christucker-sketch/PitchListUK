// Page script for opportunity.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const U=FP.ui, {esc,fmt,when,freshness,card,toast,modal,factsHTML,applyPanel,appStatus,createAlert,qs,cap} = U; const R=FP.routes;
  const api=FP.api, G=window.FP_GEO; await FP.ready;
  const id=qs.get('id'); const P=document.getElementById('page');
  let o; try{ if(!id) throw Object.assign(new Error('missing'),{status:404}); o = await api.opportunities.get(id); }catch(e){
    // Access is decided on the server; these messages only explain what happened.
    const gate = {
      401: ['Sign in to see this listing', 'Listings are for FindPitches subscribers. Sign in, or create your account with just your email.', '<button class="btn btn-turf" type="button" id="gSign">Sign in</button> <a class="btn btn-line" href="pricing.html">See plans</a>'],
      402: e.code==='subscription_expired'
        ? ['Your subscription has ended', 'Renew to see full listings again.', '<a class="btn btn-flag" href="pricing.html?from=listing_expired">Renew</a>']
        : ['Subscribe to see this listing', 'A Pro subscription unlocks every checked listing, full details and where to apply.', '<a class="btn btn-flag" href="pricing.html?from=listing">See plans</a>'],
      404: ['We couldn’t find that listing', 'It may have closed or been removed after a recheck, or the link is incomplete.', '<a class="btn btn-turf" href="finder.html">Search pitches</a>']
    }[e.status] || ['This listing is temporarily unavailable', 'Please try again in a moment.', '<button class="btn btn-turf" type="button" data-reload>Try again</button>'];
    document.title=`${gate[0]} | FindPitches`;
    P.innerHTML=`<div class="wrap section"><div class="gate" style="max-width:640px"><h1 class="display" style="font-size:1.6rem;margin-bottom:10px">${gate[0]}</h1><p>${gate[1]}</p>${gate[2]}</div></div>`;
    const b=document.getElementById('gSign'); if(b) b.onclick=()=>U.signIn('Sign in to see full listings.');
    return; }
  const cc=o.market, C=FP.state.m(cc), st=FP.state, sp=o.type==='sport', f=freshness(o,cc), on=st.saved.has(o.id), as=appStatus(o,cc);
  document.title=`${o.title} | ${cap(C.vocab.apps)} | FindPitches`;
  const canon=document.createElement('link'); canon.rel='canonical'; canon.href=R.abs(o.canonical_path); document.head.appendChild(canon);
  FP.track('opportunity_opened',{id:o.id,market:cc,from:'page',locked:o.access.locked});
  const region=o.location.region_name || '';
  const crumbs=[['Home','index.html',R.SITE+'/'],[C.name,R.draft.seo(R.marketPath(cc)),R.abs(R.marketPath(cc))]].concat((o.region_path||[]).map(rg=>[rg.name,R.draft.seo(R.marketPath(cc)+rg.slug+'/'),R.abs(R.marketPath(cc)+rg.slug+'/')]));

    // Phones: put the apply action next to the title so it isn't below the fold. Same handlers as the main panel.
  const mcta = as.cls==='ended' ? '' : !o.access.locked ? (o.access.application_url?`<a class="btn btn-turf" href="${esc(o.access.application_url)}" target="_blank" rel="noopener" data-apply="${esc(o.id)}">Apply on the organiser’s site<span class="sr"> (opens in a new tab)</span> ↗</a>`:'')
    : st.proIn(cc) ? `<button type="button" class="btn btn-flag" data-unlock="apply" data-for-market="${esc(cc)}">See where to apply</button>` : '';
  P.innerHTML=`
  <section class="phead ohead"><div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n,h],i)=>i?`<span><a href="${h}">${esc(n)}</a></span>`:`<a href="${h}">${esc(n)}</a>`).join('')}<span aria-current="page">${esc(o.title)}</span></nav>
    <div class="tags"><span class="ty ${sp?'sport':''}">${esc(o.type_label)}</span>${as.short?`<span class="status ${as.cls}"><i aria-hidden="true"></i>${esc(as.short)}</span>`:''}<span class="fresh ${f.cls}"><i aria-hidden="true"></i>${esc(f.long)}</span></div>
    <h1>${esc(o.title)}</h1>
    <p class="where">${esc(o.location.label)} · ${esc(when(o,cc))}</p>
    ${mcta?`<div class="m-cta">${mcta}</div>`:''}
    ${as.cls==='ended'?`<div class="notice warn" style="margin-top:16px">This event has finished. We keep the listing so you can plan for next time. Similar listings that are still open are below.</div>`:''}
  </div></section>
  <div class="wrap section o-main"><div class="olay">
    <section class="o-facts" aria-labelledby="glance"><h2 id="glance" class="sr">At a glance</h2>${factsHTML(o,{cols:3})}</section>
    <aside class="side" aria-label="Apply and save">
      <div class="act">${applyPanel(o)}
        <div class="row2"><button class="btn btn-line" type="button" data-save="${esc(o.id)}" aria-pressed="${on}">${on?'★ Saved':'☆ Save'}</button><button class="btn btn-line" type="button" id="share">Copy link</button></div>
        <button class="btn btn-line" type="button" id="alertSim">Alert me to similar listings</button>
      </div>
      <figure class="minimap" style="margin:0"><svg id="mm" role="img" aria-label="Map showing ${esc(o.location.label)}"></svg><figcaption class="cap" id="mmcap"></figcaption></figure>
    </aside>
    <div class="o-rest">
      ${o.notes?`<div class="block"><h2>About this opportunity</h2><p class="note">${esc(o.notes)}</p></div>`:''}
      <div class="block"><h2>What we checked</h2><ul class="ledger">
        <li><span class="ic" aria-hidden="true">✓</span><span>Found on a public listing${o.organiser.name?' for '+esc(o.organiser.name):''}<br><small>${o.access.locked?`On a ${esc(o.access.source_domain_hint||'web')} site. The address is shown with Pro.`:esc(o.access.source_domain||'Source recorded')}</small></span></li>
        ${o.dates.start?`<li><span class="ic" aria-hidden="true">✓</span><span>Dates taken from that listing<br><small>${esc(when(o,cc))}</small></span></li>`:`<li><span class="ic lock" aria-hidden="true">?</span><span>No dates recorded yet<br><small>Check the listing for the latest dates.</small></span></li>`}
        <li><span class="ic" aria-hidden="true">✓</span><span>${esc(f.long)}<br><small>We recheck listings regularly and remove ones that close or disappear.</small></span></li>
        <li><span class="ic ${o.access.locked?'lock':''}" aria-hidden="true">${o.access.locked?'•':'✓'}</span><span>Application route ${o.access.locked?'recorded (shown with Pro)':o.access.application_url?'checked':'not published by the organiser'}<br><small>We never take applications ourselves or guarantee a place.</small></span></li>
      </ul></div>
      <div class="block"><h2>Something wrong?</h2><p class="muted" style="margin:0 0 10px">If the dates, place or application details have changed, tell us and we’ll recheck the listing.</p><button class="btn btn-line btn-sm" type="button" id="report">Report a problem</button></div>
      <div class="block">${o.similar.length?`<h2>${o.location.precision==='place'?'Similar listings nearby':'Similar listings in '+esc(region||C.name)}</h2><div class="sim" id="sim">${o.similar.map(x=>card(x)).join('')}</div>`:''}
        <p style="margin:14px 0 0"><a href="${R.draft.finder(cc,{type:o.type})}">See all ${esc(U.typePluralLc(o.type))} in ${esc(C.the)} →</a></p></div>
      ${o.source_title&&o.source_title!==o.title?`<p class="meta" style="margin-top:28px">Organiser’s title: “${esc(o.source_title)}”</p>`:''}
    </div>
  </div></div>`;

  /* mini map (presentation asset per market; none for markets without an outline) */
  const mm=document.getElementById('mm'), capEl=document.getElementById('mmcap');
  if(G.uk && cc==='GB'){ const M=G.uk; if(o.location.lat!=null){ const p=o.location.lat*Math.PI/180, x=M.k*o.location.lng*Math.PI/180+M.tx, y=M.ty-M.k*Math.log(Math.tan(Math.PI/4+p/2)); const w=160, z=M.W/w; mm.setAttribute('viewBox',`${x-w/2} ${y-w*0.35} ${w} ${w*0.7}`);
      mm.innerHTML=`<path class="land" d="${M.svg}" style="stroke-width:${1/z}px"/><circle class="pinbig" cx="${x}" cy="${y}" r="3.6" stroke-width="1"/>`; capEl.textContent=o.location.precision==='place'?'Pinned at the checked location.':`Approximate: this listing covers ${o.location.region_name||'the area'}.`; }
    else mm.closest('figure').remove(); /* no location recorded: show nothing rather than a whole-country map */ }
  else if (G.us && cc==='US'){ const M=G.us; mm.setAttribute('viewBox',`0 0 ${M.W} ${M.H}`); mm.innerHTML=Object.entries(M.states).map(([ab,s])=>`<path class="st ${ab===o.location.region_code?'sel':''}" d="${s.d}"/>`).join(''); capEl.innerHTML=`${esc(o.location.region_name||o.location.label)} is highlighted. The exact site is on the organiser’s listing.`+FP.ui.draftNote('US listings aren’t geocoded yet, so only the state is shown.'); }
  else mm.closest('figure').remove();

  /* Structured data: conservative. Event only when a start date exists; nothing inferred (no status, offers, images or times).
     BreadcrumbList mirrors the visible breadcrumb. The production site should render these server-side. */
  const ld=[{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":crumbs.concat([[o.title,null,R.abs(o.canonical_path)]]).map(([n,,u],i)=>({"@type":"ListItem","position":i+1,"name":n,"item":u}))}];
  if(o.dates.start){ const ev={"@context":"https://schema.org","@type":"Event","name":o.title,"startDate":o.dates.start,"url":R.abs(o.canonical_path),"location":{"@type":"Place","name":o.location.label,"address":o.location.label}};
    if(o.dates.end) ev.endDate=o.dates.end; if(o.organiser.name) ev.organizer={"@type":"Organization","name":o.organiser.name}; ld.push(ev); }
  ld.forEach(x=>{ const s=document.createElement('script'); s.type='application/ld+json'; s.textContent=JSON.stringify(x); document.head.appendChild(s); });

  document.getElementById('share').onclick=async()=>{ const u=R.abs(o.canonical_path); try{ await navigator.clipboard.writeText(u); toast('Link copied'); }catch(e){ toast('Copy this link: '+u); } };
  const alertBtn=document.getElementById('alertSim'); if(alertBtn) alertBtn.onclick=()=>createAlert({market:cc,q:o.location.region_id||'',types:[o.type]},{placeLabel:o.location.region_name||C.name});
  document.getElementById('report').onclick=()=>modal(`<div class="dh"><h2>Report a problem</h2><button class="x" data-close aria-label="Close">×</button></div>
    <form id="rp" novalidate style="display:grid;gap:12px"><div class="field"><label for="rpR">What’s wrong?</label><select class="select" id="rpR"><option value="dates_changed">The dates have changed</option><option value="closed">Applications have closed</option><option value="link_broken">The link doesn’t work</option><option value="wrong_place">The location is wrong</option><option value="cancelled">The event is cancelled</option><option value="other">Something else</option></select></div>
    <div class="field"><label for="rpN">Anything else? <span class="muted">(optional)</span></label><textarea class="textarea" id="rpN"></textarea></div><button class="btn btn-turf" type="submit">Send report</button>
    ${api.live?'':FP.ui.draftNote('saved in this browser only.')}</form>`,{onOpen(m,close){ m.querySelector('#rp').onsubmit=async e=>{ e.preventDefault(); const r=await api.feedback.report({opportunity_id:o.id,reason:m.querySelector('#rpR').value,note:m.querySelector('#rpN').value}); close(); FP.track('report_submitted',{id:o.id}); toast(`Thanks. Reference ${r.reference}: we’ll recheck this listing.`); }; }});
  document.addEventListener('fp:session',()=>location.reload());
})();
