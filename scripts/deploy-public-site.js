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

function deployPublicSite(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const spawn = options.spawn || spawnSync;
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

  let result;
  try {
    result = spawn('npx', args, {
      cwd: siteRoot,
      stdio: 'inherit',
      env
    });
  } catch (error) {
    const detail = safeDetail(error?.code || 'unknown error');
    logger.error(`Wrangler failed to start${detail ? `: ${detail}` : '.'}`);
    return 1;
  }

  return resultExitCode(result, logger);
}

if (require.main === module) {
  process.exitCode = deployPublicSite();
}

module.exports = { deployPublicSite, resultExitCode };
