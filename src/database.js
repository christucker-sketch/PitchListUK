const form = document.getElementById('cloudSearch');
const statusEl = document.getElementById('databaseStatus');
const metricsEl = document.getElementById('cloudMetrics');
const savedShortlistEl = document.getElementById('savedShortlist');
const resultsEl = document.getElementById('cloudResults');
const startTrial = document.getElementById('startTrial');
const subscriberAccess = document.getElementById('subscriberAccess');
const accessForm = document.getElementById('accessForm');
const accessFormStatus = document.getElementById('accessFormStatus');
const vendorSignup = document.getElementById('vendorSignup');
const vendorSignupStatus = document.getElementById('vendorSignupStatus');
const SESSION_KEY = 'pitchlist_checkout_session_id';
const ACCESS_TOKEN_KEY = 'pitchlist_access_token';
const ACCOUNT_KEY = 'pitchlist_account';
const SHORTLIST_KEY = 'pitchlist_saved_shortlist';
let latestRows = [];
let latestData = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function dateRange(row) {
  if (!row.event_start) return 'Dates vary';
  const start = formatDate(row.event_start);
  const end = row.event_end && row.event_end !== row.event_start ? formatDate(row.event_end) : '';
  return end ? `${start} to ${end}` : start;
}

function displayName(row) {
  const eventName = String(row.event_name || '').trim();
  const organiser = String(row.organiser || '').trim();
  const uglyTitle = eventName.length > 120 || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(eventName);
  const chosen = uglyTitle && organiser && organiser.length < eventName.length ? organiser : eventName;
  return chosen.length > 150 ? `${chosen.slice(0, 147)}...` : chosen;
}

function formatDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '');
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function imageClass(row, index) {
  const route = String(row.route_type || 'trader-pitch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (route) return `has-image-${route}`;
  const variants = ['is-street-food', 'is-general-market', 'is-general-festival'];
  if (Number.isInteger(index)) return variants[index % variants.length];
  const key = `${row.id || ''}:${row.event_name || ''}:${row.route_type || ''}`;
  const score = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  return variants[score % variants.length];
}

const routeImages = {
  agricultural_show: '/assets/card-county-show.jpg',
  artisan_market: '/assets/card-craft-market.jpg',
  brewery_taproom: '/assets/card-food-truck-pitches.jpg',
  christmas_market: '/assets/card-christmas-market.jpg',
  commercial_event: '/assets/card-food-truck-pitches.jpg',
  community_event: '/assets/card-council-event.jpg',
  community_market: '/assets/card-craft-market.jpg',
  concession: '/assets/card-food-truck-pitches.jpg',
  council_event: '/assets/card-council-event.jpg',
  craft_market: '/assets/card-craft-market.jpg',
  cultural_festival: '/assets/card-festival-vendors.jpg',
  exhibition: '/assets/card-craft-market.jpg',
  farmers_market: '/assets/card-farmers-market.jpg',
  festival: '/assets/card-festival-vendors.jpg',
  food_court: '/assets/card-food-truck-pitches.jpg',
  food_festival: '/assets/card-festival-vendors.jpg',
  indoor_market: '/assets/card-craft-market.jpg',
  market: '/assets/card-markets.jpg',
  music_festival: '/assets/card-festival-vendors.jpg',
  night_market: '/assets/card-night-market.jpg',
  permanent_pitch: '/assets/card-food-truck-pitches.jpg',
  private_hire: '/assets/card-food-truck-pitches.jpg',
  seasonal_event: '/assets/card-christmas-market.jpg',
  sporting_event: '/assets/card-food-truck-pitches.jpg',
  street_trading_pitch: '/assets/card-council-event.jpg',
  visitor_attraction: '/assets/card-food-truck-pitches.jpg'
};

const fallbackImages = [
  '/assets/card-street-food.jpg',
  '/assets/card-markets.jpg',
  '/assets/card-shows-festivals.jpg',
  '/assets/card-farmers-market.jpg',
  '/assets/card-christmas-market.jpg',
  '/assets/card-craft-market.jpg',
  '/assets/card-food-truck-pitches.jpg',
  '/assets/card-county-show.jpg',
  '/assets/card-council-event.jpg',
  '/assets/card-night-market.jpg',
  '/assets/card-festival-vendors.jpg'
];

function imageUrl(row, index) {
  const text = [
    row.route_type,
    row.event_name,
    row.organiser,
    row.vendor_categories,
    row.notes
  ].join(' ').toLowerCase();
  if (/christmas|xmas|winter wonderland/.test(text)) return '/assets/card-christmas-market.jpg';
  if (/farmers? market|farm shop|producer market/.test(text)) return '/assets/card-farmers-market.jpg';
  if (/craft|artisan|makers?|handmade|jewellery|ceramic|textile|gift/.test(text)) return '/assets/card-craft-market.jpg';
  if (/night market|twilight|evening market/.test(text)) return '/assets/card-night-market.jpg';
  if (/county show|agricultural|showground|livestock/.test(text)) return '/assets/card-county-show.jpg';
  if (/council|bid|street trading|town centre|high street/.test(text)) return '/assets/card-council-event.jpg';
  if (/food truck|mobile catering|brewery|taproom|business park|pop-up|concession|private hire/.test(text)) return '/assets/card-food-truck-pitches.jpg';
  if (/festival|food and drink|music festival|cultural festival/.test(text)) return '/assets/card-festival-vendors.jpg';
  const routeImage = routeImages[String(row.route_type || '').toLowerCase()];
  if (routeImage) return routeImage;
  return fallbackImages[index % fallbackImages.length];
}

function routeLabel(row) {
  return String(row.route_type || 'trader pitch').replace(/_/g, ' ');
}

function checkedLabel(row) {
  const checked = String(row.last_checked || '').slice(0, 10);
  return checked ? `Checked ${formatDate(checked)}` : 'Checked recently';
}

function chips(row) {
  return [
    row.county || row.region || 'Area to verify',
    dateRange(row),
    routeLabel(row),
    checkedLabel(row)
  ].filter(Boolean);
}

function rowKey(row) {
  return String(row.id || [
    row.event_name,
    row.organiser,
    row.application_url,
    row.source_url
  ].filter(Boolean).join(':')).trim();
}

function savedRows() {
  try {
    const rows = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveRows(rows) {
  localStorage.setItem(SHORTLIST_KEY, JSON.stringify(rows.slice(0, 100)));
}

function shortlistRow(row) {
  return {
    key: rowKey(row),
    name: displayName(row),
    organiser: row.organiser || '',
    county: row.county || row.region || '',
    date: dateRange(row),
    route: routeLabel(row),
    confidence: row.confidence || '',
    source_url: row.source_url || '',
    application_url: row.application_url || '',
    locked: Boolean(row.locked),
    saved_at: new Date().toISOString()
  };
}

function csvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadShortlist() {
  const rows = savedRows();
  if (!rows.length) return;
  const headers = ['name', 'organiser', 'county', 'date', 'route', 'confidence', 'application_url', 'source_url'];
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvValue(row[header])).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pitchlist-shortlist-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function toggleSaved(key) {
  const match = latestRows.find(row => rowKey(row) === key);
  if (!match) return;
  const rows = savedRows();
  const existing = rows.findIndex(row => row.key === key);
  if (existing >= 0) rows.splice(existing, 1);
  else rows.unshift(shortlistRow(match));
  saveRows(rows);
  renderShortlist();
  renderResults(latestRows);
  if (latestData) renderMetrics(latestData);
}

function removeSaved(key) {
  saveRows(savedRows().filter(row => row.key !== key));
  renderShortlist();
  renderResults(latestRows);
  if (latestData) renderMetrics(latestData);
}

function renderShortlist() {
  const rows = savedRows();
  if (!rows.length) {
    savedShortlistEl.innerHTML = `
      <div class="saved-shortlist-head">
        <div><strong>Saved shortlist</strong><span>Save interesting pitches while you compare options.</span></div>
        <b>0</b>
      </div>`;
    return;
  }
  savedShortlistEl.innerHTML = `
    <div class="saved-shortlist-head">
      <div><strong>Saved shortlist</strong><span>${esc(rows.length)} saved pitch${rows.length === 1 ? '' : 'es'} kept on this browser.</span></div>
      <button type="button" data-shortlist-export>Export CSV</button>
    </div>
    <div class="saved-shortlist-list">
      ${rows.slice(0, 6).map(row => `
        <article>
          <div>
            <strong>${esc(row.name)}</strong>
            <span>${esc([row.county, row.date, row.route].filter(Boolean).join(' · '))}</span>
          </div>
          <button type="button" data-shortlist-remove="${esc(row.key)}">Remove</button>
        </article>`).join('')}
    </div>
    ${rows.length > 6 ? `<small>${esc(rows.length - 6)} more saved in CSV export.</small>` : ''}`;
}

function renderMetrics(data) {
  const rows = data.rows || [];
  const summary = data.status_summary || {};
  const recentlyChecked = Number(summary.fresh || 0);
  const placeLevel = rows.filter(row => ['place', 'exact'].includes(row.coordinate_precision)).length;
  const accessLabel = data.access === 'subscriber' ? 'Unlocked' : 'Preview';
  const savedCount = savedRows().length;
  metricsEl.innerHTML = `
    <article><b>${esc(data.count)}</b><span>matching opportunities</span></article>
    <article><b>${esc(recentlyChecked)}</b><span>checked in last 14 days</span></article>
    <article><b>${esc(placeLevel)}</b><span>place-level distance</span></article>
    <article><b>${esc(savedCount)}</b><span>saved to shortlist</span></article>
    <article><b>${accessLabel}</b><span>${esc(data.access === 'subscriber' ? 'Full source and application routes visible.' : 'Routes are hidden until trial signup.')}</span></article>`;
  statusEl.innerHTML = `<b>${esc(data.total)}</b><span>${esc(`${data.total} live opportunities`)}</span>`;
}

function storedAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAccount(data) {
  const account = {
    email: data.email || data.account_email || '',
    status: data.subscription_status || data.status || 'trialing',
    checked_at: new Date().toISOString()
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

function clearStoredAccess() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  document.cookie = 'pitchlist_session_id=; Path=/; Max-Age=0; SameSite=Lax; Secure';
  document.cookie = 'pitchlist_access_token=; Path=/; Max-Age=0; SameSite=Lax; Secure';
}

async function openBillingPortal(button) {
  const sessionId = storedSessionId();
  const accessToken = storedAccessToken();
  button.disabled = true;
  try {
    const response = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, access_token: accessToken })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Billing portal is not available yet');
    window.location.href = data.url;
  } catch (err) {
    resultsEl.innerHTML = `<div class="cloud-empty error"><strong>Portal unavailable</strong><span>${esc(err.message)}</span></div>`;
    button.disabled = false;
  }
}

function renderSubscriberControls(account, status) {
  subscriberAccess.innerHTML = `
    <div class="database-actions">
      <button type="button" class="ghost" data-manage-billing>Manage billing</button>
      <button type="button" class="ghost subtle" data-clear-access>Sign out</button>
    </div>
    <div class="database-account">
      <span>Access unlocked</span>
      <strong>${esc(account.email || 'Subscriber')}</strong>
      <small>${esc(`${status.charAt(0).toUpperCase()}${status.slice(1)} access. Full source links and application routes are unlocked on this browser.`)}</small>
    </div>`;
  subscriberAccess.querySelector('[data-manage-billing]').addEventListener('click', event => {
    openBillingPortal(event.currentTarget);
  });
  subscriberAccess.querySelector('[data-clear-access]').addEventListener('click', () => {
    clearStoredAccess();
    runSearch();
  });
}

function renderAccount(data) {
  if (data.access !== 'subscriber') {
    subscriberAccess.innerHTML = '';
    startTrial.hidden = false;
    startTrial.disabled = false;
    startTrial.textContent = 'Start free trial';
    accessForm.hidden = false;
    vendorSignup.hidden = false;
    if (data.access_reason === 'stripe_session_invalid') clearStoredAccess();
    return;
  }

  const account = saveAccount({ ...storedAccount(), ...data });
  const status = String(account.status || 'active').replace(/_/g, ' ');
  startTrial.hidden = true;
  accessForm.hidden = true;
  vendorSignup.hidden = true;
  renderSubscriberControls(account, status);
}

function vendorProfileFromForm() {
  const formData = new FormData(vendorSignup);
  const regions = String(formData.get('regions') || '')
    .split(/[,;\n]/)
    .map(item => item.trim())
    .filter(Boolean);
  return {
    business_name: String(formData.get('business_name') || '').trim(),
    contact_name: String(formData.get('contact_name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    base_postcode: String(formData.get('base_postcode') || '').trim(),
    specialty: String(formData.get('specialty') || '').trim(),
    regions,
    public_listing_opt_in: formData.get('public_listing_opt_in') === 'on',
    signup_source: 'database_page_trial_signup'
  };
}

function renderResults(rows) {
  latestRows = rows;
  if (!rows.length) {
    resultsEl.innerHTML = '<div class="cloud-empty"><strong>No matching opportunities</strong><span>Try a wider radius, fewer keywords, or a broader category.</span></div>';
    return;
  }
  const selected = new Set(savedRows().map(row => row.key));
  const summary = latestData
    ? `<div class="results-summary"><strong>Showing ${esc(rows.length)} of ${esc(latestData.count)} matches</strong><span>${esc(latestData.access === 'subscriber' ? 'Source links are unlocked.' : 'Preview rows show coverage; source links unlock after trial signup.')}</span></div>`
    : '';
  const cards = rows.slice(0, 75).map((row, index) => {
    const key = rowKey(row);
    const isSaved = selected.has(key);
    const preciseDistance = latestData && latestData.postcode_distance_ready && ['exact', 'place'].includes(row.coordinate_precision);
    const distance = row.distance_miles !== null && row.distance_miles !== undefined && preciseDistance
      ? `${row.distance_miles} miles from searched postcode`
      : latestData && latestData.postcode_distance_ready && row.coordinate_precision === 'area'
        ? `${row.county || row.region || row.coordinate_label} area match`
        : row.distance_miles !== null && row.distance_miles !== undefined && row.coordinate_label
          ? `${row.distance_miles} miles from ${row.coordinate_label}`
          : '';
    const meta = distance ? [distance, ...chips(row)] : chips(row);
    const lockedCopy = row.locked ? `Preview hides source and application route${row.source_host ? ` from ${row.source_host}` : ''}.` : 'Source and application route unlocked.';
    return `<article class="opportunity-card result-row ${esc(imageClass(row, index))} ${row.locked ? 'is-locked' : 'is-unlocked'}">
      <header>
        <strong class="result-title">${esc(displayName(row))}</strong>
        ${row.organiser && row.organiser !== displayName(row) ? `<span class="result-org">${esc(row.organiser)}</span>` : ''}
        <b class="result-checked">${esc(checkedLabel(row))}</b>
      </header>
      <div class="cloud-facts result-meta">
        ${meta.map(item => `<span>${esc(item)}</span>`).join('')}
      </div>
      <p>${esc(row.vendor_categories || row.notes || 'Trader categories to verify from source.')}</p>
      <div class="opportunity-lockline">${esc(lockedCopy)}</div>
      <footer>
        <button type="button" class="shortlist-toggle ${isSaved ? 'is-saved' : ''}" data-shortlist-key="${esc(key)}">${isSaved ? 'Saved' : 'Save'}</button>
        ${row.application_url ? `<a href="${esc(row.application_url)}" target="_blank" rel="noreferrer">Application route</a>` : ''}
        ${row.source_url ? `<a href="${esc(row.source_url)}" target="_blank" rel="noreferrer">Source</a>` : ''}
        ${row.locked ? `<span class="locked-pill">Locked${row.source_host ? `: ${esc(row.source_host)}` : ''}</span>` : ''}
      </footer>
    </article>`;
  }).join('');
  const more = latestData?.has_more
    ? '<div class="results-more"><button type="button" data-load-more>Show more matches</button></div>'
    : '';
  resultsEl.innerHTML = `${summary}<div class="result-grid">${cards}</div>${more}`;
}

function applyInboundSearchParams() {
  const params = new URLSearchParams(window.location.search);
  const postcode = params.get('postcode');
  const radius = params.get('radius') || params.get('radius_miles');
  const category = params.get('category');
  const q = params.get('q');
  const mappings = [
    ['postcode', postcode],
    ['radius_miles', radius],
    ['category', category],
    ['q', q]
  ];
  for (const [name, value] of mappings) {
    if (value === null || value === '') continue;
    const field = form.elements[name];
    if (field) field.value = value;
  }
}

function storedSessionId() {
  return localStorage.getItem(SESSION_KEY) || '';
}

function storedAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

async function verifyReturnedSession() {
  const url = new URL(window.location.href);
  const returned = url.searchParams.get('session_id');
  if (!returned) return;
  const response = await fetch(`/api/billing/session?session_id=${encodeURIComponent(returned)}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not verify subscription session');
  localStorage.setItem(SESSION_KEY, returned);
  saveAccount(data);
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', url.toString());
}

async function verifyReturnedAccessToken() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('access_token');
  if (!token) return;
  const response = await fetch(`/api/billing/access?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Access link is invalid or expired');
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  saveAccount(data);
  url.searchParams.delete('access_token');
  window.history.replaceState({}, '', url.toString());
}

function buildSearchParams(offset = 0) {
  const formData = new FormData(form);
  const params = new URLSearchParams(formData);
  params.set('limit', '50');
  if (offset > 0) params.set('offset', String(offset));
  const sessionId = storedSessionId();
  if (sessionId) params.set('session_id', sessionId);
  const token = storedAccessToken();
  if (token) params.set('access_token', token);
  for (const [key, value] of [...params.entries()]) {
    if (!String(value || '').trim()) params.delete(key);
  }
  return params;
}

async function runSearch({ append = false } = {}) {
  const params = append && latestData?.next_offset !== null
    ? buildSearchParams(Number(latestData.next_offset || 0))
    : buildSearchParams(0);
  if (!append) {
    latestRows = [];
    resultsEl.innerHTML = '<div class="cloud-empty"><strong>Searching</strong><span>Checking the protected PitchList database...</span></div>';
  }
  const response = await fetch(`/api/customer-opportunities/search?${params.toString()}`, { cache: 'no-store' });
  const text = await response.text();
  const data = JSON.parse(text);
  if (!response.ok) throw new Error(data.message || 'Search failed');
  const mergedRows = append ? [...latestRows, ...(data.rows || [])] : (data.rows || []);
  latestRows = mergedRows;
  latestData = { ...data, rows: mergedRows, returned: mergedRows.length };
  renderMetrics(data);
  renderAccount(data);
  renderResults(mergedRows);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  runSearch();
});

resultsEl.addEventListener('click', event => {
  if (event.target.closest('[data-load-more]')) {
    runSearch({ append: true });
    return;
  }
  const button = event.target.closest('[data-shortlist-key]');
  if (!button) return;
  toggleSaved(button.dataset.shortlistKey);
});

savedShortlistEl.addEventListener('click', event => {
  const removeButton = event.target.closest('[data-shortlist-remove]');
  if (removeButton) {
    removeSaved(removeButton.dataset.shortlistRemove);
    return;
  }
  if (event.target.closest('[data-shortlist-export]')) downloadShortlist();
});

vendorSignup.addEventListener('submit', async event => {
  event.preventDefault();
  startTrial.disabled = true;
  startTrial.textContent = 'Creating profile...';
  vendorSignupStatus.textContent = 'Creating your PitchList vendor profile...';
  try {
    const vendorProfile = vendorProfileFromForm();
    if (!vendorProfile.email) {
      throw new Error('Email is required.');
    }
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: vendorProfile.email,
        vendor_profile: vendorProfile
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Stripe checkout is not available yet');
    vendorSignupStatus.textContent = 'Opening Stripe...';
    window.location.href = data.url;
  } catch (err) {
    vendorSignupStatus.textContent = err.message;
    resultsEl.innerHTML = `<div class="cloud-empty error"><strong>Checkout unavailable</strong><span>${esc(err.message)}</span></div>`;
    startTrial.disabled = false;
    startTrial.textContent = 'Start free trial';
  }
});

accessForm.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(accessForm);
  const email = String(formData.get('email') || '').trim();
  accessFormStatus.textContent = 'Checking access...';
  try {
    const response = await fetch('/api/billing/access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not create access link');
    if (data.preview_url) {
      accessFormStatus.innerHTML = `Staging link ready: <a href="${esc(data.preview_url)}">unlock this browser</a>`;
    } else {
      accessFormStatus.textContent = data.sent ? 'Access link sent. Check your email.' : data.message;
    }
  } catch (err) {
    accessFormStatus.textContent = err.message;
  }
});

Promise.resolve()
  .then(verifyReturnedSession)
  .then(verifyReturnedAccessToken)
  .then(applyInboundSearchParams)
  .then(runSearch)
  .catch(err => {
  resultsEl.innerHTML = `<div class="cloud-empty error"><strong>Database unavailable</strong><span>${esc(err.message)}</span></div>`;
  });
renderShortlist();
