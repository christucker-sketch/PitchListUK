import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA_VERSION = 1;

function clean(value, fallback = 'unknown') {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return text || fallback;
}

function optional(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return text || null;
}

function readJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function appendLog(config, entry) {
  if (!config.delivery_log_file) return;
  fs.mkdirSync(path.dirname(config.delivery_log_file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(config.delivery_log_file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

function envValue(env, key, fallback) {
  return env[key] === undefined ? fallback : env[key];
}

export function notificationConfigFromEnvironment(env = process.env, overrides = {}) {
  let fileConfig = {};
  const configFile = overrides.config_file || env.FINDPITCHES_NOTIFICATION_CONFIG;
  if (configFile) fileConfig = readJson(path.resolve(configFile)) || {};
  const enabled = String(overrides.enabled ?? envValue(env, 'FINDPITCHES_NOTIFICATION_ENABLED', fileConfig.enabled ?? '0')) === '1';
  if (!enabled) return null;
  const controllerId = clean(overrides.controller_id ?? envValue(env, 'FINDPITCHES_CONTROLLER_ID', fileConfig.controller_id), '');
  if (!controllerId) throw new Error('FINDPITCHES_CONTROLLER_ID is required when acquisition notifications are enabled');
  return {
    enabled: true,
    controller_id: controllerId,
    market: clean(overrides.market ?? envValue(env, 'FINDPITCHES_MARKET_NAME', fileConfig.market), 'Unknown market'),
    country_code: optional(overrides.country_code ?? envValue(env, 'FINDPITCHES_COUNTRY_CODE', fileConfig.country_code)),
    service_name: clean(overrides.service_name ?? envValue(env, 'FINDPITCHES_SERVICE_NAME', fileConfig.service_name), controllerId),
    controller_state_file: optional(overrides.controller_state_file ?? envValue(env, 'FINDPITCHES_CONTROLLER_STATE_FILE', fileConfig.controller_state_file)),
    controller_log_file: optional(overrides.controller_log_file ?? envValue(env, 'FINDPITCHES_CONTROLLER_LOG_FILE', fileConfig.controller_log_file)),
    incident_state_dir: path.resolve(overrides.incident_state_dir ?? envValue(env, 'FINDPITCHES_NOTIFICATION_STATE_DIR', fileConfig.incident_state_dir ?? path.join(os.homedir(), '.local/state/findpitches-acquisition-notifications'))),
    delivery_log_file: path.resolve(overrides.delivery_log_file ?? envValue(env, 'FINDPITCHES_NOTIFICATION_LOG', fileConfig.delivery_log_file ?? path.join(os.homedir(), '.local/state/findpitches-acquisition-notifications/delivery.log'))),
    openclaw_bin: overrides.openclaw_bin ?? envValue(env, 'FINDPITCHES_NOTIFICATION_OPENCLAW_BIN', fileConfig.openclaw_bin ?? 'openclaw'),
    telegram_channel: overrides.telegram_channel ?? envValue(env, 'FINDPITCHES_NOTIFICATION_TELEGRAM_CHANNEL', fileConfig.telegram_channel ?? 'telegram'),
    telegram_target: clean(overrides.telegram_target ?? envValue(env, 'FINDPITCHES_NOTIFICATION_TELEGRAM_TARGET', fileConfig.telegram_target), ''),
    recommended_next_action: clean(overrides.recommended_next_action ?? envValue(env, 'FINDPITCHES_NOTIFICATION_NEXT_ACTION', fileConfig.recommended_next_action), 'Inspect the preserved checkpoint and exact blocker, fix the cause, then resume from the saved position.')
  };
}

function stateFileFor(config) {
  const slug = config.controller_id.replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return path.join(config.incident_state_dir, `${slug}.json`);
}

function loadIncidentState(config) {
  return readJson(stateFileFor(config)) || {
    schema_version: SCHEMA_VERSION,
    controller_id: config.controller_id,
    active_incident: null,
    history: []
  };
}

function controllerSnapshot(config, overrides = {}) {
  let state = null;
  let checkpointSafe = false;
  try {
    state = readJson(overrides.controller_state_file || config.controller_state_file);
    checkpointSafe = Boolean(state);
  } catch {
    checkpointSafe = false;
  }
  state ||= {};
  const current = state.current || {};
  const active = state.active_instance || {};
  const results = Array.isArray(state.results) ? state.results : [];
  const deployments = Array.isArray(state.deployments) ? state.deployments : [];
  const lastResult = [...results].reverse().find(item => Number(item?.additions || 0) > 0) || results.at(-1) || {};
  const lastDeployment = deployments.at(-1) || {};
  return {
    region: optional(overrides.region ?? active.state_name ?? current.state_name ?? current.state_code ?? state.next_state),
    cursor: optional(overrides.cursor ?? current.query_offset ?? state.next_batch ?? state.query_offset),
    workflow_id: optional(overrides.workflow_id ?? active.id ?? state.workflow_id),
    opportunity_count: overrides.opportunity_count ?? state.snapshot_count ?? state.opportunity_count ?? null,
    approved_source_count: overrides.approved_source_count ?? state.approved_source_count ?? null,
    checkpoint_safe: overrides.checkpoint_safe ?? checkpointSafe,
    last_success: optional(overrides.last_success ?? lastResult.data_pr_url ?? lastResult.source_pr_url ?? lastDeployment.deployment_id ?? lastDeployment.id),
    state_status: optional(state.status)
  };
}

function fingerprint(config, incident) {
  return crypto.createHash('sha256').update(JSON.stringify({
    controller_id: config.controller_id,
    status: incident.status,
    blocker: incident.blocker,
    region: incident.snapshot.region,
    cursor: incident.snapshot.cursor,
    workflow_id: incident.snapshot.workflow_id
  })).digest('hex');
}

function label(config) {
  return config.country_code ? `${config.market} (${config.country_code})` : config.market;
}

function failureMessage(config, incident) {
  const s = incident.snapshot;
  return [
    '🚨 FindPitches acquisition stopped',
    `Market: ${label(config)}`,
    `Region: ${s.region || 'not applicable'}`,
    `Timestamp: ${incident.timestamp}`,
    `Controller/service: ${config.service_name}`,
    `Exact status: ${incident.status}`,
    `Exact blocker/error: ${incident.blocker}`,
    `Cursor/query offset: ${s.cursor ?? 'not available'}`,
    `Workflow ID: ${s.workflow_id || 'none'}`,
    `Opportunity count: ${s.opportunity_count ?? 'not available'}`,
    `Approved-source count: ${s.approved_source_count ?? 'not available'}`,
    `Checkpoint safe: ${s.checkpoint_safe ? 'yes' : 'no / not verified'}`,
    `Last successful addition/PR/deployment: ${s.last_success || 'not available'}`,
    `Recommended next action: ${incident.recommended_next_action}`
  ].join('\n');
}

function recoveryMessage(config, active, snapshot, timestamp) {
  return [
    '✅ FindPitches acquisition resumed',
    `Market: ${label(config)}`,
    `Region: ${snapshot.region || 'not applicable'}`,
    `Timestamp: ${timestamp}`,
    `Controller/service: ${config.service_name}`,
    `Recovered incident: ${active.blocker}`,
    `Resumed cursor/position: ${snapshot.cursor ?? 'not available'}`,
    `New active Workflow ID: ${snapshot.workflow_id || 'none'}`,
    `Opportunity count: ${snapshot.opportunity_count ?? 'not available'}`,
    `Approved-source count: ${snapshot.approved_source_count ?? 'not available'}`
  ].join('\n');
}

export function deliverWithOpenClaw(config, message) {
  if (!config.telegram_target) throw new Error('Telegram target is not configured');
  execFileSync(config.openclaw_bin, ['message', 'send', '--channel', config.telegram_channel, '--target', config.telegram_target, '--message', message], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000, maxBuffer: 1024 * 1024
  });
}

export function notifyFailure({ config, error, status = 'blocked', terminal = true, overrides = {}, now = new Date(), deliver = deliverWithOpenClaw }) {
  if (!config || !terminal) return { status: 'suppressed' };
  const store = loadIncidentState(config);
  const incident = {
    timestamp: now.toISOString(),
    status: clean(status, 'blocked'),
    blocker: clean(error, 'Unknown terminal controller failure'),
    recommended_next_action: clean(overrides.recommended_next_action, config.recommended_next_action),
    snapshot: controllerSnapshot(config, overrides)
  };
  incident.fingerprint = fingerprint(config, incident);
  if (store.active_incident?.fingerprint === incident.fingerprint && store.active_incident.notified_at) {
    return { status: 'deduplicated', fingerprint: incident.fingerprint };
  }
  incident.attempt_count = (store.active_incident?.fingerprint === incident.fingerprint ? store.active_incident.attempt_count : 0) + 1;
  incident.notified_at = null;
  incident.last_send_error = null;
  const message = failureMessage(config, incident);
  try {
    deliver(config, message);
    incident.notified_at = now.toISOString();
    if (store.active_incident && store.active_incident.fingerprint !== incident.fingerprint) {
      store.history.push({ ...store.active_incident, resolution: 'superseded', resolved_at: now.toISOString() });
    }
    store.active_incident = incident;
    store.updated_at = now.toISOString();
    writeJsonAtomic(stateFileFor(config), store);
    appendLog(config, { timestamp: now.toISOString(), controller_id: config.controller_id, event: 'failure_notified', fingerprint: incident.fingerprint });
    return { status: 'notified', fingerprint: incident.fingerprint, message };
  } catch (errorValue) {
    incident.last_send_error = clean(errorValue?.message || errorValue);
    store.active_incident = incident;
    store.updated_at = now.toISOString();
    writeJsonAtomic(stateFileFor(config), store);
    appendLog(config, { timestamp: now.toISOString(), controller_id: config.controller_id, event: 'notification_send_failed', error: incident.last_send_error });
    return { status: 'delivery_failed', fingerprint: incident.fingerprint, error: incident.last_send_error };
  }
}

export function notifyRecovery({ config, overrides = {}, now = new Date(), deliver = deliverWithOpenClaw }) {
  if (!config) return { status: 'suppressed' };
  const store = loadIncidentState(config);
  const active = store.active_incident;
  if (!active?.notified_at) return { status: 'no_notified_incident' };
  const snapshot = controllerSnapshot(config, overrides);
  const message = recoveryMessage(config, active, snapshot, now.toISOString());
  try {
    deliver(config, message);
    store.history.push({ ...active, resolution: 'recovered', resolved_at: now.toISOString() });
    store.active_incident = null;
    store.updated_at = now.toISOString();
    writeJsonAtomic(stateFileFor(config), store);
    appendLog(config, { timestamp: now.toISOString(), controller_id: config.controller_id, event: 'recovery_notified', fingerprint: active.fingerprint });
    return { status: 'notified', fingerprint: active.fingerprint, message };
  } catch (errorValue) {
    active.recovery_send_error = clean(errorValue?.message || errorValue);
    active.recovery_attempt_count = Number(active.recovery_attempt_count || 0) + 1;
    store.updated_at = now.toISOString();
    writeJsonAtomic(stateFileFor(config), store);
    appendLog(config, { timestamp: now.toISOString(), controller_id: config.controller_id, event: 'recovery_send_failed', error: active.recovery_send_error });
    return { status: 'delivery_failed', fingerprint: active.fingerprint, error: active.recovery_send_error };
  }
}

export function safeNotifyFailureFromEnvironment(error, options = {}) {
  try {
    const config = notificationConfigFromEnvironment(options.env || process.env, options.config || {});
    return notifyFailure({ config, error, status: options.status, terminal: options.terminal !== false, overrides: options.overrides || {} });
  } catch (notificationError) {
    process.stderr.write(`Acquisition notification failure: ${clean(notificationError?.message || notificationError)}\n`);
    return { status: 'notification_internal_error' };
  }
}

export function safeNotifyRecoveryFromEnvironment(options = {}) {
  try {
    const config = notificationConfigFromEnvironment(options.env || process.env, options.config || {});
    return notifyRecovery({ config, overrides: options.overrides || {} });
  } catch (notificationError) {
    process.stderr.write(`Acquisition recovery notification failure: ${clean(notificationError?.message || notificationError)}\n`);
    return { status: 'notification_internal_error' };
  }
}

