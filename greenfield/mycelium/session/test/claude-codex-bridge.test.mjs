// Integration of Codex's app-server adapter (adapters/codex-app-server.mjs, unchanged) with the shared worker runtime:
// the worker launches the CLI stand-in in its own process group, every turn/start and turn/steer is a durable grant BEFORE
// dispatch, tool publications go through the coordinator, and a peer finding reaches the ACTIVE Codex turn by steering.
// Offline: the "CLI" is test/fixtures/fake-codex-app-server.mjs; Claude is the scripted fake adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runSession } from '../coordinator.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const repo = () => { const d = mkdtempSync(join(tmpdir(), 'myc-bridge-repo-')), g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid'); mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'b\n'); g('add', '-A'); g('commit', '-qm', 'b'); return d; };

test('Codex adapter under the shared runtime: granted start and steer, mid-turn peer delivery, linked reply and submission', async () => {
  const codex = { adapter: 'codex-app-server', prompt: 'Improve the shared breadcrumb frontier.', launch: { command: [process.execPath, join(HERE, 'fixtures', 'fake-codex-app-server.mjs')] } };
  const claude = { adapter: 'fake', script: [{ call: 300 }, { emit: 'finding', body: 'Claude: relative links must be resolved against the page URL before dedupe', label: 'f' },
    { await: { actor: 'codex', kind: 'reply' }, label: 'r', timeoutMs: 8000 }, { emit: 'note', body: 'Claude: saw the Codex reply', refs: ['r'] }, { call: 200 }, { done: 'claude done' }] };
  const r = await runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-bridge-')), repo: repo(), id: 'bridge', agents: { claude, codex }, limits: { maxWallMs: 20000, maxCallsPerAgent: 4 } });
  const ev = r.events, by = s => ev[s - 1];
  const grants = ev.filter(e => e.kind === 'grant' && e.data.agent === 'codex').map(e => e.data.intent.method);
  assert.deepEqual(grants.slice(0, 2), ['turn/start', 'turn/steer'], 'each dispatch was granted before it was sent');
  const finding = ev.find(e => e.actor === 'claude' && e.kind === 'finding'), reply = ev.find(e => e.actor === 'codex' && e.kind === 'reply');
  assert.ok(reply && reply.refs.includes(finding.seq), 'the Codex reply references the Claude finding it was steered with');
  assert.ok(r.report.midSessionReactions.includes(reply.seq), 'and it happened while both sessions were live');
  assert.ok(ev.some(e => e.actor === 'codex' && e.kind === 'finding' && e.seq < reply.seq), 'Codex published an intermediate finding through its tool');
  const commit = ev.find(e => e.actor === 'codex' && e.kind === 'commit');
  assert.ok(commit && commit.refs.includes(finding.seq) && r.report.commitsCausedByOther.includes(commit.seq), 'Codex submission linked to, and caused by, the Claude finding');
  assert.ok(ev.some(e => e.actor === 'claude' && e.kind === 'note' && e.refs.includes(reply.seq)), 'Claude, still live, received the reply');
  assert.ok(ev.some(e => e.kind === 'exit' && e.data.agent === 'codex' && e.data.code === 0));
});
