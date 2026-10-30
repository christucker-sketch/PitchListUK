// Artifact extraction for a BRIX turn: the ONLY way a model's answer becomes workbench files.
//   node apply.mjs check <answer.md> <claude|codex>                    validate, print the manifest JSON (no writes)
//   node apply.mjs apply <answer.md> <claude|codex> <workbench dir>    validate, then write the accepted files
//   node apply.mjs predictions <answer.md> <board.json>                score the answer's predictions against a scoreboard
// An answer carries artifacts as fenced blocks:   ```mycelium-file path=mechanisms/codex-c1.js   ...   ```
// Allowed paths are the turn agent's OWN namespace only, so neither agent can overwrite the other's work, the evaluator,
// the world, the baselines or this file:
//   mechanisms/<agent>-<slug>.js   cases/<agent>-<slug>.json (must validate; author must be the agent)
//   test/<agent>-<slug>.test.mjs
// Limits: at most 4 files, 6 KB in total per turn (so a turn's changes can always be carried to the next turn within the
// gate's 16 KB result; see stageb/myc-post); clean UTF-8; no credential patterns.
// A prediction is a fenced block   ```mycelium-prediction   {"mechanism":..,"case":..,"metric":..,"op":">"|"<",
// "value":n}   ```   (at most 3), scored against the scoreboard computed AFTER the artifacts are applied.
import { readFile, writeFile, mkdir, lstat, rename, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCase } from '../world.mjs';

export const LIMITS = { files: 4, fileBytes: 6144, totalBytes: 6144, predictions: 3 };
const SECRET_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{32,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|postgres(ql)?:\/\/[^:\s/]+:[^@\s]+@/;
const CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
export const METRICS = ['verified', 'verifiedVsBaseline', 'precision', 'reopenDetected', 'meanReopenDelay', 'wasted', 'cpuMs'];

export function extract(answer, agent) {
  if (!['claude', 'codex'].includes(agent)) throw new Error('agent must be claude or codex');
  const accepted = [], rejected = []; let total = 0;
  const blocks = [...answer.matchAll(/```mycelium-file[ \t]+path=(\S+)[ \t]*\r?\n([\s\S]*?)```/g)];
  const rx = new RegExp(`^(mechanisms/${agent}-[a-z0-9][a-z0-9-]{0,39}\\.js|cases/${agent}-[a-z0-9][a-z0-9-]{0,39}\\.json|test/${agent}-[a-z0-9][a-z0-9-]{0,39}\\.test\\.mjs)$`);
  const seen = new Set();
  for (const [, path, body] of blocks) {
    const bytes = Buffer.byteLength(body, 'utf8'), why = [];
    if (!rx.test(path)) why.push(`path outside ${agent}'s namespace (allowed: mechanisms/${agent}-*.js, cases/${agent}-*.json, test/${agent}-*.test.mjs)`);
    if (seen.has(path)) why.push('duplicate path in this answer');
    if (bytes > LIMITS.fileBytes) why.push(`over ${LIMITS.fileBytes} bytes`);
    if (CTRL.test(body)) why.push('control characters');
    if (SECRET_RE.test(body)) why.push('matches a credential pattern');
    if (!why.length && path.endsWith('.json')) {
      try { const c = parseCase(JSON.parse(body)); if (c.author !== agent) why.push(`case author must be ${agent}`); if (path !== `cases/${c.name}.json`) why.push(`file name must be cases/${c.name}.json`); }
      catch (e) { why.push(`case invalid: ${String(e.message).slice(0, 160)}`); }
    }
    if (!why.length && accepted.length >= LIMITS.files) why.push(`more than ${LIMITS.files} files`);
    if (!why.length && total + bytes > LIMITS.totalBytes) why.push(`over ${LIMITS.totalBytes} bytes in total`);
    seen.add(path);
    if (why.length) rejected.push({ path: path.slice(0, 120), bytes, why });
    else { accepted.push({ path, bytes, body }); total += bytes; }
  }
  return { agent, accepted, rejected, blocks: blocks.length };
}

// C-07: write <root>/<rel> without following any symbolic link: the root, every parent directory and the destination must
// be real (lstat), and the file is replaced atomically by rename from a fresh, exclusively created temporary file in the
// same directory. Any symlink, or a non-regular destination, refuses the write.
export async function safeWrite(root, rel, body) {
  const st = async p => { try { return await lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const r = await st(root); if (!r || !r.isDirectory() || r.isSymbolicLink()) throw new Error(`workbench root is not a real directory`);
  const parts = rel.split('/'); let dir = root;
  for (const part of parts.slice(0, -1)) {
    if (!/^[a-z]+$/.test(part)) throw new Error(`bad path component ${part}`);
    dir = join(dir, part); const s = await st(dir);
    if (!s) await mkdir(dir); else if (s.isSymbolicLink() || !s.isDirectory()) throw new Error(`${rel}: a parent is not a real directory`);
  }
  const dst = join(root, rel), d = await st(dst);
  if (d && (d.isSymbolicLink() || !d.isFile())) throw new Error(`${rel}: destination is not a regular file (refused, nothing written)`);
  const tmp = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);
  await writeFile(tmp, body, { flag: 'wx' });
  try { await rename(tmp, dst); } catch (e) { await unlink(tmp).catch(() => {}); throw e; }
}

export function predictions(answer) {
  const out = [];
  for (const [, body] of answer.matchAll(/```mycelium-prediction[ \t]*\r?\n([\s\S]*?)```/g)) {
    if (out.length >= LIMITS.predictions) break;
    let p; try { p = JSON.parse(body); } catch { out.push({ invalid: 'not JSON' }); continue; }
    const ok = p && typeof p === 'object' && typeof p.mechanism === 'string' && typeof p.case === 'string' && METRICS.includes(p.metric)
      && ['>', '<'].includes(p.op) && typeof p.value === 'number' && Number.isFinite(p.value);
    out.push(ok ? { mechanism: p.mechanism.slice(0, 60), case: p.case.slice(0, 60), metric: p.metric, op: p.op, value: p.value } : { invalid: 'needs mechanism, case, metric, op (> or <), value' });
  }
  return out;
}

// HELD / FAILED / UNSCORED, judged on the mean (the standard error is reported alongside, not used to excuse a miss).
export function scorePredictions(preds, board) {
  return preds.map(p => {
    if (p.invalid) return { ...p, verdict: 'UNSCORED' };
    const s = board.cases?.[p.case]?.[p.mechanism]?.[p.metric];
    if (board.cases?.[p.case]?.[p.mechanism]?.incomplete) return { ...p, verdict: 'UNSCORED', why: 'that comparison is INCOMPLETE (a seed failed or was not run)' };
    if (!s) return { ...p, verdict: 'UNSCORED', why: 'no such mechanism/case/metric in the scoreboard' };
    const held = p.op === '>' ? s.mean > p.value : s.mean < p.value;
    return { ...p, observed: Number(s.mean.toFixed(3)), se: Number(s.se.toFixed(3)), verdict: held ? 'HELD' : 'FAILED' };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, answerFile, a2, a3] = process.argv.slice(2);
  try {
    const answer = await readFile(answerFile, 'utf8');
    if (mode === 'predictions') { console.log(JSON.stringify(scorePredictions(predictions(answer), JSON.parse(await readFile(a2, 'utf8'))))); process.exit(0); }
    const m = extract(answer, a2);
    if (mode === 'apply') for (const f of m.accepted) await safeWrite(a3, f.path, f.body);
    else if (mode !== 'check') throw new Error('usage: apply.mjs check|apply|predictions ...');
    console.log(JSON.stringify({ agent: m.agent, blocks: m.blocks, accepted: m.accepted.map(f => ({ path: f.path, bytes: f.bytes })), rejected: m.rejected }));
  } catch (e) { console.error(`apply: ${String(e.message).slice(0, 200)}`); process.exit(1); }
}
