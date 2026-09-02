#!/usr/bin/env node

import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { safeNotifyFailureFromEnvironment } from '../../acquisition-notifications/notifier.mjs';

const originalExecFileSync = childProcess.execFileSync;

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isWorkflowDescribe(command, args) {
  if (command !== 'npx' || !Array.isArray(args)) return false;
  const index = args.indexOf('workflows');
  return index >= 0 && args[index + 1] === 'instances' && args[index + 2] === 'describe';
}

export function isTransientWorkflowDescribeError(error) {
  const text = stripAnsi([
    error?.message,
    error?.stderr,
    error?.stdout
  ].filter(Boolean).join('\n'));
  return /workflows\.api\.error\.internal_server|code:\s*10001|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(text);
}

export function workflowDescribeBackoffMilliseconds(attempt, options = {}) {
  const base = Math.max(1000, Number(options.baseMs ?? 5000));
  const maximum = Math.max(base, Number(options.maximumMs ?? 60000));
  return Math.min(maximum, base * (2 ** Math.max(0, Number(attempt || 1) - 1)));
}

childProcess.execFileSync = function resilientExecFileSync(command, args, options) {
  if (!isWorkflowDescribe(command, args)) return originalExecFileSync(command, args, options);

  const maxRetries = Math.max(1, Number(process.env.PITCHLIST_GROWTH_WORKFLOW_DESCRIBE_RETRIES || 6));
  let failures = 0;
  for (;;) {
    try {
      return originalExecFileSync(command, args, options);
    } catch (error) {
      if (!isTransientWorkflowDescribeError(error) || failures >= maxRetries) throw error;
      failures += 1;
      const delay = workflowDescribeBackoffMilliseconds(failures);
      process.stderr.write(`Transient Cloudflare Workflow describe failure; retry ${failures}/${maxRetries} in ${delay}ms\n`);
      sleep(delay);
    }
  }
};

// growth-controller-core.mjs is the pre-fix controller byte-for-byte. Updating the
// builtin ESM binding before dynamically importing it keeps its acquisition and
// checkpoint logic unchanged while making only Workflow describe calls resilient.
syncBuiltinESMExports();
const core = await import('./growth-controller-core.mjs');

export const reconcileRepositoryMain = core.reconcileRepositoryMain;
export const parseCompactWorkflowOutput = core.parseCompactWorkflowOutput;
export const validateSourcePr = core.validateSourcePr;
export const parseUsOpportunitySnapshot = core.parseUsOpportunitySnapshot;
export const readLiveOpportunityConsistency = core.readLiveOpportunityConsistency;
export const classifyLiveConsistency = core.classifyLiveConsistency;
export const liveConsistencyBackoffMilliseconds = core.liveConsistencyBackoffMilliseconds;
export const assertLiveConsistencyWithinDeadline = core.assertLiveConsistencyWithinDeadline;
export const cleanupGeneratedDeploymentArtifacts = core.cleanupGeneratedDeploymentArtifacts;
export const initialState = core.initialState;
export const compactStatus = core.compactStatus;
export const main = core.main;

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const defaultStateFile = path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.json');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const stateFile = path.resolve(argumentValue(process.argv.slice(2), '--state-file', process.env.PITCHLIST_GROWTH_STATE_FILE || defaultStateFile));
    safeNotifyFailureFromEnvironment(error, {
      status: 'blocked',
      config: { controller_state_file: stateFile }
    });
    process.stderr.write(`${String(error?.message || error).replace(/[^a-z0-9_.,:/ #=-]+/gi, '')}\n`);
    process.exit(1);
  });
}
