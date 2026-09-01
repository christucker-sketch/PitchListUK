const form = document.getElementById('cloudSearch');
const statusEl = document.getElementById('databaseStatus');
const metricsEl = document.getElementById('cloudMetrics');
const resultsEl = document.getElementById('cloudResults');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function formatUsDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '');
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function dateLabel(row) {
  if (!row.event_start) return row.recurring ? 'Recurring opportunity' : 'Dates vary';
  const start = formatUsDate(row.event_start);
  const end = row.event_end && row.event_end !== row.event_start ? formatUsDate(row.event_end) : '';
  return end ? `${start} to ${end}` : start;
}

function categories(row) {
  const values = Array.isArray(row.vendor_categories) ? row.vendor_categories : [];
  return values.map(value => String(value).replace(/_/g, ' ')).join(' · ');
}

function applyInboundParams() {
  const params = new URLSearchParams(window.location.search);
  for (const name of ['zip', 'radius_miles', 'category', 'q']) {
    const alias = name === 'radius_miles' ? (params.get('radius_miles') || params.get('radius')) : params.get(name);
    if (alias && form.elements[name]) form.elements[name].value = alias;
  }
}

function buildParams() {
  const params = new URLSearchParams(new FormData(form));
  params.set('limit', '75');
  for (const [key, value] of [...params.entries()]) {
    if (!String(value || '').trim()) params.delete(key);
  }
  return params;
}

function render(data) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  statusEl.innerHTML = `<b>${esc(data.total ?? rows.length)}</b><span>matching US opportunities</span>`;
  metricsEl.innerHTML = `
    <article><b>${esc(data.total ?? rows.length)}</b><span>matching opportunities</span></article>
    <article><b>50</b><span>states in the acquisition network</span></article>
    <article><b>CHECKED</b><span>first-party source evidence</span></article>
    <article><b>LIVE</b><span>coverage grows as new opportunities pass quality gates</span></article>`;

  if (!rows.length) {
    resultsEl.innerHTML = '<div class="cloud-empty"><strong>No matches yet</strong><span>Try widening the distance, removing a category, or changing the keyword. FindPitches coverage is expanding continuously.</span></div>';
    return;
  }

  resultsEl.innerHTML = `<div class="results-summary"><strong>Showing ${esc(rows.length)} matches</strong><span>Search results come from the current FindPitches US opportunity dataset.</span></div><div class="result-grid">${rows.map(row => `
    <article class="opportunity-card result-row is-locked">
      <header>
        <strong class="result-title">${esc(row.event_name || row.organiser || 'Vendor opportunity')}</strong>
        ${row.organiser ? `<span class="result-org">${esc(row.organiser)}</span>` : ''}
      </header>
      <div class="cloud-facts result-meta">
        <span>${esc(row.locality || row.location || row.region_name || 'United States')}</span>
        <span>${esc(dateLabel(row))}</span>
        ${row.application_deadline ? `<span>Apply by ${esc(formatUsDate(row.application_deadline))}</span>` : ''}
        ${row.opportunity_type ? `<span>${esc(String(row.opportunity_type).replace(/_/g, ' '))}</span>` : ''}
      </div>
      <p>${esc(categories(row) || 'Vendor categories available from the checked source.')}</p>
      <div class="opportunity-lockline">Checked source and application details are shown according to the current access rules.</div>
      <footer><span class="locked-pill">Opportunity</span></footer>
    </article>`).join('')}</div>`;
}

async function runSearch() {
  resultsEl.innerHTML = '<div class="cloud-empty"><strong>Searching</strong><span>Checking FindPitches US opportunities...</span></div>';
  const params = buildParams();
  const response = await fetch(`/api/us-customer-opportunities/search?${params.toString()}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Search failed');
  if (window.pitchlistTrack) {
    window.pitchlistTrack('us_database_search', {
      state: 'US',
      radius: params.get('radius_miles') || '',
      category: params.get('category') || '',
      count: data.total ?? ''
    });
  }
  render(data);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  runSearch().catch(err => {
    resultsEl.innerHTML = `<div class="cloud-empty error"><strong>Finder unavailable</strong><span>${esc(err.message)}</span></div>`;
  });
});

applyInboundParams();
runSearch().catch(err => {
  resultsEl.innerHTML = `<div class="cloud-empty error"><strong>Finder unavailable</strong><span>${esc(err.message)}</span></div>`;
});
