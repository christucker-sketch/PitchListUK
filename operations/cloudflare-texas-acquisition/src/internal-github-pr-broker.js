const INTERNAL_HOST = 'findpitches-github-pr.internal';
const INTERNAL_PATH = '/pulls';
const INTERNAL_MARKER = 'findpitches-service-binding-v1';
const ALLOWED_HEAD = /^(?:sources\/cloud-uk-growth-|data\/cloud-uk-approved-additions-)[a-z0-9-]+$/i;
const MAX_TEXT = 12000;

function requireEnv(env, key) {
  const value = String(env?.[key] || '').trim();
  if (!value) throw new Error(`Missing required secret/config: ${key}`);
  return value;
}

export function isInternalGithubPrRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return request.method === 'POST'
    && url.hostname === INTERNAL_HOST
    && url.pathname === INTERNAL_PATH
    && request.headers.get('x-findpitches-internal-service') === INTERNAL_MARKER;
}

export function validateInternalGithubPrPayload(payload = {}) {
  const head = String(payload.head || '').trim();
  const base = String(payload.base || '').trim();
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '');
  if (!ALLOWED_HEAD.test(head)) throw new Error('internal_github_pr_head_rejected');
  if (base !== 'main') throw new Error('internal_github_pr_base_rejected');
  if (!title || title.length > 200) throw new Error('internal_github_pr_title_invalid');
  if (body.length > MAX_TEXT) throw new Error('internal_github_pr_body_too_large');
  return Object.freeze({ head, base, title, body });
}

export async function handleInternalGithubPrRequest(request, env, options = {}) {
  if (!isInternalGithubPrRequest(request)) return new Response('Not found', { status: 404 });
  let payload;
  try { payload = validateInternalGithubPrPayload(await request.json()); }
  catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 }); }

  const repo = requireEnv(env, 'GITHUB_REPO');
  const owner = repo.split('/')[0];
  const fetchImpl = options.fetchImpl || fetch;
  const headers = {
    authorization: `Bearer ${requireEnv(env, 'GITHUB_TOKEN')}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'findpitches-internal-pr-broker'
  };

  const existingResponse = await fetchImpl(`https://api.github.com/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${payload.head}`)}&base=main`, { headers });
  if (!existingResponse.ok) return Response.json({ ok: false, error: `github_lookup_http_${existingResponse.status}` }, { status: 502 });
  const existing = await existingResponse.json();
  if (Array.isArray(existing) && existing.length) {
    const pr = existing[0];
    return Response.json({ ok: true, created: false, reused: true, pr_number: pr.number, pr_url: pr.html_url });
  }

  const response = await fetchImpl(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST', headers, body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return Response.json({ ok: false, error: `github_pr_http_${response.status}`, message: body?.message || '' }, { status: 502 });
  return Response.json({ ok: true, created: true, reused: false, pr_number: body.number, pr_url: body.html_url });
}

export const INTERNAL_GITHUB_PR_BROKER = Object.freeze({ host: INTERNAL_HOST, path: INTERNAL_PATH, marker: INTERNAL_MARKER });
