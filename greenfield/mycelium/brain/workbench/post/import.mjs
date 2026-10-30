// Trusted import of the SANDBOX's outputs (C-08, C-09). myc-post runs this as root with the batch's pinned code after the
// sandboxed evaluation, and treats every file the sandbox left behind as hostile:
//   - opened with O_NOFOLLOW | O_NONBLOCK and fstat'ed: only a regular file, no symlink, FIFO or device, within a size cap;
//   - parsed and validated against a strict schema, then RE-SERIALISED from the validated fields only;
//   - the markdown the next agent reads is RENDERED here from the validated board, never copied from the sandbox.
//   node import.mjs board <sandbox .board.json> <out board.json> <out board.md> <out compact.md>
//   node import.mjs cache <sandbox .cache.json> <out cache.json>
// Residual risk (recorded, not hidden): a mechanism that escaped the vm realm inside the sandbox could still write
// well-formed but FALSE numbers. The OS sandbox bounds what it can reach; the vm realm is the fairness boundary.
import { openSync, fstatSync, readSync, closeSync, writeFileSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { METRICS, cleanRow, renderMarkdown, renderCompact } from '../evaluate.mjs';

export function readNoFollow(path, max) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error('not a regular file');
    if (st.size > max) throw new Error(`over ${max} bytes`);
    const buf = Buffer.alloc(st.size); let off = 0;
    while (off < st.size) { const n = readSync(fd, buf, off, st.size - off, off); if (!n) break; off += n; }
    return buf.subarray(0, off).toString('utf8');
  } finally { closeSync(fd); }
}

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
const fin = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} is not a finite number`); return v; };
const stat = (s, what) => { if (!isObj(s)) throw new Error(`${what} missing`); return { mean: fin(s.mean, what), se: fin(s.se, what), n: fin(s.n, what) }; };
const text = (v, max) => String(v).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').slice(0, max);

export function validateBoard(b) {
  if (!isObj(b) || !isObj(b.cases)) throw new Error('board has no cases');
  const keys = Object.keys(b.cases); if (keys.length > 64) throw new Error('too many cases');
  const out = { cases: {}, failures: [], incomplete: [], truncated: b.truncated === true, ms: Number.isFinite(b.ms) ? b.ms : 0,
    evaluator: typeof b.evaluator === 'string' && /^[0-9a-f]{16}$/.test(b.evaluator) ? b.evaluator : 'unknown', mechanisms: {}, caseHashes: {} };
  for (const cn of keys) {
    if (!NAME.test(cn) || !isObj(b.cases[cn])) throw new Error(`bad case ${text(cn, 40)}`);
    const per = {}; const mks = Object.keys(b.cases[cn]); if (mks.length > 64) throw new Error('too many mechanisms');
    for (const mn of mks) {
      if (!NAME.test(mn)) throw new Error(`bad mechanism ${text(mn, 40)}`);
      const s = b.cases[cn][mn];
      if (isObj(s) && isObj(s.incomplete)) { per[mn] = { incomplete: { ok: fin(s.incomplete.ok, 'ok'), expected: fin(s.incomplete.expected, 'expected') } }; continue; }
      if (!isObj(s)) throw new Error(`${cn}/${mn} malformed`);
      per[mn] = Object.fromEntries(METRICS.map(k => [k, stat(s[k], `${cn}/${mn}/${k}`)]));
      if (s.verifiedVsBaseline !== undefined) per[mn].verifiedVsBaseline = stat(s.verifiedVsBaseline, `${cn}/${mn}/vs`);
    }
    out.cases[cn] = per;
    out.caseHashes[cn] = typeof b.caseHashes?.[cn] === 'string' && /^[0-9a-f]{12}$/.test(b.caseHashes[cn]) ? b.caseHashes[cn] : '????????????';
  }
  for (const [k, v] of Object.entries(isObj(b.mechanisms) ? b.mechanisms : {})) if (NAME.test(k) && typeof v === 'string' && /^[0-9a-f]{12}$/.test(v)) out.mechanisms[k] = v;
  out.failures = (Array.isArray(b.failures) ? b.failures : []).slice(0, 200).map(x => text(x, 300));
  out.incomplete = (Array.isArray(b.incomplete) ? b.incomplete : []).slice(0, 200).map(x => text(x, 200));
  return out;
}

const CACHE_KEY = /^[0-9a-f]{16}:[0-9a-f]{64}:[0-9a-f]{64}:\d{1,10}$/;
export function validateCache(c) {
  if (!isObj(c)) throw new Error('cache is not an object');
  const out = {};
  for (const [k, v] of Object.entries(c)) { if (!CACHE_KEY.test(k)) continue; const r = cleanRow(v); if (r) out[k] = r; }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, src, ...outs] = process.argv.slice(2);
  try {
    if (mode === 'board') {
      const b = validateBoard(JSON.parse(readNoFollow(src, 2_000_000)));
      writeFileSync(outs[0], JSON.stringify(b)); writeFileSync(outs[1], renderMarkdown(b) + '\n'); writeFileSync(outs[2], renderCompact(b) + '\n');
    } else if (mode === 'cache') writeFileSync(outs[0], JSON.stringify(validateCache(JSON.parse(readNoFollow(src, 20_000_000)))));
    else throw new Error('usage: import.mjs board|cache ...');
  } catch (e) { console.error(`import: ${String(e.message).slice(0, 200)}`); process.exit(1); }
}
