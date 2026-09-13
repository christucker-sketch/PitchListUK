import { createHash } from 'node:crypto';

import { acquisitionCountryConfig } from '../../../platform/acquisition/country-contract.mjs';
import { parseAcquisitionSnapshotModule, serializeAcquisitionSnapshotModule } from '../../../platform/acquisition/global-engine.mjs';
import { githubJson } from './github-publication.mjs';

const CA_SNAPSHOT_PATH = acquisitionCountryConfig('CA').snapshot_path;

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function canonicalUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('ca_opportunity_publication_url_invalid');
  url.hash = '';
  return url.toString();
}

function assertCustomerReadyRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('ca_opportunity_row_invalid');
  if (!/^CA-OPP-[A-F0-9]{12}$/.test(String(row.id || ''))) throw new Error('ca_opportunity_row_id_invalid');
  if (String(row.country || '') !== 'Canada') throw new Error('ca_opportunity_row_country_invalid');
  if (!/^CA-[A-Z]{2}$/.test(String(row.jurisdiction || ''))) throw new Error('ca_opportunity_row_jurisdiction_invalid');
  if (String(row.currency || '') !== 'CAD') throw new Error('ca_opportunity_row_currency_invalid');
  if (row.publishable !== true || String(row.quality_status || '') !== 'customer_ready') throw new Error('ca_opportunity_row_quality_invalid');
  if (String(row.area_confidence || '') !== 'exact') throw new Error('ca_opportunity_row_area_invalid');
  canonicalUrl(row.source_url);
  canonicalUrl(row.application_url);
  if (!String(row.event_name || '').trim() || !String(row.region || '').trim()) throw new Error('ca_opportunity_row_identity_missing');
  return row;
}

export async function readMainCanadaSnapshot(env) {
  const [ref, file] = await Promise.all([
    githubJson(env, '/git/ref/heads/main'),
    githubJson(env, `/contents/${CA_SNAPSHOT_PATH}?ref=main`)
  ]);
  const snapshot = parseAcquisitionSnapshotModule(decodeBase64Utf8(file?.content), 'CA');
  if (!Array.isArray(snapshot.rows) || Number(snapshot.total) !== snapshot.rows.length) throw new Error('ca_opportunity_snapshot_invalid');
  snapshot.rows.forEach(assertCustomerReadyRow);
  return Object.freeze({
    mainSha: String(ref?.object?.sha || ''),
    fileSha: String(file?.sha || ''),
    snapshot,
    snapshot_path: CA_SNAPSHOT_PATH
  });
}

export function planCanadaOpportunityAdditions(base, candidateRows = [], options = {}) {
  if (!base?.snapshot || !Array.isArray(base.snapshot.rows)) throw new Error('ca_opportunity_publication_base_invalid');
  const maxAdditions = Math.min(25, Math.max(1, Number(options.max_additions || 10)));
  const existingIds = new Set();
  const existingRoutes = new Set();
  for (const row of base.snapshot.rows) {
    assertCustomerReadyRow(row);
    if (existingIds.has(row.id)) throw new Error('ca_opportunity_snapshot_duplicate_id');
    existingIds.add(row.id);
    existingRoutes.add(canonicalUrl(row.application_url));
  }

  const additions = [];
  const seenCandidateIds = new Set();
  const seenCandidateRoutes = new Set();
  for (const candidate of candidateRows || []) {
    assertCustomerReadyRow(candidate);
    const route = canonicalUrl(candidate.application_url);
    if (existingIds.has(candidate.id) || existingRoutes.has(route)) continue;
    if (seenCandidateIds.has(candidate.id) || seenCandidateRoutes.has(route)) continue;
    seenCandidateIds.add(candidate.id);
    seenCandidateRoutes.add(route);
    additions.push(candidate);
    if (additions.length >= maxAdditions) break;
  }

  additions.sort((a, b) => a.id.localeCompare(b.id));
  const rows = [...base.snapshot.rows, ...additions];
  const generatedAt = String(options.generated_at || new Date().toISOString());
  const snapshot = Object.freeze({
    ...base.snapshot,
    exported_at: generatedAt,
    source: `cloudflare-canada-additions:${createHash('sha256').update(JSON.stringify(additions.map(row => row.id))).digest('hex').slice(0, 16)}`,
    total: rows.length,
    rows: Object.freeze(rows)
  });
  return Object.freeze({
    snapshot,
    additions: Object.freeze(additions),
    summary: Object.freeze({
      before_count: base.snapshot.rows.length,
      additions: additions.length,
      updates: 0,
      removals: 0,
      after_count: rows.length
    })
  });
}

function branchName(plan, mainSha) {
  if (!/^[a-f0-9]{40}$/i.test(String(mainSha || ''))) throw new Error('ca_opportunity_main_sha_invalid');
  const digest = createHash('sha256').update(JSON.stringify({ mainSha, ids: plan.additions.map(row => row.id) })).digest('hex');
  return `data/cloud-ca-approved-additions-${digest.slice(0, 16)}-base-${String(mainSha).slice(0, 16)}`;
}

async function githubOptional(env, path) {
  try { return await githubJson(env, path); }
  catch (error) {
    if (/GitHub 404:/.test(String(error?.message || ''))) return null;
    throw error;
  }
}

export async function openCanadaOpportunityPullRequest(env, options = {}) {
  const base = options.base;
  const plan = options.plan;
  const additions = Number(plan?.summary?.additions || 0);
  if (additions < 1) return Object.freeze({ created: false, reused: false, reason: 'no_net_new_rows', additions: 0, opportunity_ids: [] });
  if (!base?.mainSha || !base?.snapshot || Number(plan.summary.after_count) !== Number(plan.summary.before_count) + additions) throw new Error('ca_opportunity_publication_count_mismatch');

  const currentMain = await githubJson(env, '/git/ref/heads/main');
  if (String(currentMain?.object?.sha || '') !== base.mainSha) throw new Error('ca_opportunity_publication_main_advanced');
  const branch = branchName(plan, base.mainSha);
  let branchRef = await githubOptional(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!branchRef) branchRef = await githubJson(env, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.mainSha }) });

  const branchFile = await githubJson(env, `/contents/${CA_SNAPSHOT_PATH}?ref=${encodeURIComponent(branch)}`);
  const branchSnapshot = parseAcquisitionSnapshotModule(decodeBase64Utf8(branchFile?.content), 'CA');
  const expectedIds = plan.snapshot.rows.map(row => row.id);
  const alreadyWritten = Array.isArray(branchSnapshot.rows)
    && branchSnapshot.rows.length === plan.snapshot.rows.length
    && branchSnapshot.rows.every((row, index) => row?.id === expectedIds[index]);
  if (!alreadyWritten) {
    await githubJson(env, `/contents/${CA_SNAPSHOT_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Publish ${additions} reviewed Canada opportunities`,
        content: encodeBase64Utf8(serializeAcquisitionSnapshotModule(plan.snapshot, 'CA')),
        sha: branchFile.sha,
        branch
      })
    });
  }

  const currentMainAfterWrite = await githubJson(env, '/git/ref/heads/main');
  if (String(currentMainAfterWrite?.object?.sha || '') !== base.mainSha) throw new Error('ca_opportunity_publication_main_advanced');
  const owner = String(options.owner || '').trim() || String((await githubJson(env, '/')).owner?.login || '');
  let ownerName = owner;
  if (!ownerName) {
    const repo = String(options.repo || '').trim();
    ownerName = repo.includes('/') ? repo.split('/')[0] : '';
  }
  if (!ownerName) {
    const repoName = String(options.repository || '').trim();
    ownerName = repoName.includes('/') ? repoName.split('/')[0] : '';
  }
  if (!ownerName) throw new Error('ca_opportunity_publication_owner_missing');

  const existingPrs = await githubJson(env, `/pulls?state=open&head=${encodeURIComponent(`${ownerName}:${branch}`)}&base=main`);
  if (Array.isArray(existingPrs) && existingPrs.length) {
    const pr = existingPrs[0];
    return Object.freeze({ created: false, reused: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions, opportunity_ids: plan.additions.map(row => row.id) });
  }

  const pr = await githubJson(env, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: `Publish ${additions} cloud-reviewed Canada opportunities`,
      head: branch,
      base: 'main',
      body: [
        'Cloudflare global acquisition Workflow — Canada additions-only run.', '',
        `- production snapshot: ${plan.summary.before_count} -> ${plan.summary.after_count}`,
        `- net-new additions: ${additions}`,
        '- updates: forbidden',
        '- removals: forbidden',
        '- approved-source direct fetch only',
        '- Serper credits: 0',
        '- automatic merge: disabled',
        '- direct production deployment: disabled', '',
        ...plan.additions.map(row => `- ${row.id}: ${row.application_url}; jurisdiction=${row.jurisdiction}`), '',
        'GitHub CI remains the publication gate. Canada cutover remains separately controlled.'
      ].join('\n')
    })
  });
  return Object.freeze({ created: true, reused: false, branch, pr_number: pr.number, pr_url: pr.html_url, additions, opportunity_ids: plan.additions.map(row => row.id) });
}

export { CA_SNAPSHOT_PATH, assertCustomerReadyRow, branchName as canadaOpportunityBranchName };
