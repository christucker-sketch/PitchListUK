// Offline tests of the Claude stream-json adapter with its MCP tool bridge, against a PROCESS-level CLI stand-in, and
// the full pairing: Claude adapter + Codex app-server adapter, both real adapters, both stand-in CLIs, concurrently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runSession } from '../coordinator.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const repo = () => { const d = mkdtempSync(join(tmpdir(), 'myc-cs-repo-')), g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid'); mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'b\n'); g('add', '-A'); g('commit', '-qm', 'b'); return d; };
const claudeCfg = (policy, argvFile) => ({ adapter: 'claude-stream', prompt: 'Improve the shared breadcrumb frontier.', command: [process.execPath, join(HERE, 'fixtures', 'fake-claude.mjs')], idleMs: 800,
  env: { FAKE_CLAUDE_STDIN: policy, ...(argvFile ? { FAKE_CLAUDE_ARGV: argvFile } : {}) } });
const codexCfg = { adapter: 'codex-app-server', prompt: 'Improve the shared breadcrumb frontier.', launch: { command: [process.execPath, join(HERE, 'fixtures', 'fake-codex-app-server.mjs')] } };

for (const policy of ['midturn', 'queue']) test(`Claude adapter + Codex adapter concurrently (stand-in CLIs; Claude stdin ${policy}): tool reads mid-turn, linked replies both ways, honest consumption record`, async () => {
  const argvFile = join(mkdtempSync(join(tmpdir(), 'myc-argv-')), 'argv.json');
  const r = await runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-cs-')), repo: repo(), id: 'pair-' + policy, agents: { claude: claudeCfg(policy, argvFile), codex: codexCfg }, limits: { maxWallMs: 30000, maxCallsPerAgent: 6 } });
  const ev = r.events, by = s => ev[s - 1];
  if (process.env.SESSION_DEBUG) for (const e of ev) console.log(e.seq, e.actor, e.kind, e.refs.join(','), e.body.slice(0, 100));
  // the CLI was started with no built-in tools, only the myc MCP bridge, restricted, and stream-json both ways
  const argv = JSON.parse(readFileSync(argvFile, 'utf8'));
  for (const f of ['--input-format', '--output-format', '--restricted', '--strict-mcp-config', '--replay-user-messages']) assert.ok(argv.includes(f), f);
  assert.equal(argv[argv.indexOf('--tools') + 1], '');
  assert.equal(argv[argv.indexOf('--allowedTools') + 1], 'mcp__myc__myc_publish,mcp__myc__myc_submit,mcp__myc__myc_inbox');
  // grants before dispatch on both sides; every Claude turn is ledgered under its grant
  const gC = ev.filter(e => e.kind === 'grant' && e.data.agent === 'claude'), gX = ev.filter(e => e.kind === 'grant' && e.data.agent === 'codex');
  assert.equal(gC[0].data.intent.method, 'claude/turn'); assert.equal(gX[0].data.intent.method, 'turn/start');
  // each engineer replied to the other's finding while both were live, and each submission was caused by the other
  const reply = a => ev.find(e => e.actor === a && e.kind === 'reply'), finding = a => ev.find(e => e.actor === a && e.kind === 'finding');
  assert.ok(reply('claude').refs.includes(finding('codex').seq) && reply('codex').refs.includes(finding('claude').seq));
  for (const a of ['claude', 'codex']) assert.ok(r.report.midSessionReactions.includes(reply(a).seq), `${a} reply mid-session`);
  assert.equal(r.report.commitsCausedByOther.map(by).filter(e => e.kind === 'commit').map(e => e.actor).sort().join(','), 'claude,codex');
  // Claude read Codex through the TOOL during its own turn
  assert.ok(ev.some(e => e.actor === 'claude' && /via myc_inbox during its turn/.test(e.body)));
  // stdin deliveries are classified by what the CLI actually did
  const notes = ev.filter(e => e.actor === 'claude' && /stdin delivery .* consumed/.test(e.body)), during = notes.filter(e => e.data.mode !== 'new-turn');
  assert.ok(during.length >= 1, 'at least one delivery was sent while a Claude turn was running');
  assert.ok(during.every(e => e.data.mode === (policy === 'midturn' ? 'mid-turn' : 'queued')), notes.map(e => e.body).join(' | '));
  const done = ev.find(e => e.actor === 'claude' && e.kind === 'done').body;
  assert.match(done, policy === 'midturn' ? /mid-turn [1-9]/ : /queued [1-9]/);
  assert.ok(ev.filter(e => e.kind === 'call' && e.actor === 'claude').every(e => e.data.costUsd === null), 'money is null, not an invented figure');
});
