import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { deployPublicSite, resultExitCode } = require('../scripts/deploy-public-site.js');

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

test('Wrangler spawn failure exits nonzero with safe diagnostics', t => {
  const root = siteRoot(t);
  const capture = captureLogger();
  const code = deployPublicSite({
    env: environment(root),
    logger: capture.logger,
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
    })
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
