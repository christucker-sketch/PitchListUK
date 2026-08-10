const authForm = document.getElementById('activityAuth');
const statusEl = document.getElementById('activityStatus');
const totalsEl = document.getElementById('activityTotals');
const campaignsEl = document.getElementById('activityCampaigns');
const referrersEl = document.getElementById('activityReferrers');
const pagesEl = document.getElementById('activityPages');
const eventsEl = document.getElementById('activityEvents');
const searchesEl = document.getElementById('activitySearches');
const recentEl = document.getElementById('activityRecent');
const TOKEN_KEY = 'pitchlist_activity_token';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function metric(label, value) {
  return `<article><b>${esc(value)}</b><span>${esc(label)}</span></article>`;
}

function listMap(map, empty = 'No data yet') {
  const rows = Object.entries(map || {});
  if (!rows.length) return `<p class="activity-empty">${esc(empty)}</p>`;
  return `<div class="activity-list">${rows.map(([key, value]) => `<div><span>${esc(key)}</span><b>${esc(value)}</b></div>`).join('')}</div>`;
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

function renderSearches(rows) {
  if (!rows.length) return '<p class="activity-empty">No pitch finder searches yet.</p>';
  return `<table class="activity-table"><thead><tr><th>Time</th><th>Postcode</th><th>Radius</th><th>Category</th><th>Keywords</th><th>Access</th><th>Matches</th></tr></thead><tbody>${rows.map(row => `
    <tr>
      <td>${esc(formatTime(row.ts))}</td>
      <td>${esc(row.postcode || '-')}</td>
      <td>${esc(row.radius || '-')}</td>
      <td>${esc(row.category || '-')}</td>
      <td>${esc(row.q || '-')}</td>
      <td>${esc(row.access || '-')}</td>
      <td>${esc(row.count || 0)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function renderRecent(rows) {
  if (!rows.length) return '<p class="activity-empty">No events yet.</p>';
  return `<table class="activity-table"><thead><tr><th>Time</th><th>Event</th><th>Path</th><th>Campaign</th><th>Referrer</th></tr></thead><tbody>${rows.map(row => `
    <tr>
      <td>${esc(formatTime(row.ts))}</td>
      <td>${esc(row.event)}</td>
      <td>${esc(row.path)}</td>
      <td>${esc([row.campaign?.source, row.campaign?.medium, row.campaign?.campaign].filter(Boolean).join(' / ') || '-')}</td>
      <td>${esc(row.referrer_host || '-')}</td>
    </tr>`).join('')}</tbody></table>`;
}

function render(data) {
  const totals = data.totals || {};
  totalsEl.innerHTML = [
    metric('events', totals.events || 0),
    metric('visitors', totals.visitors || 0),
    metric('page views', totals.page_views || 0),
    metric('Pitch searches', totals.database_searches || 0),
    metric('checkout starts', totals.checkout_starts || 0),
    metric('checkout returns', totals.checkout_returns || 0)
  ].join('');
  campaignsEl.innerHTML = listMap(data.campaigns, 'No campaign tags yet.');
  referrersEl.innerHTML = listMap(data.referrers, 'No external referrers yet.');
  pagesEl.innerHTML = listMap(data.top_paths, 'No page views yet.');
  eventsEl.innerHTML = listMap(data.by_event, 'No events yet.');
  searchesEl.innerHTML = renderSearches(data.searches || []);
  recentEl.innerHTML = renderRecent(data.recent || []);
}

async function loadActivity(token, days) {
  statusEl.textContent = 'Loading activity...';
  const response = await fetch(`/api/analytics/summary?days=${encodeURIComponent(days)}&token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load activity');
  render(data);
  statusEl.textContent = data.stored
    ? `Showing the last ${data.days} day${data.days === 1 ? '' : 's'}, generated ${formatTime(data.generated_at)}.`
    : 'Analytics storage is not configured yet. Add the KV binding before relying on this.';
}

authForm.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(authForm);
  const token = String(formData.get('token') || '').trim();
  const days = String(formData.get('days') || '7');
  if (!token) {
    statusEl.textContent = 'Token required.';
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  loadActivity(token, days).catch(err => {
    statusEl.textContent = err.message;
  });
});

const savedToken = localStorage.getItem(TOKEN_KEY) || '';
if (savedToken) {
  authForm.elements.token.value = savedToken;
  loadActivity(savedToken, authForm.elements.days.value).catch(err => {
    statusEl.textContent = err.message;
  });
}
