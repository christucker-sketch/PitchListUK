#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildObserverStatus,
  readLatestCompactStatus
} from './observer-status-source.mjs';

const stateFile = process.env.FINDPITCHES_CONTROLLER_STATE
  || path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.json');
const controllerLog = process.env.FINDPITCHES_CONTROLLER_LOG
  || path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.log');
const reporterStateFile = process.env.FINDPITCHES_OBSERVER_REPORTER_STATE
  || path.join(os.homedir(), '.local/state/findpitches-observer/reporter.json');
const observerUrl = String(process.env.FINDPITCHES_OBSERVER_URL || '').replace(/\/$/, '');
const ingestToken = String(process.env.FINDPITCHES_OBSERVER_TOKEN || '');
const source = String(process.env.FINDPITCHES_OBSERVER_SOURCE || 'hal-us-growth');
const expectedStatesTotal = Number(process.env.FINDPITCHES_EXPECTED_US_STATES || 50);
const threeMinApiUrl = String(process.env.FINDPITCHES_3MIN_API_URL || '').replace(/\/$/, '');
const threeMinApiKey = String(process.env.FINDPITCHES_3MIN_API_KEY || '');

if (!observerUrl) throw new Error('FINDPITCHES_OBSERVER_URL is required');
if (!ingestToken) throw new Error('FINDPITCHES_OBSERVER_TOKEN is required');
if ((threeMinApiUrl && !threeMinApiKey) || (!threeMinApiUrl && threeMinApiKey)) {
  throw new Error('FINDPITCHES_3MIN_API_URL and FINDPITCHES_3MIN_API_KEY must be configured together');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function cleanText(value, maximum = 2000) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/(?:ghp|github_pat|sk|xox[baprs])-[-A-Za-z0-9_]{12,}/g, '[REDACTED_TOKEN]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, maximum);
}

function readNewLogLines(logFile, previousOffset) {
  try {
    const stat = fs.statSync(logFile);
    const safeOffset = previousOffset >= 0 && previousOffset <= stat.size ? previousOffset : 0;
    const length = stat.size - safeOffset;
    if (length <= 0) return { nextOffset: stat.size, lines: [] };

    const maximumBytes = 256 * 1024;
    const start = length > maximumBytes ? stat.size - maximumBytes : safeOffset;
    const fd = fs.openSync(logFile, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const text = buffer.toString('utf8');
      const lines = text.split(/\r?\n/).filter(Boolean).slice(-200);
      return { nextOffset: stat.size, lines };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { nextOffset: previousOffset || 0, lines: [] };
  }
}

async function mirrorStatusForChatGPT(payload) {
  if (!threeMinApiUrl) return { configured: false, ok: true };
  try {
    const response = await fetch(threeMinApiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${threeMinApiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${cleanText(await response.text())}`);
    }
    return { configured: true, ok: true };
  } catch (error) {
    process.stderr.write(`3Min API mirror warning: ${cleanText(error?.message || error)}\n`);
    return { configured: true, ok: false };
  }
}

async function main() {
  const controller = readJson(stateFile);
  if (!controller) throw new Error(`Unable to read controller checkpoint: ${stateFile}`);

  const operational = readLatestCompactStatus(controllerLog);
  const reporterState = readJson(reporterStateFile, { log_offset: 0 });
  const log = readNewLogLines(controllerLog, Number(reporterState.log_offset || 0));
  const observedAt = new Date().toISOString();
  const status = buildObserverStatus(controller, operational, expectedStatesTotal);

  const events = log.lines.map((line) => ({
    observed_at: observedAt,
    level: /blocked|failed|error|refusing/i.test(line) ? 'warn' : 'info',
    event_type: 'controller_log',
    message: cleanText(line)
  }));

  if (!events.length) {
    events.push({
      observed_at: observedAt,
      level: 'info',
      event_type: 'heartbeat',
      message: `Controller heartbeat: ${operational?.status || controller.status || 'unknown'}`
    });
  }

  const response = await fetch(`${observerUrl}/ingest`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ingestToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      source,
      observed_at: observedAt,
      status,
      events
    })
  });

  if (!response.ok) {
    throw new Error(`Observer ingest failed: HTTP ${response.status} ${cleanText(await response.text())}`);
  }

  const observerResponseText = await response.text();
  const mirror = await mirrorStatusForChatGPT({ source, observed_at: observedAt, status });

  fs.mkdirSync(path.dirname(reporterStateFile), { recursive: true, mode: 0o700 });
  const temporary = `${reporterStateFile}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify({
      log_offset: log.nextOffset,
      last_sent_at: observedAt,
      chatgpt_mirror_configured: mirror.configured,
      chatgpt_mirror_last_ok: mirror.ok
    }, null, 2) + '\n',
    { mode: 0o600 }
  );
  fs.renameSync(temporary, reporterStateFile);

  process.stdout.write(`${observerResponseText}\n`);
}

main().catch((error) => {
  process.stderr.write(`${cleanText(error?.stack || error)}\n`);
  process.exitCode = 1;
});
