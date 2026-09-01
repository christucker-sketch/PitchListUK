#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notificationConfigFromEnvironment, notifyFailure, notifyRecovery } from './notifier.mjs';

function value(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function lastError(file) {
  if (!file || !fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse()
    .find(line => !line.startsWith('(node:') && !line.startsWith('npm warn')) || null;
}

export function main(args = process.argv.slice(2), env = process.env) {
  const command = args[0];
  const config = notificationConfigFromEnvironment(env, {
    config_file: value(args, '--config'),
    controller_state_file: value(args, '--state-file') || undefined,
    controller_log_file: value(args, '--log-file') || undefined
  });
  if (!config) throw new Error('Acquisition notifications are not enabled');
  const overrides = {
    region: value(args, '--region'), cursor: value(args, '--cursor'), workflow_id: value(args, '--workflow-id'),
    opportunity_count: value(args, '--opportunity-count'), approved_source_count: value(args, '--approved-source-count'),
    last_success: value(args, '--last-success'), recommended_next_action: value(args, '--next-action')
  };
  let result;
  if (command === 'failure') {
    const error = value(args, '--error') || lastError(value(args, '--error-file') || config.controller_log_file) || 'Service exited without a captured error';
    result = notifyFailure({ config, error, status: value(args, '--status', 'blocked'), terminal: value(args, '--terminal', 'true') !== 'false', overrides });
  } else if (command === 'recovery') {
    result = notifyRecovery({ config, overrides });
  } else {
    throw new Error('Usage: acquisition-notify.mjs failure|recovery [options]');
  }
  process.stdout.write(`${JSON.stringify({ status: result.status, fingerprint: result.fingerprint || null })}\n`);
  if (result.status === 'delivery_failed' || result.status === 'notification_internal_error') process.exitCode = 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`${String(error?.message || error).replace(/[\r\n]+/g, ' ')}\n`);
    process.exitCode = 1;
  }
}

