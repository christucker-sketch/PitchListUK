// Page script for saved.html (moved out of the HTML so the CSP can forbid inline scripts).
(async function(){
  const U=FP.ui, {esc,fmt,when,card,toast,modal,fieldError,requireSignIn,signIn,upgrade,describeQuery,units,qs,days,cap,SELLS,TYPE_PLURAL} = U;
  const api=FP.api, R=FP.routes, track=FP.track; await FP.ready; const st=FP.state; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function gate(el, title, text, btn){ el.innerHTML=`<div class="gate"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-turf" type="button" id="gSign">${esc(btn||'Sign in or create a free account')}</button><p class="muted" style="font-size:.84rem;margin-top:12px">We email you a sign-in link. No password.</p></div>`; $('#gSign').onclick=()=>signIn().then(()=>location.reload()); }

  const S=$('#sv');
  if(!st.session.signed_in) return gate(S,'Sign in to see your saved pitches','Tap the star on any listing to save it. Your shortlist then follows you to any device.');
  let sort = (()=>{ try{ return localStorage.getItem('fpdraft:ui:savedSort')||'date'; }catch(e){ return 'date'; } })();
  async function render(){
    let r; try { r=await api.saved.list(); } catch(e){ S.innerHTML=`<div class="notice warn" role="alert">We couldn’t load your saved pitches. ${esc(e.message)}</div>`; return; }
    if (r.locked) { S.innerHTML=`<div class="gate"><h2>Subscribe to see your saved listings</h2><p>You have ${r.saved_count} saved ${r.saved_count===1?'listing':'listings'}. Listing details are for subscribers.</p><a class="btn btn-flag" href="pricing.html?from=saved">See plans</a></div>`; return; }
    const list=r.items; const multi=new Set(list.map(o=>o.market)).size>1;
    const missing = r.missing ? `<div class="notice info" style="margin-bottom:16px">${r.missing} saved ${r.missing===1?'listing is':'listings are'} no longer available. We remove listings that close or disappear when we recheck them.</div>` : '';
    if(!list.length){ S.innerHTML=missing+`<div class="gate"><h2>Nothing saved yet</h2><p>Tap the ☆ on any listing to add it to your shortlist. It’s free.</p><a class="btn btn-turf" href="finder.html">Find pitches</a></div>`; return; }
    const up=list.filter(o=>o.application.status!=='ended'&&o.dates.start), und=list.filter(o=>o.application.status!=='ended'&&!o.dates.start), done=list.filter(o=>o.application.status==='ended');
    const by={ date:(a,b)=>(a.dates.start||'9').localeCompare(b.dates.start||'9'), saved:(a,b)=>(b.saved_at||'').localeCompare(a.saved_at||''),
      deadline:(a,b)=>(a.application.deadline||'9').localeCompare(b.application.deadline||'9')||(a.dates.start||'9').localeCompare(b.dates.start||'9'), az:(a,b)=>a.title.localeCompare(b.title) }[sort];
    [up,und,done].forEach(g=>g.sort(by));
    const grp=(id,title,rows,cls='')=>rows.length?`<section class="grp ${cls}" aria-labelledby="g-${id}"><h2 id="g-${id}">${title} (${rows.length})</h2><div class="stack">${rows.map(o=>multi?card(o).replace('<h3>',`<h3><span class="mkt" aria-label="${esc(st.m(o.market).name)}">${esc(st.m(o.market).display_code)}</span>`):card(o)).join('')}</div></section>`:'';
    S.innerHTML=missing+`<div class="toolbar"><p style="margin:0" aria-live="polite"><b>${list.length}</b> saved · ${up.length+und.length} coming up${done.length?` · ${done.length} finished`:''}</p>
      <div class="tb-r"><label for="svSort" class="sr">Sort saved pitches</label><select id="svSort"><option value="date">Event date</option><option value="deadline">Application deadline</option><option value="saved">Recently saved</option><option value="az">A–Z</option></select>
      <button class="btn btn-line btn-sm" type="button" id="exp">Export (CSV)${st.entitled?'':' · Pro'}</button><a class="btn btn-line btn-sm" href="finder.html">Find more</a></div></div>
      ${grp('up','Coming up',up)}${grp('und','Regular or dates to be confirmed',und)}${grp('done','Finished',done,'past')}`;
    $('#svSort').value=sort; $('#svSort').onchange=e=>{ sort=e.target.value; try{ localStorage.setItem('fpdraft:ui:savedSort',sort); }catch(x){} render(); };
    $('#exp').onclick=()=>{ if(!st.entitled) return upgrade('Exporting your shortlist to a spreadsheet is part of Pro.','export');
      const rows=[['Title','Market','Type','Where','Dates','Applications','Organiser','Apply']].concat(list.map(o=>[o.title,o.market,o.type_label,o.location.label,when(o,o.market),U.appStatus(o).short||'No deadline listed',o.organiser.name||'',o.access.application_url||'']));
      const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
      try { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='findpitches-shortlist.csv'; document.body.appendChild(a); a.click(); a.remove(); toast('Shortlist exported as findpitches-shortlist.csv'); } catch(e){ toast('Export didn’t work in this browser.'); } };
  }
  document.addEventListener('fp:saved',async()=>{ const was=document.activeElement; await render(); if(!document.contains(was)||was===document.body){ const p=S.querySelector('.toolbar p, .gate h2'); if(p){ p.tabIndex=-1; p.focus(); } } });
  render();

})();
