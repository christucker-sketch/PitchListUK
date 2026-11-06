// M3 (6 Nov): delta reads. Coordinator contract + Claude-side guard + a SYNTHETIC replay of read cost. No model, no host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSession } from '../coordinator.mjs';
import { createReadGuard } from '../adapters/claude-stream.mjs';
const repo = () => { const d = mkdtempSync(join(tmpdir(), 'myc-dr-repo-')), g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid'); mkdirSync(join(d, 'artifact'));
  writeFileSync(join(d, 'artifact', 'README'), 'readme\n'); writeFileSync(join(d, 'artifact', 'frontier.mjs'), 'export function expand() { return []; }\n'); g('add', '-A'); g('commit', '-qm', 'b'); return d; };
const reads = r => r.events.filter(e => e.actor === 'claude' && e.kind === 'note' && /^read integration/.test(e.body)).map(e => e.data);
const session = (id, claudeScript, codexScript, limits = {}) => runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-dr-')), repo: repo(), id,
  agents: { claude: { adapter: 'fake', script: claudeScript }, codex: { adapter: 'fake', script: codexScript } }, limits: { maxWallMs: 20000, ...limits } });

test('delta read: only changed allowlisted paths since a session-published base; unchanged head = empty complete delta; unknown base refused, never a full resend', async () => {
  const r = await session('dr-a',
    [{ readState: 'r0' }, { await: { actor: 'codex', kind: 'commit' }, label: 'c1', timeoutMs: 8000 }, { busy: 400 },
     { readState: 'r1', since: 'r0' }, { readState: 'r2', since: 'r1' }, { readState: 'r3', since: 'f'.repeat(40) }, { done: 'c' }],
    [{ call: 100 }, { files: { 'artifact/frontier.mjs': 'export function expand(p) { return [p]; }\n', 'artifact/new.test.mjs': '// t\n' }, message: 'impl + test' }, { done: 'x' }]);
  const [full, d1, d2, bad] = reads(r);
  assert.equal(full.delta, false); assert.equal(full.files, 2);
  assert.equal(d1.delta, true); assert.equal(d1.complete, true); assert.deepEqual(d1.changed.sort(), ['artifact/frontier.mjs', 'artifact/new.test.mjs']); assert.equal(d1.files, 2);
  assert.ok(!d1.changed.includes('artifact/README'), 'unchanged files are not resent');
  assert.equal(d2.delta, true); assert.equal(d2.complete, true); assert.deepEqual(d2.changed, []); assert.equal(d2.files, 0);
  assert.equal(bad.refused, 'unknown-base'); assert.equal(bad.files, 0); assert.equal(bad.complete, false);
});

test('delta read: readBytes overflow lists omitted paths with complete:false; a selective delta is marked selective', async () => {
  const big = 'x'.repeat(3000);
  const r = await session('dr-b',
    [{ readState: 'r0' }, { await: { actor: 'codex', kind: 'commit' }, label: 'c1', timeoutMs: 8000 }, { busy: 400 },
     { readState: 'r1', since: 'r0' }, { readState: 'r2', since: 'r0', paths: ['artifact/b.mjs'] }, { done: 'c' }],
    [{ call: 100 }, { files: { 'artifact/a.mjs': `// ${big}\n`, 'artifact/b.mjs': `// ${big}\n` }, message: 'two big' }, { done: 'x' }], { readBytes: 4000 });
  const [, d1, sel] = reads(r);
  assert.equal(d1.complete, false); assert.equal(d1.files, 1); assert.equal(d1.omitted.length, 1);
  assert.deepEqual(sel.changed, ['artifact/b.mjs']); assert.equal(sel.complete, true);
});

test('Claude read guard: only complete, non-selective, non-head-only reads (or complete deltas from a held base) are held', () => {
  const g = createReadGuard(), A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
  assert.equal(g.check({ sinceIntegration: A }).refused, 'base-not-held-completely');
  g.delivered({ headOnly: true }, { integration: A, truncated: false, files: [] }); assert.ok(!g.held.has(A), 'head-only is not a snapshot');
  g.delivered({ paths: ['artifact/x'] }, { integration: A, truncated: false, files: [] }); assert.ok(!g.held.has(A), 'selective is not a snapshot');
  g.delivered({}, { integration: A, truncated: true, files: [] }); assert.ok(!g.held.has(A), 'truncated is not a snapshot');
  g.delivered({}, { integration: A, truncated: false, files: [] }); assert.ok(g.held.has(A));
  assert.equal(g.check({ sinceIntegration: A }), null);
  g.delivered({ sinceIntegration: A }, { delta: true, since: A, integration: B, complete: false }); assert.ok(!g.held.has(B), 'omitted paths: not held');
  g.delivered({ sinceIntegration: A, paths: ['p'] }, { delta: true, since: A, integration: B, complete: true, selective: true }); assert.ok(!g.held.has(B), 'selective delta: not held');
  g.delivered({ sinceIntegration: A }, { delta: true, since: A, integration: B, complete: true }); assert.ok(g.held.has(B));
  g.delivered({ sinceIntegration: C }, { delta: true, since: C, integration: C, complete: true }); assert.ok(!g.held.has(C), 'a delta from a base never held cannot create a held base');
  g.delivered({}, { refused: 'x', integration: C }); assert.ok(!g.held.has(C));
});

test('SYNTHETIC replay (not a measurement of run 4): a reader re-reading after each of 5 peer commits supplies far fewer bytes with deltas', async () => {
  const sized = (n, tag) => `// ${tag}\n` + 'y'.repeat(n);
  const peer = [{ call: 50 }];
  const plan = [['artifact/frontier.mjs', 4000], ['artifact/frontier.test.mjs', 3500], ['artifact/frontier.mjs', 4100], ['artifact/extra.test.mjs', 1500], ['artifact/frontier.mjs', 4200]];
  plan.forEach(([p, n], i) => peer.push({ files: { [p]: sized(n, i) }, message: `c${i}` }, { busy: 150 }));
  peer.push({ done: 'x' });
  const reader = mode => { const s = [{ readState: 'r0' }]; for (let i = 0; i < plan.length; i++) s.push({ await: { actor: 'codex', kind: 'commit' }, label: `k${i}`, timeoutMs: 8000 }, { busy: 100 }, mode === 'full' ? { readState: `r${i + 1}` } : { readState: `r${i + 1}`, since: `r${i}` }); s.push({ done: 'c' }); return s; };
  const total = async mode => reads(await session('dr-' + mode, reader(mode), peer, { readBytes: 24000 })).slice(1).reduce((n, d) => n + d.bytes, 0);
  const full = await total('full'), delta = await total('delta');
  console.log(`# synthetic replay: full re-reads ${full} bytes vs delta reads ${delta} bytes (${Math.round(100 * delta / full)}%)`);
  assert.ok(delta < full * 0.6, `${delta} vs ${full}`);
});
