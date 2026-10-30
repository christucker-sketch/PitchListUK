// Manifest-driven session runner (the ONE entry point for the fpd-prod rehearsal and, once pinned and reviewed, the live
// proof). It builds the fixture repository, runs the coordinator, writes report.json next to the stream and prints the
// evidence. Exit 0 only if the mechanical criteria pass (substance still needs manual review).
//   node run.mjs <manifest.json> <empty output dir>
// Manifest: { id, fixture: 'links-proof' | { files: { 'artifact/x': '...' } }, agents: 'links-proof' | { claude: {...}, codex: {...} },
//   launcher: { mode, user, home?, path?, memoryMax?, tasksMax? }, sandbox: 'unshare' | 'systemd', testCmd: [...], limits: {...} }
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSession } from './coordinator.mjs';
import { TESTS, proofAgents } from './scenarios/links-proof.mjs';

const [manifestPath, out] = process.argv.slice(2);
if (!manifestPath || !out) { console.error('usage: node run.mjs <manifest.json> <empty output dir>'); process.exit(2); }
const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (existsSync(out) && readdirSync(out).length) { console.error(`REFUSED: ${out} is not empty (a session never reuses a directory)`); process.exit(2); }
mkdirSync(out, { recursive: true }); chmodSync(out, 0o711);
const repo = join(out, 'repo'), g = (...a) => execFileSync('git', a, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
mkdirSync(join(repo, 'artifact'), { recursive: true });
g('init', '-q', '-b', 'main'); g('config', 'user.name', 'session-fixture'); g('config', 'user.email', 'fixture@mycelium.invalid');
const files = m.fixture === 'links-proof' ? { 'artifact/README': 'shared artifact\n' } : m.fixture?.files ?? {};
for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), c); }
g('add', '-A'); g('commit', '-q', '-m', 'fixture');
const agents = m.agents === 'links-proof' ? proofAgents() : m.agents;
const testCmd = m.testCmd === 'links-proof' ? TESTS : m.testCmd ?? null;
const r = await runSession({ dir: join(out, 'session'), repo, id: m.id, agents, launcher: m.launcher ?? { mode: 'local' }, sandbox: m.sandbox ?? 'unshare', testCmd, limits: m.limits ?? {} });
writeFileSync(join(out, 'report.json'), JSON.stringify(r.report, null, 1));
const t0 = Date.parse(r.events[0].at);
for (const e of r.events) console.log(`${String(e.seq).padStart(4)} +${String(Date.parse(e.at) - t0).padStart(6)}ms ${e.actor.padEnd(11)} ${e.kind.padEnd(9)} ${e.refs.length ? 'refs ' + e.refs.join(',') + ' ' : ''}${e.body.slice(0, 110)}`);
const { span, calls, ...rest } = r.report;
console.log('\nevidence:', JSON.stringify({ ...rest, calls: calls.length }, null, 1));
console.log(`\nstream ${join(out, 'session', 'events.jsonl')}   report ${join(out, 'report.json')}`);
console.log(r.report.pass.mechanical ? 'MECHANICAL CRITERIA: PASS (substance needs manual review)' : 'MECHANICAL CRITERIA: FAIL');
process.exit(r.report.pass.mechanical ? 0 : 1);
