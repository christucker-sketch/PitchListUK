const INTERNAL_URL = 'https://findpitches-github-pr.internal/pulls';
const INTERNAL_MARKER = 'findpitches-service-binding-v1';

export async function openPullRequestViaBroker(env, payload = {}) {
  if (!env?.GITHUB_PR_BROKER?.fetch) throw new Error('GitHub PR broker binding is unavailable');
  const response = await env.GITHUB_PR_BROKER.fetch(INTERNAL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-findpitches-internal-service': INTERNAL_MARKER },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) throw new Error(`GitHub PR broker failed: ${body?.error || response.status}`);
  return Object.freeze(body);
}
