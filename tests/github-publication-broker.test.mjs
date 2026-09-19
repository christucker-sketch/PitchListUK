import assert from 'node:assert/strict';
import test from 'node:test';

import {
  openUkAdditionPullRequest,
  readMainMarketSnapshot
} from '../operations/cloudflare-global-acquisition/lib/github-publication.mjs';

function encoded(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

test('UK production snapshot reads through the GitHub service broker without a local GitHub token', async () => {
  const mainSha = 'a'.repeat(40);
  const fileSha = 'b'.repeat(40);
  const snapshot = {
    exported_at: '2026-09-19T08:00:00.000Z',
    source: 'broker-regression-test',
    total: 1,
    rows: [{ id: 'OPP-TEST', country: 'United Kingdom' }]
  };
  const requests = [];
  const env = {
    GITHUB_PR_BROKER: {
      async fetch(request) {
        const payload = await request.json();
        requests.push(payload);
        if (payload.path === '/git/ref/heads/main') {
          return Response.json({ ok: true, github_status: 200, github_body: { object: { sha: mainSha } } });
        }
        if (payload.path === '/contents/functions/_data/opportunities.mjs?ref=main') {
          return Response.json({
            ok: true,
            github_status: 200,
            github_body: {
              sha: fileSha,
              content: encoded(`export const opportunitySnapshot = ${JSON.stringify(snapshot, null, 2)};\n`)
            }
          });
        }
        return Response.json({ ok: false, error: 'unexpected_path' }, { status: 400 });
      }
    }
  };

  const result = await readMainMarketSnapshot(env, 'UK');
  assert.equal(result.mainSha, mainSha);
  assert.equal(result.fileSha, fileSha);
  assert.deepEqual(result.snapshot, snapshot);
  assert.deepEqual(requests.map(item => item.action), ['publication_request', 'publication_request']);
  assert.equal('GITHUB_TOKEN' in env, false);
});

test('UK opportunity publication creates its guarded data PR entirely through the GitHub broker', async () => {
  const mainSha = 'c'.repeat(40);
  const fileSha = 'd'.repeat(40);
  const baseSnapshot = { exported_at: '2026-08-27T00:00:00.000Z', source: 'base', total: 0, rows: [] };
  const row = { id: 'OPP-BROKER-NEW', country: 'United Kingdom', source_url: 'https://example.gov.uk/trade' };
  const nextSnapshot = { exported_at: '2026-09-19T08:00:00.000Z', source: 'broker-growth', total: 1, rows: [row] };
  const manifest = {
    changes: { additions: [{ row }] },
    automation: { held_existing_routes: [] }
  };
  const calls = [];
  const env = {
    GITHUB_REPO: 'christucker-sketch/PitchListUK',
    GITHUB_PR_BROKER: {
      async fetch(input, init) {
        const request = input instanceof Request ? input : new Request(input, init);
        const payload = await request.json();
        calls.push({ host: new URL(request.url).hostname, payload });
        if (payload.action !== 'publication_request') {
          return Response.json({ ok: true, created: true, reused: false, pr_number: 2001, pr_url: 'https://github.com/christucker-sketch/PitchListUK/pull/2001' });
        }
        if (payload.path === '/git/ref/heads/main') return Response.json({ ok: true, github_status: 200, github_body: { object: { sha: mainSha } } });
        if (payload.path.startsWith('/git/ref/heads/data%2F')) return Response.json({ ok: true, github_status: 404, github_body: { message: 'Not Found' } });
        if (payload.method === 'POST' && payload.path === '/git/refs') return Response.json({ ok: true, github_status: 201, github_body: { ref: payload.body.ref } });
        if (payload.method === 'GET' && payload.path.startsWith('/contents/functions/_data/opportunities.mjs?ref=')) {
          return Response.json({ ok: true, github_status: 200, github_body: { sha: fileSha, content: encoded(`export const opportunitySnapshot = ${JSON.stringify(baseSnapshot, null, 2)};\n`) } });
        }
        if (payload.method === 'PUT' && payload.path === '/contents/functions/_data/opportunities.mjs') return Response.json({ ok: true, github_status: 200, github_body: { content: { sha: 'e'.repeat(40) } } });
        if (payload.method === 'GET' && payload.path.startsWith('/contents/public/index.html?ref=')) {
          return Response.json({ ok: true, github_status: 200, github_body: { sha: 'f'.repeat(40), content: encoded('<strong id="liveDatabaseCount">0</strong>') } });
        }
        if (payload.method === 'PUT' && payload.path === '/contents/public/index.html') return Response.json({ ok: true, github_status: 200, github_body: { content: { sha: '1'.repeat(40) } } });
        if (payload.method === 'GET' && payload.path.startsWith('/pulls?')) return Response.json({ ok: true, github_status: 200, github_body: [] });
        return Response.json({ ok: false, error: `unexpected:${payload.method}:${payload.path}` }, { status: 400 });
      }
    }
  };

  const result = await openUkAdditionPullRequest(env, {
    base: { country: 'UK', mainSha, snapshot_path: 'functions/_data/opportunities.mjs', snapshot: baseSnapshot },
    manifest,
    nextSnapshot,
    reviewed_row_count: 1
  });
  assert.equal(result.created, true);
  assert.equal(result.pr_number, 2001);
  assert.equal(result.additions, 1);
  assert.equal(calls.some(call => call.payload.action === 'publication_request' && call.payload.method === 'PUT'), true);
  assert.equal(calls.at(-1).host, 'findpitches-github-pr.internal');
  assert.equal('GITHUB_TOKEN' in env, false);
});
