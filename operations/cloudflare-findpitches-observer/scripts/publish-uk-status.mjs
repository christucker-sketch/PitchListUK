#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildUkObserverStatus } from './uk-observer-status.mjs';

const threeMinApiUrl = String(process.env.FINDPITCHES_3MIN_API_URL || '').replace(/\/$/, '');
const threeMinApiKey = String(process.env.FINDPITCHES_3MIN_API_KEY || '');
const source = String(process.env.FINDPITCHES_UK_OBSERVER_SOURCE || 'uk-cloudflare-growth');
const intervalMinutes = Math.max(1, Number(process.env.FINDPITCHES_UK_OBSERVER_INTERVAL_MINUTES || 10));
const reporterStateFile = process.env.FINDPITCHES_UK_OBSERVER_REPORTER_STATE
  || path.join(os.homedir(), '.local/state/findpitches-observer/uk-reporter.json');

function cleanText(value, maximum = 2000) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/(?:ghp|github_pat|sk|xox[baprs])-[-A-Za-z0-9_]{12,}/g, '[REDACTED_TOKEN]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, maximum);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function isDue(now, state) {
  const last = Date.parse(state?.last_sent_at || '');
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= intervalMinutes * 60_000;
}

function writeState(state) {
  fs.mkdirSync(path.dirname(reporterStateFile), { recursive: true, mode: 0o700 });
  const temporary = `${reporterStateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, reporterStateFile);
}

async function main() {
  if (!threeMinApiUrl || !threeMinApiKey) {
    process.stdout.write('UK 3Min observer mirror not configured; skipping.\n');
    return;
  }

  const now = new Date();
  const prior = readJson(reporterStateFile, {});
  if (!isDue(now, prior)) {
    process.stdout.write('UK 3Min observer heartbeat not due; skipping.\n');
    return;
  }

  try {
    const status = buildUkObserverStatus(now);
    const payload = {
      source,
      observed_at: now.toISOString(),
      status
    };

    const response = await fetch(threeMinApiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${threeMinApiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${cleanText(await response.text())}`);
    }

    writeState({
      last_sent_at: now.toISOString(),
      last_ok: true,
      last_controller_status: status.controller_status,
      last_live_api_count: status.live_api_count,
      last_approved_source_count: status.approved_source_count
    });
    process.stdout.write(`UK observer mirrored: ${status.controller_status}; opportunities=${status.live_api_count}; sources=${status.approved_source_count}\n`);
  } catch (error) {
    writeState({
      ...prior,
      last_attempt_at: now.toISOString(),
      last_ok: false,
      last_error: cleanText(error?.message || error)
    });
    process.stderr.write(`UK observer mirror warning: ${cleanText(error?.stack || error)}\n`);
    // Best-effort by design: a UK status-read failure must not break the proven US reporter.
  }
}

main().catch((error) => {
  process.stderr.write(`UK observer mirror warning: ${cleanText(error?.stack || error)}\n`);
});
