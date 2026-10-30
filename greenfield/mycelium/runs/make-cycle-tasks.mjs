// Builds the six task descriptors of a workbench cycle from <batch>.json + <batch>.turn.txt and the snapshot digest that
// `mycelium-bridge.sh prepare` printed. Writes nothing unless --write; always checks every gate rule it can offline.
//   node runs/make-cycle-tasks.mjs stage-two-cycle-1 <64-hex digest> [--write] [--at 2026-10-30T18:00:00Z] [--reason "..."]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const [batch, digest, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const die = m => { console.error(`make-cycle-tasks: ${m}`); process.exit(1); };
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(batch ?? '')) die('bad batch');
if (!/^[0-9a-f]{64}$/.test(digest ?? '')) die('the digest must be the 64-hex snapshot sha256 printed by prepare');
const m = JSON.parse(readFileSync(join(HERE, `${batch}.json`), 'utf8'));
const tpl = readFileSync(join(HERE, `${batch}.turn.txt`), 'utf8').replace(/\n$/, '');
const BRIEF = 'greenfield/mycelium/brain/workbench/CYCLE_BRIEF.md';
if (!existsSync(join(ROOT, 'brain/workbench/CYCLE_BRIEF.md'))) die('CYCLE_BRIEF.md is missing');
const at = opt('--at', new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
const reason = opt('--reason', `Created on Chris's approval of the Stage Two cycle-1 install (Approval A, docs/mycelium/STAGE_TWO_CYCLE_1_PROPOSAL_2026-10-30.md): batch ${batch} PREPARED, snapshot sha256 ${digest.slice(0, 8)}. This turn runs only under the separate Approval B: one CLI invocation, no retry; the bridge runs the turns in order and stops on a STALL.`);
const n = m.tasks.length, out = [];
m.tasks.forEach((t, i) => {
  const other = t.agent === 'claude' ? 'Codex' : 'Claude', me = t.agent === 'claude' ? 'Claude' : 'Codex';
  const prev = m.tasks[i - 1];
  const ref2 = i === 0
    ? 'the shared cycle brief: both agents\' hypotheses, the evidence so far, the workbench contract and the starting scoreboard.'
    : `${other}'s previous answer (turn ${i}), followed by its machine-written "Workbench result": the scoreboard after its files, prediction verdicts, progress, and every file of yours changed during this cycle.`;
  const extra = i >= n - 2 ? ' Because this is one of the last two turns, also list the open disputes and the next experiment you would run, so the next cycle starts from evidence.' : '';
  const atrefs = i === 0 ? '' : `, or "@<task>" for an earlier turn of this cycle (${m.tasks.slice(0, i).map(x => '@' + x.task).join(', ')})`;
  const ins = tpl.replaceAll('{{N}}', String(i + 1)).replaceAll('{{AGENT}}', t.agent).replaceAll('{{OTHER}}', other)
    .replace('You are ' + t.agent, 'You are ' + me).replaceAll('{{REF2}}', ref2).replaceAll('{{EXTRA}}', extra).replaceAll('{{ATREFS}}', atrefs)
    .replaceAll('{{DIGEST}}', digest).replaceAll('{{REFPATH}}', i === 0 ? BRIEF : `greenfield/mycelium/tasks/${prev.task}/result.md`);
  if (/\{\{/.test(ins)) die(`${t.task}: unfilled placeholder`);
  const bytes = Buffer.byteLength(ins, 'utf8');
  if (bytes > 4096) die(`${t.task}: instructions are ${bytes} bytes; the gate allows 4096`);
  if ((ins.match(/^memref: /gm) || []).length !== 1 || (ins.match(/^(ref|memref): /gm) || []).length !== 2) die(`${t.task}: needs exactly one memref and one ref line`);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(ins)) die(`${t.task}: control characters`);
  const dir = join(ROOT, 'tasks', t.task);
  if (existsSync(dir)) die(`${t.task} already exists; task ids are never reused`);
  const task = { task_id: t.task, assigned_agent: t.agent, instructions: ins, status: 'pending', result_location: `greenfield/mycelium/tasks/${t.task}/result.md` };
  const ev = { seq: 1, status: 'pending', at, actor: 'chris', reason };
  out.push({ dir, task, ev, bytes });
});
for (const o of out) console.log(`${o.task.task_id} ${o.task.assigned_agent} ${o.bytes} bytes`);
if (rest.includes('--write')) for (const o of out) {
  mkdirSync(join(o.dir, 'events'), { recursive: true });
  writeFileSync(join(o.dir, 'task.json'), JSON.stringify(o.task, null, 2) + '\n');
  writeFileSync(join(o.dir, 'events', '0001.json'), JSON.stringify(o.ev, null, 2) + '\n');
}
if (rest.includes('--print')) console.log('\n' + out.map(o => `===== ${o.task.task_id}\n${o.task.instructions}`).join('\n\n'));
