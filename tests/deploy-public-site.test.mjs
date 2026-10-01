import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  cleanupFailedDeploymentArtifacts,
  deployPublicSite,
  deploymentRetryBackoffMilliseconds,
  isTransientCloudflareDeploymentFailure,
  resultExitCode
} = require('../scripts/deploy-public-site.js');

function siteRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchlist-deploy-test-'));
  fs.mkdirSync(path.join(root, 'public'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function environment(root, overrides = {}) {
  return {
    CLOUDFLARE_API_TOKEN: 'test-token-never-logged',
    PITCHLIST_CLOUDFLARE_PAGES_PROJECT: 'pitchlistuk',
    PITCHLIST_CLOUDFLARE_PAGES_BRANCH: 'main',
    PITCHLIST_PUBLIC_SITE_ROOT: root,
    ...overrides
  };
}

function captureLogger() {
  const messages = [];
  return {
    messages,
    logger: { error: message => messages.push(String(message)) }
  };
}

const quietOutput = {
  stdout: { write() {} },
  stderr: { write() {} }
};

test('Wrangler spawn failure exits nonzero with safe diagnostics', t => {
  const root = siteRoot(t);
  const capture = captureLogger();
  const code = deployPublicSite({
    env: environment(root),
    logger: capture.logger,
    output: quietOutput,
    git: () => ({ status: 0 }),
    spawn() {
      return { status: null, signal: null, error: Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' }) };
    }
  });
  assert.equal(code, 1);
  assert.match(capture.messages.join('\n'), /failed to start: ENOENT/);
  assert.equal(capture.messages.join('\n').includes('test-token-never-logged'), false);
});

test('Wrangler nonzero exit code propagates exactly', t => {
  const root = siteRoot(t);
  const capture = captureLogger();
  const code = deployPublicSite({
    env: environment(root),
    logger: capture.logger,
    output: quietOutput,
    git: () => ({ status: 0 }),
    spawn(command, args, options) {
      assert.equal(command, 'npx');
      assert.deepEqual(args.slice(0, 5), ['--yes', 'wrangler', 'pages', 'deploy', 'public']);
      assert.equal(options.cwd, root);
      return { status: 17, signal: null };
    }
  });
  assert.equal(code, 17);
  assert.match(capture.messages.join('\n'), /exited with code 17/);
});

test('Wrangler signal and null or unexpected status are explicit failures', () => {
  const signalCapture = captureLogger();
  assert.equal(resultExitCode({ status: null, signal: 'SIGTERM' }, signalCapture.logger), 1);
  assert.match(signalCapture.messages.join('\n'), /SIGTERM/);

  const nullCapture = captureLogger();
  assert.equal(resultExitCode({ status: null, signal: null }, nullCapture.logger), 1);
  assert.match(nullCapture.messages.join('\n'), /without an exit code/);

  const missingCapture = captureLogger();
  assert.equal(resultExitCode({}, missingCapture.logger), 1);
  assert.match(missingCapture.messages.join('\n'), /without an exit code/);
});

test('real child process must complete successfully before deployment returns zero', t => {
  const root = siteRoot(t);
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchlist-deploy-bin-'));
  const sentinel = path.join(bin, 'completed');
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const executable = path.join(bin, 'npx');
  fs.writeFileSync(executable, '#!/bin/sh\nprintf complete > "$PITCHLIST_TEST_SENTINEL"\nexit 0\n', { mode: 0o700 });

  const code = deployPublicSite({
    env: environment(root, {
      PATH: `${bin}:${process.env.PATH || ''}`,
      PITCHLIST_TEST_SENTINEL: sentinel
    }),
    output: quietOutput
  });

  assert.equal(code, 0);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'complete');
});

test('missing authentication, output directory and env file fail before spawn', t => {
  const root = siteRoot(t);
  const capture = captureLogger();
  let spawned = false;
  const spawn = () => { spawned = true; return { status: 0 }; };
  assert.equal(deployPublicSite({ env: environment(root, { CLOUDFLARE_API_TOKEN: '' }), cwd: root, logger: capture.logger, spawn }), 2);
  assert.equal(deployPublicSite({ env: environment(root, { PITCHLIST_PUBLIC_SITE_ROOT: path.join(root, 'missing') }), logger: capture.logger, spawn }), 2);
  assert.equal(deployPublicSite({ env: environment(root, { CLOUDFLARE_API_TOKEN: '', PITCHLIST_DEPLOY_ENV_FILE: path.join(root, 'missing.env') }), logger: capture.logger, spawn }), 2);
  assert.equal(spawned, false);
  assert.equal(capture.messages.join('\n').includes('test-token-never-logged'), false);
});

test('Cloudflare unknown internal error retries with bounded backoff and then succeeds', t => {
  const root = siteRoot(t);
  const capture = captureLogger();
  const delays = [];
  let attempts = 0;
  const code = deployPublicSite({
    env: environment(root, {
      PITCHLIST_DEPLOY_RETRIES: '3',
      PITCHLIST_DEPLOY_RETRY_BASE_MS: '5',
      PITCHLIST_DEPLOY_RETRY_MAX_MS: '20'
    }),
    logger: capture.logger,
    output: quietOutput,
    sleep: delay => delays.push(delay),
    spawn() {
      attempts += 1;
      if (attempts < 3) {
        return { status: 1, signal: null, stderr: 'Failed to publish your Function. Got error: Unknown internal error occurred.' };
      }
      return { status: 0, signal: null, stdout: 'Success' };
    }
  });

  assert.equal(code, 0);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [5, 10]);
  assert.match(capture.messages.join('\n'), /retry 1\/3 in 5ms/);
  assert.match(capture.messages.join('\n'), /retry 2\/3 in 10ms/);
});

test('deterministic deployment failure does not retry and cleans generated output before returning', t => {
  const root = siteRoot(t);
  for (const directory of ['global', 'us', 'uk', 'shared']) {
    fs.mkdirSync(path.join(root, 'public', directory), { recursive: true });
    fs.writeFileSync(path.join(root, 'public', directory, 'generated.txt'), 'generated');
  }
  fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), 'generated sitemap');

  const capture = captureLogger();
  let attempts = 0;
  let restored = false;
  const code = deployPublicSite({
    env: environment(root),
    logger: capture.logger,
    output: quietOutput,
    git(command, args, options) {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['restore', '--source=HEAD', '--', 'public/sitemap.xml']);
      assert.equal(options.cwd, root);
      restored = true;
      return { status: 0 };
    },
    spawn() {
      attempts += 1;
      return { status: 2, signal: null, stderr: 'Configuration validation failed' };
    }
  });

  assert.equal(code, 2);
  assert.equal(attempts, 1);
  assert.equal(restored, true);
  for (const directory of ['global', 'us', 'uk', 'shared']) {
    assert.equal(fs.existsSync(path.join(root, 'public', directory)), false);
  }
  assert.equal(capture.messages.some(message => /Transient Cloudflare/.test(message)), false);
});

test('transient classifier stays narrow and retry backoff is bounded', () => {
  assert.equal(isTransientCloudflareDeploymentFailure({ status: 1, stderr: 'Unknown internal error occurred' }), true);
  assert.equal(isTransientCloudflareDeploymentFailure({ status: 1, stderr: 'HTTP 503 Service Unavailable' }), true);
  assert.equal(isTransientCloudflareDeploymentFailure({ status: 1, stderr: 'Authentication failed' }), false);
  assert.equal(isTransientCloudflareDeploymentFailure({ status: 1, stderr: 'Build syntax error' }), false);
  assert.equal(deploymentRetryBackoffMilliseconds(1, { baseMs: 100, maximumMs: 250 }), 100);
  assert.equal(deploymentRetryBackoffMilliseconds(2, { baseMs: 100, maximumMs: 250 }), 200);
  assert.equal(deploymentRetryBackoffMilliseconds(3, { baseMs: 100, maximumMs: 250 }), 250);
});

test('failed deployment cleanup reports an incomplete git restore without hiding directory cleanup', t => {
  const root = siteRoot(t);
  fs.mkdirSync(path.join(root, 'public', 'us'), { recursive: true });
  const capture = captureLogger();
  const clean = cleanupFailedDeploymentArtifacts(root, {
    logger: capture.logger,
    git: () => ({ status: 1 })
  });
  assert.equal(clean, false);
  assert.equal(fs.existsSync(path.join(root, 'public', 'us')), false);
  assert.match(capture.messages.join('\n'), /Failed to fully clean/);
});
