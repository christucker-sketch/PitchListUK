// Runs the offline concurrent-session proof (fake agents) and prints the timeline and the evidence report.
//   node greenfield/mycelium/session/demo.mjs [out-dir]     (no model, no network; creates a throwaway git repo)
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSession } from './coordinator.mjs';
import { TESTS, proofAgents } from './scenarios/links-proof.mjs';
const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'myc-demo-')), repo = join(out, 'repo');
mkdirSync(join(repo, 'artifact'), { recursive: true });
const g = (...a) => execFileSync('git', a, { cwd: repo });
g('init', '-q', '-b', 'main'); g('config', 'user.name', 'demo'); g('config', 'user.email', 'demo@mycelium.invalid');
writeFileSync(join(repo, 'artifact', 'README'), 'shared artifact\n'); g('add', '-A'); g('commit', '-q', '-m', 'base');
const r = await runSession({ dir: join(out, 'session'), repo, id: 'demo', agents: proofAgents(), testCmd: TESTS, limits: { maxWallMs: 30000 } });
const t0 = Date.parse(r.events[0].at);
for (const e of r.events) console.log(`${String(e.seq).padStart(3)} +${String(Date.parse(e.at) - t0).padStart(5)}ms ${e.actor.padEnd(11)} ${e.kind.padEnd(9)} ${e.refs.length ? 'refs ' + e.refs.join(',') + ' ' : ''}${e.body.slice(0, 90)}`);
const { span, ...rep } = r.report;
console.log('\nevidence:', JSON.stringify({ ...rep, calls: rep.calls.length }, null, 1));
writeFileSync(join(out, 'report.json'), JSON.stringify(r.report, null, 1));
console.log(`\nstream: ${join(out, 'session', 'events.jsonl')}   report: ${join(out, 'report.json')}`);
