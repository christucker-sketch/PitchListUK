const INTERNAL_HOST = 'findpitches-github-controller.internal';
const INTERNAL_PATH = '/controller-pr';
const INTERNAL_MARKER = 'findpitches-controller-service-v1';
const ALLOWED_HEAD = /^(?:sources\/cloud-us-|data\/cloud-us-)[a-z0-9-]+$/i;

function requireEnv(env, key) {
  const value = String(env?.[key] || '').trim();
  if (!value) throw new Error(`Missing required secret/config: ${key}`);
  return value;
}

function headers(env) {
  return {
    authorization: `Bearer ${requireEnv(env, 'GITHUB_TOKEN')}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'findpitches-controller-pr-broker'
  };
}

export function isInternalGithubControllerRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return request.method === 'POST'
    && url.hostname === INTERNAL_HOST
    && url.pathname === INTERNAL_PATH
    && request.headers.get('x-findpitches-internal-service') === INTERNAL_MARKER;
}

function validatePayload(payload = {}) {
  const action = String(payload.action || 'inspect');
  const prNumber = Number(payload.pr_number);
  if (!['inspect', 'merge'].includes(action)) throw new Error('controller_github_action_rejected');
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('controller_github_pr_number_invalid');
  const expectedHeadSha = String(payload.expected_head_sha || '').trim().toLowerCase();
  if (action === 'merge' && !/^[a-f0-9]{40}$/.test(expectedHeadSha)) throw new Error('controller_github_expected_head_sha_invalid');
  return { action, prNumber, expectedHeadSha };
}

async function githubJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`github_http_${response.status}:${String(body?.message || '')}`);
  return body;
}

async function inspectPr(fetchImpl, repo, authHeaders, prNumber) {
  const baseUrl = `https://api.github.com/repos/${repo}`;
  const pr = await githubJson(fetchImpl, `${baseUrl}/pulls/${prNumber}`, { headers: authHeaders });
  const head = String(pr?.head?.ref || '');
  if (!ALLOWED_HEAD.test(head)) throw new Error('controller_github_pr_head_rejected');
  if (String(pr?.base?.ref || '') !== 'main') throw new Error('controller_github_pr_base_rejected');

  const [files, commits, checkRuns] = await Promise.all([
    githubJson(fetchImpl, `${baseUrl}/pulls/${prNumber}/files?per_page=100`, { headers: authHeaders }),
    githubJson(fetchImpl, `${baseUrl}/pulls/${prNumber}/commits?per_page=100`, { headers: authHeaders }),
    githubJson(fetchImpl, `${baseUrl}/commits/${pr.head.sha}/check-runs?per_page=100`, { headers: authHeaders })
  ]);

  return {
    number: pr.number,
    state: String(pr.state || '').toUpperCase(),
    merged: Boolean(pr.merged),
    draft: Boolean(pr.draft),
    mergeable: pr.mergeable,
    mergeable_state: pr.mergeable_state || null,
    base_ref: pr.base.ref,
    base_sha: pr.base.sha,
    head_ref: head,
    head_sha: pr.head.sha,
    body: String(pr.body || ''),
    files: Array.isArray(files) ? files.map(file => ({ path: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes })) : [],
    commits: Array.isArray(commits) ? commits.map(commit => ({ sha: commit.sha, parents: Array.isArray(commit.parents) ? commit.parents.map(parent => parent.sha) : [] })) : [],
    check_runs: Array.isArray(checkRuns?.check_runs) ? checkRuns.check_runs.map(run => ({ name: run.name, status: run.status, conclusion: run.conclusion })) : []
  };
}

export async function handleInternalGithubControllerRequest(request, env, options = {}) {
  if (!isInternalGithubControllerRequest(request)) return new Response('Not found', { status: 404 });
  let payload;
  try { payload = validatePayload(await request.json()); }
  catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 }); }

  const repo = requireEnv(env, 'GITHUB_REPO');
  const fetchImpl = options.fetchImpl || fetch;
  const authHeaders = headers(env);

  try {
    const inspection = await inspectPr(fetchImpl, repo, authHeaders, payload.prNumber);
    if (payload.action === 'inspect') return Response.json({ ok: true, pr: inspection });

    if (inspection.state !== 'OPEN' || inspection.merged || inspection.draft) throw new Error('controller_github_pr_not_open_mergeable_candidate');
    if (inspection.head_sha.toLowerCase() !== payload.expectedHeadSha) throw new Error('controller_github_pr_head_sha_mismatch');
    const merge = await githubJson(fetchImpl, `https://api.github.com/repos/${repo}/pulls/${payload.prNumber}/merge`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ sha: payload.expectedHeadSha, merge_method: 'merge' })
    });
    if (!merge?.merged || !/^[a-f0-9]{40}$/i.test(String(merge.sha || ''))) throw new Error('controller_github_merge_not_confirmed');
    return Response.json({ ok: true, merged: true, merge_sha: merge.sha, pr_number: payload.prNumber });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
  }
}

export const INTERNAL_GITHUB_CONTROLLER_BROKER = Object.freeze({ host: INTERNAL_HOST, path: INTERNAL_PATH, marker: INTERNAL_MARKER });
