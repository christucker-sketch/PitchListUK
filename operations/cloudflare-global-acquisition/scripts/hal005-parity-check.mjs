#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { authoritativeControllerDecision } from '../../cloudflare-texas-acquisition/scripts/controller-decision-from-state.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const defaultStateFile = path.join(process.env.HOME || '', '.local/state/findpitches-us-growth/controller.json');
const defaultWorkerUrl = 'https://findpitches-global-acquisition-shadow.ctucker.workers.dev';

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function checkedJson(response, label) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${text}`);
  return JSON.parse(text);
}

export async function runParityCheck(options = {}) {
  const stateFile = path.resolve(options.stateFile || defaultStateFile);
  const token = String(options.token || process.env.CONTROLLER_STATE_IMPORT_TOKEN || '');
  const workerUrl = String(options.workerUrl || process.env.FINDPITCHES_GLOBAL_SHADOW_URL || defaultWorkerUrl).replace(/\/$/, '');
  if (!token) throw new Error('Set CONTROLLER_STATE_IMPORT_TOKEN in the current shell');
  if (!fs.existsSync(stateFile)) throw new Error(`Controller state file not found: ${stateFile}`);

  const source = fs.readFileSync(stateFile);
  const frozenSha = sha256(source);
  const state = JSON.parse(source.toString('utf8'));
  const expected = authoritativeControllerDecision(state, {
    queryLimit: Math.max(1, Number(process.env.PITCHLIST_GROWTH_DISCOVERY_QUERY_LIMIT || 4)),
    maximumReplayAttempts: Math.max(1, Number(process.env.PITCHLIST_GROWTH_DEFERRED_REPLAY_ATTEMPTS || 3))
  });

  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  };

  const imported = await checkedJson(await fetch(`${workerUrl}/controller-state/snapshot`, {
    method: 'PUT',
    headers,
    body: source
  }), 'Shadow import');

  assert.equal(imported.sha256, frozenSha, 'Cloudflare imported SHA does not match frozen Hal snapshot');
  assert.equal(imported.authority, 'shadow', 'Cloudflare controller state is not shadow authority');
  assert.equal(imported.source, 'hal-us-growth', 'Cloudflare controller state source is not hal-us-growth');

  const remote = await checkedJson(await fetch(`${workerUrl}/controller-state/decision`, {
    headers: { authorization: `Bearer ${token}` }
  }), 'Shadow decision');

  assert.equal(remote.authority, 'shadow', 'Remote decision authority is not shadow');
  assert.equal(remote.state_sha256, frozenSha, 'Remote decision was not calculated from the exact frozen snapshot');
  assert.deepEqual(canonical(remote.decision), canonical(expected), 'Cloudflare shadow decision differs from Hal-side expected decision');

  return {
    ok: true,
    parity: 'pass',
    state_file: stateFile,
    sha256: frozenSha,
    byte_length: source.length,
    cloudflare_state_version: remote.state_version,
    expected_decision: expected,
    cloudflare_decision: remote.decision
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  runParityCheck({
    stateFile: argumentValue(args, '--state-file', defaultStateFile),
    workerUrl: argumentValue(args, '--worker-url', defaultWorkerUrl)
  }).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`HAL-005 parity FAILED: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
