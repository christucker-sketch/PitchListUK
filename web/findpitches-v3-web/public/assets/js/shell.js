/* FindPitches — shared shell: header, footer, market selector, session, formatting,
   opportunity card, status, units, analytics abstraction, accessible modal/toast, coverage-building state. */
(function () {
  const FP = (window.FP = window.FP || {});
  const api = () => FP.api;
  const CFG = window.FP_CONFIG || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = new URLSearchParams(location.search);
  const routeQuery = new URLSearchParams(document.querySelector('meta[name="fp-route-query"]')?.content || '');
  for (const [key, value] of routeQuery) if (!qs.has(key)) qs.set(key, value);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LOGO = (fill = '#0E4B2C') => `<svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true" focusable="false"><rect x="1" y="5" width="32" height="24" rx="6" fill="${fill}"/><path d="M17 5v24M1 12.5h5v9H1M33 12.5h-5v9h5" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="17" cy="17" r="4.2" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="17" cy="17" r="1.8" fill="#FF5A2E"/></svg>`;
  const STAR = on => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>`;

  // Draft explanations are not part of the V3 site; kept as a no-op so page code stays unchanged.
  const draftNote = () => '';

  /* ---------- analytics abstraction (simulated; no tracking service) ---------- */
  // The single place customer events are named. Screens call FP.track(name, props); the adapter decides what happens.
  const EVENTS = ['search_submitted', 'filters_changed', 'sort_changed', 'view_changed', 'results_loaded_more', 'opportunity_opened', 'application_clicked', 'source_clicked',
    'opportunity_saved', 'opportunity_unsaved', 'alert_created', 'alert_updated', 'alert_deleted', 'upgrade_viewed', 'checkout_started', 'checkout_completed',
    'checkout_failed', 'signin_link_requested', 'signed_in', 'signed_out', 'market_changed', 'waitlist_joined', 'report_submitted', 'organiser_submitted', 'seo_page_viewed', 'home_search_submitted'];
  const track = FP.track = (name, props) => {
    if (!EVENTS.includes(name)) console.warn('[FindPitches draft] Unknown analytics event:', name);
    const e = { name, props: props || {}, at: new Date().toISOString() }; track.log.push(e); if (track.log.length > 200) track.log.shift();
    try { api().analytics.track(name, props); } catch (x) { /* analytics must never break the UI */ }
  };
  track.log = []; track.EVENTS = EVENTS;

  /* ---------- state ---------- */
  // Only UI preferences (e.g. chosen country) live in the browser; everything else is server-side in V3.
  const prefs = { get(k, d) { try { const v = localStorage.getItem('fp:pref:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
                  set(k, v) { try { localStorage.setItem('fp:pref:' + k, JSON.stringify(v)); } catch (e) {} } };
  const store = prefs;
  // V3 is a real service (REAL) that offers the full feature set (LIVE=false keeps every Build 4 feature on).
  const REAL = true, LIVE = false;
  const R = FP.routes;
  const state = FP.state = {
    markets: [], session: null, saved: new Set(),
    // Canonical market code (GB, US, CA, AU, IE, NZ, SG, HK). URL may carry ?market=GB or the route slug ?cc=uk.
    get market() { return R.marketOf(qs.get('market')) || R.marketOf(qs.get('cc')) || R.marketOf(store.get('market', 'GB')) || 'GB'; },
    set market(v) { const m = R.marketOf(v); if (m) store.set('market', m); },
    m(code) { const c = R.marketOf(code) || this.market; return this.markets.find(x => x.code === c) || this.markets[0]; },
    get live() { return this.markets.filter(m => m.launch_status === 'live'); },
    proIn(code) { return !!(this.proBuyable && this.proBuyable[R.marketOf(code) || this.market]); },
    get proAvailable() { return this.proIn(this.market); },
    get entitled() { return !!(this.session && this.session.signed_in && ['trial', 'pro'].includes(this.session.access.tier)); }
  };

  /* ---------- units: API/data unit is km; display unit comes from market config ---------- */
  const KM_PER_MI = 1.609344;
  const units = FP.units = {
    toKm: (v, unit) => unit === 'mi' ? v * KM_PER_MI : v,
    fromKm: (km, unit) => unit === 'mi' ? km / KM_PER_MI : km,
    word: (unit, n) => unit === 'mi' ? (n === 1 ? 'mile' : 'miles') : (n === 1 ? 'kilometre' : 'kilometres'),
    short: unit => unit === 'mi' ? 'mi' : 'km',
    fmt(km, market) { if (km == null) return ''; const u = (state.m(market) || {}).distance_unit || 'km'; const v = units.fromKm(km, u); return (v < 1 ? '<1' : Math.round(v)) + ' ' + units.short(u); }
  };

  /* ---------- formatting ---------- */
  const TODAY = CFG.today || '2026-09-25';
  const loc = mk => (state.m(mk) || {}).locale || 'en-GB';
  const fmt = (iso, mk, o) => { if (!iso) return ''; try { return new Intl.DateTimeFormat(loc(mk), Object.assign({ timeZone: 'UTC' }, o)).format(new Date(String(iso).slice(0, 10) + 'T12:00:00Z')); } catch (e) { return iso; } };
  const days = iso => Math.round((new Date(String(iso).slice(0, 10) + 'T12:00:00Z') - new Date(TODAY + 'T12:00:00Z')) / 864e5);
  function when(o, mk) {
    const cc = mk || o.market, d = o.dates || {};
    if (!d.start) return d.recurring ? 'Regular · no fixed dates listed' : 'No dates listed yet';
    const sameYear = d.start.slice(0, 4) === TODAY.slice(0, 4);
    if (!d.end || d.end === d.start) return fmt(d.start, cc, { weekday: 'short', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
    return fmt(d.start, cc, { day: 'numeric', month: 'short' }) + ' – ' + fmt(d.end, cc, { day: 'numeric', month: 'short', year: d.end.slice(0, 4) === TODAY.slice(0, 4) ? undefined : 'numeric' });
  }
  function freshness(o, mk) {
    const cc = mk || o.market, ch = o.checked || {};
    // Some listings only carry the date of the batch they were checked in, not their own check date.
    if (ch.snapshot && !ch.last_checked) return { cls: '', text: 'Checked by ' + fmt(ch.snapshot, cc, { day: 'numeric', month: 'short' }), long: 'Checked on or before ' + fmt(ch.snapshot, cc, { day: 'numeric', month: 'long', year: 'numeric' }) };
    if (!ch.last_checked) return { cls: '', text: 'Check date unknown', long: 'We don’t have a check date for this listing' };
    const a = -days(ch.last_checked);
    const long = 'Last checked ' + fmt(ch.last_checked, cc, { day: 'numeric', month: 'long', year: 'numeric' });
    return a <= 30 ? { cls: 'fresh-g', text: `Checked ${a === 0 ? 'today' : a === 1 ? 'yesterday' : a + ' days ago'}`, long } : a <= 60 ? { cls: 'fresh-a', text: `Checked ${a} days ago`, long } : { cls: '', text: `Checked ${a} days ago`, long };
  }
  const SELLS = { food: 'Food', craft: 'Crafts', market: 'Market goods', general: 'General' };
  const SELLS_LC = { food: 'food', craft: 'crafts', market: 'market goods', general: 'general traders' };
  const wantsList = o => (o.sells || []).map(s => SELLS_LC[s]).filter(Boolean); // as given by the data; empty = not stated
  // Live listings carry open-ended offerings ("Street food", "Jamaican jerk"); the draft uses fixed sells keys.
  const offeringList = o => (Array.isArray(o.offerings) && o.offerings.length ? o.offerings.map(x => String(x).toLowerCase()) : wantsList(o));
  const TYPE_PLURAL_LC = { christmas_market: 'Christmas markets', holiday_market: 'holiday markets', food_festival: 'food festivals', festival: 'festivals', market: 'markets', street_trading: 'street trading pitches', show: 'shows', concession: 'concessions', event: 'events', sport: 'sports events' };
  const typePluralLc = t => TYPE_PLURAL_LC[t] || 'listings';
  const TYPE_PLURAL = { christmas_market: 'Christmas markets', holiday_market: 'Holiday markets', food_festival: 'Food festivals', festival: 'Festivals', market: 'Markets', street_trading: 'Street trading pitches', show: 'Shows', concession: 'Concessions', event: 'Events', sport: 'Sports events' };
  const listJoin = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  // Application status comes from the API (derived from evidence); unknown is shown as nothing on cards.
  function appStatus(o, mk) {
    const a = o.application || { status: 'unknown' }, cc = mk || o.market;
    const d = a.deadline ? fmt(a.deadline, cc, { day: 'numeric', month: 'short' }) : '';
    switch (a.status) {
      // Evidence-based states from the V3 data (contract §3.2). Shown only when the source says so.
      case 'open_now': return { cls: 'open', short: 'Taking applications', long: 'The organiser’s page says applications are open. No closing date is published, so apply soon.' };
      case 'rolling': return { cls: 'open', short: 'Apply any time', long: 'This organiser takes applications all year round.' };
      case 'enquire': return { cls: 'enquire', short: 'Contact organiser', long: 'There is no open application form. Contact the organiser to ask about a pitch.' };
      case 'opens_later': return { cls: 'opens_later', short: a.opens_on ? `Opens ${fmt(a.opens_on, cc, { day: 'numeric', month: 'short' })}` : 'Opens later', long: a.opens_on ? `Applications open on ${fmt(a.opens_on, cc, { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Applications open later. Save it and check back.' };
      case 'open': return { cls: 'open', short: `Apply by ${d}`, long: LIVE && a.basis === 'deadline'
        // Live: we know a future deadline, not that applications have opened. Say only what's known.
        ? `The listed application deadline is ${fmt(a.deadline, cc, { day: 'numeric', month: 'long', year: 'numeric' })}. Check the organiser’s page to confirm applications are open.`
        : `Applications appear open. Apply by ${fmt(a.deadline, cc, { day: 'numeric', month: 'long', year: 'numeric' })}.` };
      case 'closing_soon': return { cls: 'closing_soon', short: a.days_left === 0 ? 'Closes today' : `Closes ${d}`, long: `Closing soon: apply by ${fmt(a.deadline, cc, { day: 'numeric', month: 'long' })} (${a.days_left === 0 ? 'today' : a.days_left + (a.days_left === 1 ? ' day' : ' days') + ' left'}).` };
      case 'closed': return { cls: 'closed', short: 'Deadline passed', long: `The listed deadline (${fmt(a.deadline, cc, { day: 'numeric', month: 'long' })}) has passed. Some organisers still take late applications: check with them.` };
      case 'ended': return { cls: 'ended', short: 'Finished', long: 'This event has finished. Save it to apply again next time.' };
      default: return { cls: 'unknown', short: '', long: 'No application deadline listed. Check the organiser’s page for how and when to apply.' };
    }
  }

  // Plain-English description of a search/alert: "Food opportunities within 25 miles of Maidstone"
  function describeQuery(q, placeLabel) {
    const m = state.m(q.market); const u = m.distance_unit;
    let what = 'All opportunities';
    if (q.types && q.types.length) what = listJoin(q.types.map((t, i) => i ? (TYPE_PLURAL[t] || t).toLowerCase() : (TYPE_PLURAL[t] || t)));
    else if (q.organiser_types && q.organiser_types.includes('council')) what = 'Council-run opportunities';
    if (q.sells) what = (q.types && q.types.length ? what + ' for ' + SELLS_LC[q.sells] : cap(SELLS_LC[q.sells] === 'general traders' ? 'general' : SELLS_LC[q.sells]) + ' opportunities');
    let where;
    const place = placeLabel || q.place_label || q.q || '';
    const r = q.radius_km == null || q.radius_km === 'any' ? null : Math.round(units.fromKm(+q.radius_km, u));
    if (place && r) where = `within ${r} ${units.word(u, r)} of ${place}`;
    else if (place) where = `in ${place}`;
    else where = `in ${m.the}`;
    const when = { '30': 'in the next 30 days', '90': 'in the next 3 months', xmas: 'this Christmas season', '2027': 'in 2027' }[q.when] || '';
    return [what, where, when].filter(Boolean).join(' ');
  }

  /* ---------- opportunity card ---------- */
  // mode 'link' → title links to the full page; mode 'quick' → same link, but the page may intercept for a quick view.
  function card(o, opts = {}) {
    const cc = o.market, sp = o.type === 'sport', f = freshness(o, cc), on = state.saved.has(o.id), st = appStatus(o, cc);
    let dt;
    if (o.dates && o.dates.start) { const d = new Date(o.dates.start + 'T12:00:00Z'); dt = `<div class="date ${sp ? 'sport' : ''}" aria-hidden="true"><b>${d.getUTCDate()}</b><span>${fmt(o.dates.start, cc, { month: 'short' })}${o.dates.start.slice(0, 4) !== TODAY.slice(0, 4) ? ' ’' + o.dates.start.slice(2, 4) : ''}</span></div>`; }
    else dt = `<div class="date ong" aria-hidden="true"><span>${o.dates && o.dates.recurring ? 'Regular' : 'No date'}</span></div>`;
    let dist = '';
    if (o.distance_km != null) dist = o.location.precision === 'place' ? ` · <b>${units.fmt(o.distance_km, cc)}</b>` : ` · <span class="muted">${esc(o.location.region_name || o.location.region || 'area')}-wide listing</span>`;
    const wl = offeringList(o); const wantsTxt = wl.length ? 'Wants ' + listJoin(wl.slice(0, 3)) + (wl.length > 3 ? ' and more' : '') : '';
    const past = st.cls === 'ended';
    return `<article class="ocard${past ? ' past' : ''}" data-id="${esc(o.id)}">${dt}
      <div class="oc-main">
        <h3><a href="${R.draft.opportunity(o.id)}" data-open="${esc(o.id)}">${esc(o.title)}</a></h3>
        <p class="oc-where">${esc(o.location.label)}${dist}<span class="oc-when${o.dates && o.dates.start ? '' : ' muted'}"><span aria-hidden="true"> · </span>${esc(o.dates && o.dates.start ? when(o, cc) : o.dates && o.dates.recurring ? 'Regular, no fixed dates listed' : 'No dates listed yet')}</span></p>
        <p class="oc-meta">${o.type_label ? `<span class="ty ${sp ? 'sport' : ''}">${esc(o.type_label)}</span>` : ''}${wantsTxt ? `<span>${esc(wantsTxt)}</span>` : ''}<span class="fresh ${f.cls}" title="${esc(f.long)}"><i aria-hidden="true"></i>${esc(f.text)}</span></p>
      </div>
      <div class="oc-side">${st.short ? `<span class="status ${st.cls}"><i aria-hidden="true"></i>${esc(st.short)}</span>` : ''}
        <button type="button" class="star" data-save="${esc(o.id)}" aria-pressed="${on}" aria-label="${on ? 'Remove from saved' : 'Save'}: ${esc(o.title)}">${STAR(on)}</button></div></article>`;
  }

  /* ---------- toast (polite live region) with optional action ---------- */
  function toast(t, opts = {}) {
    let el = $('#fp-toast');
    if (!el) { el = document.createElement('div'); el.id = 'fp-toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.innerHTML = `<span>${esc(t)}</span>${opts.action ? `<button type="button">${esc(opts.action.label)}</button>` : ''}`;
    if (opts.action) el.querySelector('button').onclick = () => { el.hidden = true; opts.action.onClick(); };
    el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, opts.action ? 6000 : 3200);
  }

  /* ---------- accessible modal: labelled, focus-trapped, Escape closes, focus restored ---------- */
  let modalSeq = 0;
  function modal(html, { onOpen, label } = {}) {
    const opener = document.activeElement; const id = 'dlg' + (++modalSeq);
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-t">${html}</div>`;
    const h = m.querySelector('h2'); if (h) { h.id = id + '-t'; h.tabIndex = -1; } else m.querySelector('.dialog').setAttribute('aria-label', label || 'Dialog');
    const close = () => { m.remove(); document.removeEventListener('keydown', key, true); if (opener && opener.focus && document.contains(opener)) opener.focus(); };
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') { const f = [...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', key, true); document.body.appendChild(m);
    const f = m.querySelector('input:not([type=hidden]),select,textarea') || m.querySelector('button:not(.x),a[href]'); (f || h).focus();
    onOpen && onOpen(m, close); return { el: m, close };
  }
  // Mark a form field invalid with an accessible message.
  function fieldError(input, msg) {
    const idm = input.id + '-err'; let e = document.getElementById(idm);
    if (!msg) { input.removeAttribute('aria-invalid'); if (e) e.remove(); return; }
    if (!e) { e = document.createElement('p'); e.id = idm; e.className = 'form-err'; input.insertAdjacentElement('afterend', e); }
    e.textContent = msg; input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', idm); input.focus();
  }

  // Sign-in by magic link (simulated: the "email" is shown on screen as a button).
  function signIn(reason) {
    return new Promise(resolve => {
      modal(`<div class="dh"><h2>Sign in to FindPitches</h2><button class="x" data-close aria-label="Close">×</button></div>
        <p class="muted" style="margin:0 0 16px">${esc(reason || 'Enter your email and we’ll send you a sign-in link. No password needed.')}</p>
        <form id="si" novalidate><div class="field"><label for="siEmail">Email address</label><input class="input" id="siEmail" type="email" autocomplete="email" placeholder="you@yourstall.com" required></div>
        <button class="btn btn-turf" style="width:100%;margin-top:12px" type="submit">Email me a sign-in link</button>
        <p class="muted" style="font-size:.84rem;margin:10px 0 0">New here? The same link creates your free account.</p></form>
        <div id="siSent" hidden><p style="margin:6px 0 0" role="status">Check your inbox: we’ve sent a link to <b id="siTo"></b>.</p>
          <p class="muted" id="siHelp" style="font-size:.86rem;margin:8px 0 0">It works once and expires in 20 minutes. You can close this window.</p>
          <div id="siMock" hidden>${draftNote('no email is sent. Use the button below as if you’d clicked the link in the email.')}
          <button class="btn btn-flag" style="width:100%;margin-top:12px" id="siOpen" type="button">Open the sign-in link</button></div>
          <div id="siDev" hidden><p class="notice warn" style="margin:12px 0 0;font-size:.86rem">Local development: no email provider is configured, so the link is shown here instead.</p>
          <a class="btn btn-flag" style="width:100%;margin-top:12px" id="siDevLink" href="#">Open the sign-in link</a></div></div>`, {
        onOpen(m, close) {
          let token;
          m.querySelector('#si').addEventListener('submit', async e => {
            e.preventDefault(); const inp = m.querySelector('#siEmail'); const email = inp.value.trim();
            try { const r = await api().session.requestLink({ email }); token = r._mock_token; fieldError(inp, null); m.querySelector('#si').hidden = true; m.querySelector('#siSent').hidden = false; m.querySelector('#siTo').textContent = email;
              if (token) { m.querySelector('#siMock').hidden = false; m.querySelector('#siOpen').focus(); }
              else if (r.dev_link && /^https?:\/\//.test(r.dev_link) && new URL(r.dev_link).origin === location.origin) { m.querySelector('#siDev').hidden = false; const a = m.querySelector('#siDevLink'); a.href = r.dev_link; a.focus(); }
              else m.querySelector('#siHelp').focus?.();
              track('signin_link_requested'); }
            catch (x) { fieldError(inp, x.message); }
          });
          m.querySelector('#siOpen').addEventListener('click', async () => { const s = await api().session.completeLink({ token }); state.session = s; const ids = await api().saved.ids(); state.saved = new Set(ids); close(); renderHeader(); toast('Signed in as ' + s.user.email); track('signed_in'); resolve(s); document.dispatchEvent(new CustomEvent('fp:session', { detail: s })); });
        }
      });
    });
  }
  async function requireSignIn(reason) { if (state.session && state.session.signed_in) return state.session; return signIn(reason); }
  function upgrade(reason, context, marketCode) {
    track('upgrade_viewed', { context: context || 'generic' });
    if (!state.proIn(marketCode)) {
      const m = state.m(marketCode);
      return modal(`<div class="dh"><h2>Pro isn’t available in ${esc(m.the)} yet</h2><button class="x" data-close aria-label="Close">×</button></div>
        <p style="margin:0 0 14px">${m.launch_status === 'live' ? `Pricing for ${esc(m.the)} hasn’t been set yet, so Pro can’t be bought there.` : `FindPitches opens in ${esc(m.name)} soon.`}${LIVE ? '' : ' Searching and saving stay free.'}</p>
        <button class="btn btn-turf" style="width:100%" type="button" data-close>OK</button>`);
    }
    modal(`<div class="dh"><h2>See where to apply with Pro</h2><button class="x" data-close aria-label="Close">×</button></div>
      <p class="muted" style="margin:0 0 14px">${esc(reason || 'Pro shows the organiser’s application page for every listing and alerts you to new ones near you.')}</p>
      <ul style="margin:0 0 16px;padding-left:18px;line-height:1.8">${LIVE ? '<li>Search every checked listing</li><li>Full details and the organiser’s application page</li><li>Save listings to your account</li>' : '<li>The organiser’s application page and source for every listing</li><li>Alerts for new pitches that match you</li><li>Export your shortlist</li>'}</ul>
      <a class="btn btn-flag" style="width:100%" href="pricing.html?from=${encodeURIComponent(context || 'generic')}">Try Pro free for 7 days</a>
      <p class="muted" style="font-size:.82rem;margin:10px 0 0;text-align:center">${LIVE ? 'Cancel any time.' : 'Search and saving stay free. Cancel any time.'}</p>`);
  }

  async function toggleSave(id) {
    const s = await requireSignIn('Save pitches to your account and come back to them from any device.'); if (!s) return;
    const on = state.saved.has(id);
    try { if (on) { await api().saved.remove(id); state.saved.delete(id); } else { await api().saved.add(id); state.saved.add(id); } }
    catch (e) { toast(e.message); return; }
    track(on ? 'opportunity_unsaved' : 'opportunity_saved', { id });
    syncSaveButtons(id);
    renderHeader();
    toast(on ? 'Removed from saved' : 'Saved to your list', on ? { action: { label: 'Undo', onClick: () => toggleSave(id) } } : { action: { label: 'View saved', onClick: () => location.href = 'saved.html' } });
    document.dispatchEvent(new CustomEvent('fp:saved', { detail: { id, saved: !on } }));
  }
  function syncSaveButtons(id) {
    const on = state.saved.has(id);
    document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`).forEach(b => {
      b.setAttribute('aria-pressed', String(on));
      if (b.classList.contains('star')) { b.innerHTML = STAR(on); b.setAttribute('aria-label', (on ? 'Remove from saved' : 'Save') + (b.getAttribute('aria-label') || '').replace(/^[^:]*/, '')); }
      else b.textContent = on ? '★ Saved' : '☆ Save';
    });
  }

  /* ---------- "Can I trade here, and how do I apply?" (shared by quick view and full page) ---------- */
  function factsHTML(o, opts = {}) {
    const cc = o.market, m = state.m(cc), st = appStatus(o, cc);
    const wants = offeringList(o);
    let where = esc(o.location.label);
    if (o.distance_km != null && o.location.precision === 'place') where += `<br><small class="muted">${units.fmt(o.distance_km, cc)} from ${esc(opts.from || 'your search')}</small>`;
    else if (o.location.precision && o.location.precision !== 'place') where += `<br><small class="muted">Area-wide listing: exact site given by the organiser</small>`;
    const rows = [
      ['When', esc(when(o, cc))],
      ['Where', where],
      ['Looking for', wants.length ? esc(cap(listJoin(wants))) : '<span class="muted">Not stated</span>'],
      [cap(m.vocab.fee), esc(o.fee && o.fee.text ? o.fee.text : LIVE ? 'Check the organiser’s page' : 'Not listed: ask the organiser')],
      ['Organiser', esc(o.organiser.name || 'Named on the organiser’s page') + (o.organiser.type_label ? `<br><small class="muted">${esc(o.organiser.type_label)}</small>` : '')],
      ['Applications', st.cls === 'unknown' ? 'No deadline listed' : `<span class="status ${st.cls}"><i aria-hidden="true"></i>${esc(st.short)}</span>`]
    ];
    return `<dl class="facts${opts.cols ? ' c' + opts.cols : ''}">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  }
  function applyPanel(o) {
    const st = appStatus(o, o.market), s = state.session || { signed_in: false };
    const org = o.organiser.name ? esc(o.organiser.name) : 'the organiser';
    if (st.cls === 'ended') return `<div class="applybox"><p class="ab-status"><span class="status ended"><i aria-hidden="true"></i>Finished</span></p><p>This event has finished. Save it and we’ll show it again when next year’s dates are listed.</p></div>`;
    // Locked users can't see the organiser's page, so don't tell them to check it.
    const leadText = o.access.locked && st.cls === 'unknown' ? 'No application deadline listed.' : st.long;
    const lead = `<p class="ab-status">${st.cls === 'unknown' ? '<b>How to apply</b>' : `<span class="status ${st.cls}"><i aria-hidden="true"></i>${esc(st.short)}</span>`}</p><p class="ab-lead">${esc(leadText)}</p>`;
    if (!o.access.locked) {
      if (!o.access.application_url) return `<div class="applybox">${lead}<p>${org} hasn’t published an application link. Contact them through their listing.</p></div>`;
      return `<div class="applybox">${lead}<a class="btn btn-turf ab-cta" href="${esc(o.access.application_url)}" target="_blank" rel="noopener" data-apply="${esc(o.id)}">Apply on ${org === 'the organiser' ? 'the organiser’s' : org + '’s'} site<span class="sr"> (opens in a new tab)</span> ↗</a>
        <p class="ab-small">You apply directly with ${org}. FindPitches checks listings but doesn’t take applications or guarantee a place.</p>
        ${o.access.source_url && o.access.source_url !== o.access.application_url ? `<p class="ab-small"><a href="${esc(o.access.source_url)}" target="_blank" rel="noopener" data-source="${esc(o.id)}">View the original listing on ${esc(o.access.source_domain || 'the organiser’s site')}<span class="sr"> (opens in a new tab)</span></a></p>` : ''}</div>`;
    }
    return `<div class="applybox locked">${lead}
      ${state.proIn(o.market) ? `<div class="ab-lock"><p><b>Where to apply is part of Pro.</b> Everything else on this listing is free. Pro shows the organiser’s application page for this and every listing${o.access.source_domain_hint ? ` (this one is on a <b>${esc(o.access.source_domain_hint)}</b> site)` : ''}.</p>
      <button type="button" class="btn btn-flag ab-cta" data-unlock="apply" data-for-market="${esc(o.market)}">${s.signed_in ? 'Try Pro free for 7 days' : 'See where to apply'}</button></div>`
      : `<p class="ab-small">Where to apply is part of Pro, which isn’t available in ${esc(state.m(o.market).the)} yet. Everything else on this listing is free.</p>`}</div>`;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-apply]'); if (a) track('application_clicked', { id: a.dataset.apply });
    const so = e.target.closest('[data-source]'); if (so) track('source_clicked', { id: so.dataset.source });
    const u = e.target.closest('[data-unlock]'); if (u) { e.preventDefault(); upgrade(null, u.dataset.unlock, u.dataset.forMarket); }
  });

  /* ---------- create an alert from any search (Finder, listing page, SEO page) ---------- */
  async function createAlert(query, { placeLabel } = {}) {
    const s = await requireSignIn('Sign in to get alerts for new pitches that match this search.'); if (!s) return;
    if (!state.entitled) return upgrade('Alerts are part of Pro. We’ll email you when a new checked listing matches this search.', 'alert');
    const q = Object.assign({}, query, placeLabel ? { place_label: placeLabel } : {});
    const desc = describeQuery(q, placeLabel);
    modal(`<div class="dh"><h2>Create an alert</h2><button class="x" data-close aria-label="Close">×</button></div>
      <p style="margin:0 0 14px">We’ll email you when a new checked listing matches:</p>
      <p class="alertdesc">${esc(desc)}</p>
      <form id="alForm" novalidate style="display:grid;gap:14px">
        <fieldset class="radios"><legend>How often?</legend>
          <label><input type="radio" name="freq" value="instant"> As soon as one appears</label>
          <label><input type="radio" name="freq" value="daily"> Daily summary</label>
          <label><input type="radio" name="freq" value="weekly" checked> Weekly summary</label></fieldset>
        <button class="btn btn-turf" type="submit">Create alert</button>
        ${draftNote('saved in this browser only. No email is sent.')}</form>`, {
      onOpen(m, close) {
        m.querySelector('#alForm').onsubmit = async e => {
          e.preventDefault(); const frequency = m.querySelector('input[name=freq]:checked').value;
          try { await api().alerts.create({ name: desc, query: q, frequency }); close(); track('alert_created', { market: q.market, frequency }); toast('Alert created: ' + desc, { action: { label: 'Manage alerts', onClick: () => location.href = 'alerts.html' } }); }
          catch (x) { toast(x.message); }
        };
      }
    });
  }

  /* ---------- coverage-building market state (shared by Finder, SEO pages, etc.) ---------- */
  function coverageBuilding(mkCode, opts = {}) {
    const m = state.m(mkCode); const live = state.live;
    const search = m.postal.kind === 'district' ? 'district or place name (Hong Kong doesn’t use postcodes)' : m.postal.label_mid + ' or town';
    return `<section class="coverage" aria-labelledby="cv-${m.code}">
      <div class="cv-top"><span class="status building" style="background:rgba(255,244,218,.95)"><i aria-hidden="true"></i>Coming soon</span>
        <h2 id="cv-${m.code}">FindPitches is coming to ${esc(m.name)}</h2>
        <p>We’re building checked listings for ${esc(m.the)} now. There’s nothing to show yet, and we won’t show listings until they’ve been checked.</p></div>
      <div class="cv-body">
        <div><h3 style="font-size:1rem;margin:0 0 10px">What FindPitches ${esc(m.name)} will do</h3>
          <div class="facts3"><div><small>Search by</small><b>${esc(cap(search))}</b></div><div><small>Distances in</small><b>${m.distance_unit === 'km' ? 'Kilometres' : 'Miles'}</b></div>
            <div><small>Fees shown in</small><b>${esc(m.currency)}</b></div><div><small>You’ll find</small><b>${esc(m.vocab.listings)}</b></div></div>
          <p class="muted" style="font-size:.9rem;margin:12px 0 0">Markets, fairs, festivals, shows and sporting events looking for ${esc(m.vocab.traders)}, each straight from the organiser.</p>
          ${live.length ? `<div class="cv-links"><span class="muted" style="font-size:.88rem;align-self:center">Search now in:</span>${live.map(x => `<a class="btn btn-line btn-sm" href="${R.draft.finder(x.code)}">${esc(x.name)}</a>`).join('')}</div>` : ''}
        </div>
        <form class="wlform" data-market="${m.code}" novalidate>
          <h3 style="font-size:1rem;margin:0 0 6px">Hear when ${esc(m.name)} opens</h3>
          <p class="muted" style="font-size:.9rem;margin:0 0 12px">One email when listings go live. No newsletter.</p>
          <div class="field"><label for="wl-${m.code}">Email address</label><input class="input" id="wl-${m.code}" type="email" autocomplete="email" placeholder="you@yourstall.com"></div>
          <button class="btn btn-turf" type="submit" style="width:100%;margin-top:10px">Notify me</button>
          ${draftNote('saved in this browser only, nothing is sent.')}
        </form></div></section>`;
  }
  document.addEventListener('submit', async e => {
    const f = e.target.closest('.wlform'); if (!f) return; e.preventDefault();
    const inp = f.querySelector('input'); const mk = f.dataset.market;
    try { await api().waitlist.join({ email: inp.value.trim(), market: mk }); track('waitlist_joined', { market: mk }); f.innerHTML = `<p class="okmsg" role="status">✓ Done. We’ll email ${esc(inp.value.trim())} when ${esc(state.m(mk).name)} opens.</p>`; }
    catch (x) { fieldError(inp, x.message); }
  });

  /* ---------- header / footer ---------- */
  function renderHeader() {
    const top = $('#fp-top'); if (!top) return;
    const s = state.session || { signed_in: false, access: { tier: 'free' } }, c = state.m(), page = document.body.dataset.page;
    const cur = p => page === p ? ' aria-current="page"' : '';
    const tier = s.access.tier;
    const trialLeft = tier === 'trial' && s.access.trial_ends ? Math.max(0, days(s.access.trial_ends)) : null;
    const main = document.querySelector('main');
    if (main && !main.id) main.id = 'main'; if (main) main.tabIndex = -1;
    top.innerHTML = `
      <a class="skip" href="#${main ? main.id : 'main'}">Skip to content</a>
      <header class="nav"><div class="wrap">
        <a class="logo" href="index.html" aria-label="FindPitches home">${LOGO()}FindPitches</a>
        <nav class="links" aria-label="Main">
          <a href="finder.html"${page === 'finder' && qs.get('type') !== 'sport' ? ' aria-current="page"' : ''}>Find pitches</a>
          <a href="finder.html?type=sport"${page === 'finder' && qs.get('type') === 'sport' ? ' aria-current="page"' : ''}>Sports &amp; stadiums</a>
          <a href="organisers.html"${cur('organisers')}>For organisers</a>
          <a href="pricing.html"${cur('pricing')}>Pricing</a>
        </nav>
        <div class="right">
          <div style="position:relative"><button class="navbtn" id="ccBtn" aria-haspopup="true" aria-expanded="false" aria-controls="ccPop" aria-label="Country: ${esc(c ? c.name : '')}. Change country"><span class="code">${esc(c ? c.display_code : 'UK')}</span><span class="cc-name">${esc(c ? c.name : '')}</span></button>
            <div class="pop" id="ccPop" hidden><div class="hd">Where do you trade? You can switch any time.</div>${state.markets.map(k => `<button class="item" type="button" data-market="${k.code}" aria-current="${k.code === (c && c.code)}"><span><span class="code">${esc(k.display_code)}</span> ${esc(k.name)}</span><small class="${k.launch_status === 'live' ? 'live' : ''}">${k.launch_status === 'live' ? 'Live' : 'Coming soon'}</small></button>`).join('')}</div></div>
          <a class="navbtn" href="saved.html" aria-label="Saved pitches${state.saved.size ? ' (' + state.saved.size + ')' : ''}"${cur('saved')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true" focusable="false"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg><span class="saved-label">Saved</span>${state.saved.size ? `<span class="count" aria-hidden="true">${state.saved.size}</span>` : ''}</a>
          ${s.signed_in ? `<div style="position:relative"><button class="navbtn" id="acBtn" aria-haspopup="true" aria-expanded="false" aria-controls="acPop" aria-label="Account: ${esc(s.user.email)}, ${tier === 'free' ? 'Free plan' : tier === 'trial' ? 'Pro trial' : 'Pro plan'}"><span class="avatar" aria-hidden="true">${esc((s.user.email || '?')[0])}</span><span class="tier ${tier}">${tier === 'free' ? 'Free' : tier === 'trial' ? `Trial · ${trialLeft}d left` : 'Pro'}</span></button>
            <div class="pop" id="acPop" hidden><div class="hd">${esc(s.user.email)}</div><a href="account.html">Account &amp; plan</a>${LIVE ? "" : `<a href="alerts.html">Alerts</a>`}<a href="saved.html">Saved pitches</a><button class="item" type="button" id="signOut">Sign out</button></div></div>`
            : `<button class="navbtn" type="button" id="signInBtn">Sign in</button>`}
          ${state.entitled || !state.proAvailable ? '' : `<a class="btn btn-flag btn-sm gopro" href="pricing.html">Try Pro</a>`}
        </div></div></header>`;
    const pop = (b, p) => { const B = $(b), P = $(p); if (!B) return;
      B.onclick = e => { e.stopPropagation(); const o = P.hidden; closePops(); P.hidden = !o; B.setAttribute('aria-expanded', String(o)); if (o) { const f = P.querySelector('[aria-current="true"]') || P.querySelector('button,a'); f && f.focus(); } };
      P.addEventListener('keydown', e => { const items = [...P.querySelectorAll('button,a')]; const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } else if (e.key === 'Escape') { closePops(); B.focus(); } });
    };
    pop('#ccBtn', '#ccPop'); pop('#acBtn', '#acPop');
    top.querySelectorAll('[data-market]').forEach(b => b.onclick = () => {
      const to = b.dataset.market; track('market_changed', { from: state.market, to }); state.market = to;
      if (document.body.dataset.page === 'seo') { location.href = R.draft.seo(R.marketPath(to)); return; }
      const u = new URL(location.href); u.searchParams.delete('market');
      if (document.body.dataset.page === 'finder') { ['q', 'radius', 'month'].forEach(k => u.searchParams.delete(k)); }
      if (u.searchParams.has('cc') || document.body.dataset.page === 'finder') u.searchParams.set('cc', R.slugOf(to));
      location.href = u.toString(); });
    const si = $('#signInBtn'); if (si) si.onclick = () => signIn();
    const so = $('#signOut'); if (so) so.onclick = async () => { await api().session.signOut(); track('signed_out'); location.reload(); };
  }
  function closePops() { document.querySelectorAll('.pop').forEach(p => p.hidden = true); document.querySelectorAll('[aria-haspopup="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
  document.addEventListener('click', closePops);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.pop:not([hidden])')) closePops(); });

  function renderFooter() {
    const f = $('#fp-foot'); if (!f) return;
    f.innerHTML = `<footer class="foot"><div class="wrap top">
      <div><a class="logo" href="index.html">${LOGO('#145E39')}FindPitches</a><p style="margin:14px 0 0;max-width:24em">Checked places to trade at markets, festivals, shows and sporting events, straight from the organiser.</p></div>
      <div><h2 class="fh">Markets</h2><ul>${state.markets.map(c => `<li><a href="${LIVE ? R.draft.finder(c.code) : R.draft.seo(R.marketPath(c.code))}">${esc(c.name)}</a>${c.launch_status === 'live' ? '' : ' <span class="soon">· coming soon</span>'}</li>`).join('')}</ul></div>
      <div><h2 class="fh">For traders</h2><ul><li><a href="finder.html">Find pitches</a></li>${LIVE ? '' : `<li><a href="${R.draft.seo(R.marketPath(state.m().launch_status === 'live' ? state.market : (state.live[0] || {}).code || 'GB'))}">Browse by place &amp; type</a></li><li><a href="finder.html?type=sport">Sports event pitches</a></li>`}<li><a href="saved.html">Saved pitches</a></li>${LIVE ? '' : '<li><a href="alerts.html">Alerts</a></li>'}<li><a href="pricing.html">Pricing</a></li></ul></div>
      <div><h2 class="fh">FindPitches</h2><ul><li><a href="organisers.html">For organisers</a></li><li><a href="index.html#checked">How we check listings</a></li><li><a href="account.html">Your account</a></li></ul></div>
      </div><div class="wrap bottom"><span>© 2026 FindPitches</span><span>We list opportunities and link to organisers. Organisers choose their traders.</span></div></footer>`;
  }

  // "Try again" buttons (no inline event handlers: the CSP forbids them).
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-reload]')) location.reload(); });

  /* ---------- boot ---------- */
  FP.ready = (async function boot() {
    try {
      // Live: ask for saved ids only once we know someone is signed in (no pointless 401s).
      const [markets, session, draftIds] = await Promise.all([api().meta.markets(), api().session.get(), REAL ? null : api().saved.ids()]);
      const ids = REAL ? (session && session.signed_in ? await api().saved.ids() : []) : draftIds;
      state.markets = markets; state.session = session; state.saved = new Set(session.signed_in ? ids : []);
      // Can Pro be bought in this country right now? (No price is ever invented: unpriced or not-yet-open markets say so.)
      const live = markets.filter(m => m.launch_status === 'live');
      const plans = await Promise.all(live.map(m => api().billing.plans({ market: m.code }).catch(() => [])));
      state.proBuyable = {}; live.forEach((m, i) => { const pro = plans[i].find(p => p.id !== 'free'); state.proBuyable[m.code] = !!(pro && pro.price != null); });
    } catch (e) {
      if (REAL && !state.markets.length) {
        // The site can't work without the market list (backend or config problem). Say so plainly and
        // stop here, rather than rendering pages with missing data.
        console.warn('FindPitches unavailable:', e && e.code);
        const main = document.getElementById('main');
        if (main) main.innerHTML = `<section class="phead"><div class="wrap"><h1>FindPitches is temporarily unavailable</h1><p>We couldn’t load the site just now. Please try again in a few minutes.</p><p><button class="btn btn-turf" type="button" data-reload>Try again</button></p></div></section>`;
        return new Promise(() => {});
      }
      console.error(e);
    }
    const urlMarket = R.marketOf(qs.get('market')) || R.marketOf(qs.get('cc')); if (urlMarket) store.set('market', urlMarket);
    renderHeader(); renderFooter();
    document.addEventListener('click', e => { const b = e.target.closest('[data-save]'); if (b) { e.preventDefault(); e.stopPropagation(); toggleSave(b.dataset.save); } }, true);
    return state;
  })();

  FP.ui = { typePluralLc, draftNote, factsHTML, applyPanel, createAlert, units, esc, fmt, days, when, freshness, appStatus, describeQuery, card, row: card, toast, modal, fieldError, signIn, requireSignIn, upgrade, toggleSave, syncSaveButtons, coverageBuilding, renderHeader, STAR, SELLS, SELLS_LC, TYPE_PLURAL, listJoin, cap, qs, TODAY, RM };
})();
