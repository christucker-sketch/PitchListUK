import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectCaFrontendDeployment,
  validateCaDataPr
} from '../operations/cloudflare-global-acquisition/lib/ca-controller-data-pr.mjs';

function result() {
  return {
    production_count_before: 4,
    production_count_after_planned: 6,
    manifest_additions: 2,
    opportunity_ids: ['CA-OPP-AAAAAAAAAAAA', 'CA-OPP-BBBBBBBBBBBB'],
    opportunity_pr: {
      pr_number: 1900,
      branch: 'data/cloud-ca-approved-additions-1234567890abcdef-base-1234567890abcdef',
      additions: 2
    }
  };
}

function pr(overrides = {}) {
  return {
    number: 1900,
    state: 'OPEN',
    merged: false,
    draft: false,
    base_ref: 'main',
    base_sha: '1'.repeat(40),
    head_ref: 'data/cloud-ca-approved-additions-1234567890abcdef-base-1234567890abcdef',
    head_sha: '2'.repeat(40),
    files: ['functions/_data/ca-opportunities.mjs'],
    body: [
      '- production snapshot: 4 -> 6',
      '- net-new additions: 2',
      '- updates: forbidden',
      '- removals: forbidden',
      '- approved-source direct fetch only',
      '- Serper credits: 0',
      '- automatic merge: disabled',
      '- direct production deployment: disabled',
      '- CA-OPP-AAAAAAAAAAAA: https://www.ontario.ca/a; jurisdiction=CA-ON',
      '- CA-OPP-BBBBBBBBBBBB: https://www.ontario.ca/b; jurisdiction=CA-ON'
    ].join('\n'),
    check_runs: [{ id: 1, name: 'verify', status: 'completed', conclusion: 'success' }],
    ...overrides
  };
}

async function withGitHubFetchMock(handler, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const body = await handler(url);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function controllerEnvForDeployment(mergeSha, checkRuns) {
  return {
    GITHUB_REPO: 'christucker-sketch/PitchListUK',
    GITHUB_PR_BROKER: {
      fetch: async request => {
        const payload = await request.json();
        assert.deepEqual(payload, { action: 'inspect_data_merge_checks', pr_number: 1900 });
        return Response.json({
          ok: true,
          deployment: {
            pr_number: 1900,
            merge_sha: mergeSha,
            check_runs: checkRuns,
            changed_files: ['functions/_data/ca-opportunities.mjs']
          }
        });
      }
    }
  };
}

test('Canada data PR gate accepts exact additions-only evidence after CI succeeds', () => {
  const validated = validateCaDataPr(result(), pr());
  assert.equal(validated.ready, true);
  assert.equal(validated.pr_number, 1900);
  assert.equal(validated.additions, 2);
  assert.equal(validated.before, 4);
  assert.equal(validated.after, 6);
  assert.deepEqual(validated.opportunity_ids, ['CA-OPP-AAAAAAAAAAAA', 'CA-OPP-BBBBBBBBBBBB']);
});

test('Canada data PR gate ignores superseded failed attempts but blocks on the latest failed attempt', () => {
  const recovered = validateCaDataPr(result(), pr({
    check_runs: [
      { id: 10, name: 'verify', status: 'completed', conclusion: 'failure' },
      { id: 20, name: 'verify', status: 'completed', conclusion: 'success' }
    ]
  }));
  assert.equal(recovered.ready, true);

  const regressed = validateCaDataPr(result(), pr({
    check_runs: [
      { id: 20, name: 'verify', status: 'completed', conclusion: 'success' },
      { id: 30, name: 'verify', status: 'completed', conclusion: 'failure' }
    ]
  }));
  assert.equal(regressed.ready, false);
});

test('Canada data PR gate remains pending while checks are incomplete', () => {
  const validated = validateCaDataPr(result(), pr({
    check_runs: [{ id: 1, name: 'verify', status: 'in_progress', conclusion: null }]
  }));
  assert.equal(validated.ready, false);
});

test('Canada data PR gate rejects wider file scope and count drift', () => {
  assert.throws(() => validateCaDataPr(result(), pr({
    files: ['functions/_data/ca-opportunities.mjs', 'public/ca/index.html']
  })), /file_scope/);

  const drift = result();
  drift.production_count_after_planned = 7;
  assert.throws(() => validateCaDataPr(drift, pr()), /count_delta/);
});

test('Canada data PR gate rejects substituted IDs, missing receipts and branch drift', () => {
  const substituted = result();
  substituted.opportunity_ids = ['CA-OPP-AAAAAAAAAAAA', 'CA-OPP-CCCCCCCCCCCC'];
  assert.throws(() => validateCaDataPr(substituted, pr()), /receipt_missing/);
  assert.throws(() => validateCaDataPr(result(), pr({ body: '- production snapshot: 4 -> 6' })), /body_evidence/);
  assert.throws(() => validateCaDataPr(result(), pr({ head_ref: 'data/cloud-us-approved-additions-1234' })), /head_invalid|branch_mismatch/);
});

test('Canada frontend deployment accepts exact verified deployment on the data merge SHA', async () => {
  const mergeSha = 'a'.repeat(40);
  const env = controllerEnvForDeployment(mergeSha, [
    { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
    { id: 20, name: 'deploy_frontend_production', status: 'completed', conclusion: 'success' }
  ]);
  const inspected = await inspectCaFrontendDeployment(env, 1900, mergeSha);
  assert.equal(inspected.ready, true);
  assert.equal(inspected.recovery, false);
  assert.equal(inspected.deployment_sha, mergeSha);
});

test('Canada frontend deployment can recover through a verified descendant only when the snapshot blob is unchanged', async () => {
  const mergeSha = 'a'.repeat(40);
  const mainSha = 'b'.repeat(40);
  const snapshotSha = 'c'.repeat(40);
  const env = controllerEnvForDeployment(mergeSha, [
    { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
    { id: 20, name: 'deploy_frontend_production', status: 'completed', conclusion: 'skipped' }
  ]);
  await withGitHubFetchMock(url => {
    if (url.pathname === `/repos/christucker-sketch/PitchListUK/commits/${mergeSha}/check-runs`) {
      return {
        check_runs: [
          { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
          { id: 20, name: 'deploy_frontend_production', status: 'completed', conclusion: 'skipped' }
        ]
      };
    }
    if (url.pathname === '/repos/christucker-sketch/PitchListUK/git/ref/heads/main') return { object: { sha: mainSha } };
    if (url.pathname === `/repos/christucker-sketch/PitchListUK/compare/${mergeSha}...${mainSha}`) {
      return { status: 'ahead', merge_base_commit: { sha: mergeSha } };
    }
    if (url.pathname === '/repos/christucker-sketch/PitchListUK/contents/functions/_data/ca-opportunities.mjs') {
      assert.ok([mergeSha, mainSha].includes(url.searchParams.get('ref')));
      return { sha: snapshotSha };
    }
    if (url.pathname === `/repos/christucker-sketch/PitchListUK/commits/${mainSha}/check-runs`) {
      return {
        check_runs: [
          { id: 30, name: 'verify', status: 'completed', conclusion: 'success' },
          { id: 40, name: 'deploy_frontend_production', status: 'completed', conclusion: 'success' }
        ]
      };
    }
    if (url.pathname === `/repos/christucker-sketch/PitchListUK/commits/${mainSha}`) {
      return { files: [{ filename: '.github/workflows/ca-opportunity-frontend-deploy.yml' }] };
    }
    throw new Error(`Unexpected GitHub path: ${url.pathname}${url.search}`);
  }, async () => {
    const inspected = await inspectCaFrontendDeployment(env, 1900, mergeSha);
    assert.equal(inspected.ready, true);
    assert.equal(inspected.recovery, true);
    assert.equal(inspected.deployment_sha, mainSha);
    assert.equal(inspected.recovered_from_merge_sha, mergeSha);
    assert.equal(inspected.snapshot_blob_sha, snapshotSha);
  });
});

test('Canada frontend recovery fails closed if the Canadian snapshot changed after the pending data merge', async () => {
  const mergeSha = 'a'.repeat(40);
  const mainSha = 'b'.repeat(40);
  const env = controllerEnvForDeployment(mergeSha, [
    { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
    { id: 20, name: 'deploy_frontend_production', status: 'completed', conclusion: 'skipped' }
  ]);
  await withGitHubFetchMock(url => {
    if (url.pathname === `/repos/christucker-sketch/PitchListUK/commits/${mergeSha}/check-runs`) {
      return {
        check_runs: [
          { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
          { id: 20, name: 'deploy_frontend_production', status: 'completed', conclusion: 'skipped' }
        ]
      };
    }
    if (url.pathname === '/repos/christucker-sketch/PitchListUK/git/ref/heads/main') return { object: { sha: mainSha } };
    if (url.pathname === `/repos/christucker-sketch/PitchListUK/compare/${mergeSha}...${mainSha}`) {
      return { status: 'ahead', merge_base_commit: { sha: mergeSha } };
    }
    if (url.pathname === '/repos/christucker-sketch/PitchListUK/contents/functions/_data/ca-opportunities.mjs') {
      return { sha: url.searchParams.get('ref') === mergeSha ? 'c'.repeat(40) : 'd'.repeat(40) };
    }
    throw new Error(`Unexpected GitHub path: ${url.pathname}${url.search}`);
  }, async () => {
    await assert.rejects(() => inspectCaFrontendDeployment(env, 1900, mergeSha), /snapshot_changed/);
  });
});
