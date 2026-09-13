const form = document.getElementById('cloudSearch');
const statusEl = document.getElementById('databaseStatus');
const metricsEl = document.getElementById('cloudMetrics');
const resultsEl = document.getElementById('cloudResults');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function formatCaDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '');
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function dateLabel(row) {
  if (!row.event_start) return row.recurring ? 'Recurring opportunity' : 'Dates vary';
  const start = formatCaDate(row.event_start);
  const end = row.event_end && row.event_end !== row.event_start ? formatCaDate(row.event_end) : '';
  return end ? `${start} to ${end}` : start;
}

function categories(row) {
  const values = Array.isArray(row.vendor_categories) ? row.vendor_categories : [];
  return values.map(value => String(value).replace(/_/g, ' ')).join(' · ');
}

function regionLabel(row) {
  return row.region || row.region_name || row.province || row.territory || row.region_code || 'Canada';
}

function applyInboundParams() {
  const params = new URLSearchParams(window.location.search);
  for (const name of ['province', 'category', 'q']) {
    const value = params.get(name) || (name === 'province' ? params.get('region_code') : '');
    if (value && form.elements[name]) form.elements[name].value = value;
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

function resultActions(row, data) {
  if (data.access_mode !== 'subscriber' || !row.application_url) {
    return '<span class="locked-pill">Opportunity</span>';
  }
  const source = row.source_url ? `<a href="${esc(row.source_url)}" target="_blank" rel="noopener noreferrer">Source</a>` : '';
  return `<a class="apply-link" href="${esc(row.application_url)}" target="_blank" rel="noopener noreferrer">Apply / enquire</a>${source}`;
}

function render(data) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  statusEl.innerHTML = `<b>${esc(data.total ?? rows.length)}</b><span>matching Canadian opportunities</span>`;
  metricsEl.innerHTML = `
    <article><b>${esc(data.total ?? rows.length)}</b><span>matching opportunities</span></article>
    <article><b>13</b><span>provinces and territories covered</span></article>
    <article><b>CHECKED</b><span>first-party source evidence</span></article>
    <article><b>CAD</b><span>Canadian market semantics</span></article>`;

  if (!rows.length) {
    resultsEl.innerHTML = '<div class="cloud-empty"><strong>No matches yet</strong><span>Try all Canada, remove a category, or change the keyword. Coverage grows only as opportunities pass the Canadian quality gates.</span></div>';
    return;
  }

  resultsEl.innerHTML = `<div class="results-summary"><strong>Showing ${esc(rows.length)} matches</strong><span>Search results come only from the dedicated FindPitches Canada production snapshot.</span></div><div class="result-grid">${rows.map(row => `
    <article class="opportunity-card result-row ${data.access_mode === 'subscriber' ? '' : 'is-locked'}">
      <header>
        <strong class="result-title">${esc(row.event_name || row.organiser || 'Vendor opportunity')}</strong>
        ${row.organiser ? `<span class="result-org">${esc(row.organiser)}</span>` : ''}
      </header>
      <div class="cloud-facts result-meta">
        <span>${esc(row.locality || row.location || regionLabel(row))}</span>
        <span>${esc(regionLabel(row))}</span>
        <span>${esc(dateLabel(row))}</span>
        ${row.application_deadline ? `<span>Apply by ${esc(formatCaDate(row.application_deadline))}</span>` : ''}
        ${row.opportunity_type ? `<span>${esc(String(row.opportunity_type).replace(/_/g, ' '))}</span>` : ''}
      </div>
      <p>${esc(categories(row) || 'Vendor categories available from the checked source.')}</p>
      <div class="opportunity-lockline">${data.access_mode === 'subscriber' ? 'Checked application and source routes available.' : 'Application and source routes unlock with subscriber access.'}</div>
      <footer>${resultActions(row, data)}</footer>
    </article>`).join('')}</div>`;
}

async function runSearch() {
  resultsEl.innerHTML = '<div class="cloud-empty"><strong>Searching</strong><span>Checking FindPitches Canada opportunities...</span></div>';
  const params = buildParams();
  const response = await fetch(`/api/ca-customer-opportunities/search?${params.toString()}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'Search failed');
  if (window.pitchlistTrack) {
    window.pitchlistTrack('ca_database_search', {
      region: params.get('province') || 'CA',
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
