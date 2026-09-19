#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function safeDetail(value, max = 120) {
  return String(value || '').replace(/[^a-z0-9_.: -]+/gi, '').trim().slice(0, max);
}

function resultExitCode(result, logger = console) {
  if (result?.error) {
    const detail = safeDetail(result.error.code || 'unknown error');
    logger.error(`Wrangler failed to start${detail ? `: ${detail}` : '.'}`);
    return 1;
  }
  if (result?.signal) {
    logger.error(`Wrangler terminated by signal ${safeDetail(result.signal) || 'unknown'}.`);
    return 1;
  }
  if (!Number.isInteger(result?.status)) {
    logger.error('Wrangler ended without an exit code; deployment status is unknown.');
    return 1;
  }
  if (result.status !== 0) {
    logger.error(`Wrangler exited with code ${result.status}; deployment failed.`);
  }
  return result.status;
}

function deploymentResultText(result) {
  return [result?.error?.message, result?.stdout, result?.stderr]
    .filter(Boolean)
    .map(value => String(value))
    .join('\n');
}

function isTransientCloudflareDeploymentFailure(result) {
  const text = deploymentResultText(result);
  return /Unknown internal error occurred|workflows\.api\.error\.internal_server|code:\s*10001|\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b|fetch failed|socket hang up|\b(?:502|503|504)\b|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout/i.test(text);
}

function deploymentRetryBackoffMilliseconds(attempt, options = {}) {
  const base = Number(options.baseMs ?? 5000);
  const maximum = Number(options.maximumMs ?? 60000);
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(maximum) || maximum < base) {
    throw new Error('Cloudflare deployment retry backoff configuration is invalid');
  }
  return Math.min(maximum, base * (2 ** Math.max(0, Number(attempt || 1) - 1)));
}

function cleanupFailedDeploymentArtifacts(root, options = {}) {
  const git = options.git || spawnSync;
  const logger = options.logger || console;
  let clean = true;
  try {
    const restored = git('git', ['restore', '--source=HEAD', '--', 'public/sitemap.xml'], {
      cwd: root,
      stdio: 'ignore'
    });
    if (restored?.error || restored?.signal || restored?.status !== 0) clean = false;
  } catch {
    clean = false;
  }
  for (const directory of ['global', 'us', 'uk', 'shared']) {
    try {
      fs.rmSync(path.join(root, 'public', directory), { recursive: true, force: true });
    } catch {
      clean = false;
    }
  }
  if (!clean) logger.error('Failed to fully clean generated deployment artifacts after deployment failure.');
  return clean;
}

function relayResultOutput(result, output = process) {
  if (result?.stdout && output?.stdout?.write) output.stdout.write(String(result.stdout));
  if (result?.stderr && output?.stderr?.write) output.stderr.write(String(result.stderr));
}

function deployPublicSite(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const spawn = options.spawn || spawnSync;
  const sleep = options.sleep || (milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds));
  const output = options.output || process;
  const repositoryRoot = path.resolve(__dirname, '..');
  const siteRoot = path.resolve(repositoryRoot, env.PITCHLIST_PUBLIC_SITE_ROOT || '.');
  const project = env.PITCHLIST_CLOUDFLARE_PAGES_PROJECT || 'pitchlistuk';
  const branch = env.PITCHLIST_CLOUDFLARE_PAGES_BRANCH || 'main';
  const workingDirectoryEnvFile = path.resolve(options.cwd || process.cwd(), '.env');
  const envFile = env.PITCHLIST_DEPLOY_ENV_FILE
    ? path.resolve(env.PITCHLIST_DEPLOY_ENV_FILE)
    : (fs.existsSync(workingDirectoryEnvFile) ? workingDirectoryEnvFile : '');

  if (!project) {
    logger.error('PITCHLIST_CLOUDFLARE_PAGES_PROJECT is not set.');
    return 2;
  }
  if (!env.CLOUDFLARE_API_TOKEN && !envFile) {
    logger.error('Cloudflare authentication is not configured. Set CLOUDFLARE_API_TOKEN or PITCHLIST_DEPLOY_ENV_FILE.');
    return 2;
  }
  if (envFile && !fs.existsSync(envFile)) {
    logger.error('PITCHLIST_DEPLOY_ENV_FILE does not exist.');
    return 2;
  }
  if (!fs.existsSync(path.join(siteRoot, 'public'))) {
    logger.error('PitchList public output directory does not exist.');
    return 2;
  }

  const args = [
    '--yes',
    'wrangler',
    'pages',
    'deploy',
    'public',
    '--project-name',
    project,
    '--branch',
    branch
  ];
  if (envFile) args.push('--env-file', envFile);

  const configuredRetries = Number(env.PITCHLIST_DEPLOY_RETRIES ?? 3);
  const maxRetries = Number.isFinite(configuredRetries) ? Math.max(0, Math.min(10, Math.floor(configuredRetries))) : 3;
  const baseMs = Number(env.PITCHLIST_DEPLOY_RETRY_BASE_MS ?? 5000);
  const maximumMs = Number(env.PITCHLIST_DEPLOY_RETRY_MAX_MS ?? 60000);

  let result;
  let transientFailures = 0;
  for (;;) {
    try {
      result = spawn('npx', args, {
        cwd: siteRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        env
      });
    } catch (error) {
      result = { status: null, signal: null, error };
    }
    relayResultOutput(result, output);

    if (resultExitCode(result, logger) === 0) return 0;
    if (!isTransientCloudflareDeploymentFailure(result) || transientFailures >= maxRetries) break;

    transientFailures += 1;
    const delay = deploymentRetryBackoffMilliseconds(transientFailures, { baseMs, maximumMs });
    logger.error(`Transient Cloudflare Pages deployment failure; retry ${transientFailures}/${maxRetries} in ${delay}ms.`);
    sleep(delay);
  }

  cleanupFailedDeploymentArtifacts(siteRoot, { logger, git: options.git });
  return resultExitCode(result, logger);
}

if (require.main === module) {
  process.exitCode = deployPublicSite();
}

module.exports = {
  cleanupFailedDeploymentArtifacts,
  deployPublicSite,
  deploymentRetryBackoffMilliseconds,
  isTransientCloudflareDeploymentFailure,
  resultExitCode
};
