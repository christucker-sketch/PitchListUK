// A PROCESS-level stand-in for `claude -p --input-format stream-json --output-format stream-json ...` for offline tests
// of adapters/claude-stream.mjs. No model. It launches the MCP server named in --mcp-config exactly as the real CLI
// would, and plays a scripted engineer: publishes a finding, polls myc_inbox during its turn, and replies to a Codex
// finding with a linked reply and submission. FAKE_CLAUDE_STDIN=midturn consumes (replays) stdin messages at once;
// =queue holds them until the current turn's result, as a CLI without mid-turn input would. Not a protocol claim.
// Live-repair probes (4 Nov): FAKE_CLAUDE_ECHO_FIRST=1 replays the first prompt like the real CLI; FAKE_CLAUDE_HANG=1 keeps
// the first turn running (never a result); FAKE_CLAUDE_USAGE=<n> emits assistant messages reporting n tokens each;
// FAKE_CLAUDE_DROP=1 sends one bridge request on a raw socket and vanishes before the reply (EPIPE on the adapter side).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { connect } from 'node:net';
const argv = process.argv.slice(2), opt = k => argv[argv.indexOf(k) + 1];
if (process.env.FAKE_CLAUDE_ARGV) writeFileSync(process.env.FAKE_CLAUDE_ARGV, JSON.stringify(argv));
const policy = process.env.FAKE_CLAUDE_STDIN ?? 'queue', out = m => process.stdout.write(JSON.stringify(m) + '\n');
const mcp = JSON.parse(opt('--mcp-config')).mcpServers.myc;
const srv = spawn(mcp.command, mcp.args, { env: { ...process.env, ...mcp.env }, stdio: ['pipe', 'pipe', 'inherit'] });
let rid = 0; const waiting = new Map();
createInterface({ input: srv.stdout }).on('line', l => { const m = JSON.parse(l); waiting.get(m.id)?.(m); waiting.delete(m.id); });
const rpc = (method, params) => new Promise(res => { const id = ++rid; waiting.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const call = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args }); if (r.result?.isError) throw new Error(r.result.content[0].text); return JSON.parse(r.result.content[0].text); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-claude', version: '0' } });
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const tools = (await rpc('tools/list', {})).result.tools.map(t => t.name);
out({ type: 'system', subtype: 'init', tools: tools.map(t => 'mcp__myc__' + t) });
const held = [], incoming = []; let inTurn = false, stdinEnded = false, replied = false;
async function react(events) {
  const peer = events.find(e => e.actor === 'codex' && e.kind === 'finding');
  if (peer && !replied) {
    replied = true;
    await call('myc_publish', { kind: 'reply', body: `Claude: agreed with ${peer.id}; fragments are stripped before dedupe now`, refIds: [peer.id] });
    const { integration } = await call('myc_read', {});
    await call('myc_submit', { base: integration, files: [{ path: 'artifact/frontier.mjs', content: 'export const normalise = u => { const x = new URL(u); x.hash = ""; return x.href; };\n' }], message: 'strip fragments (from Codex finding)', refIds: [peer.id] });
  }
}
const consume = m => { out({ type: 'user', uuid: m.uuid, message: m.message }); try { return JSON.parse(m.message.content[0].text).events ?? []; } catch { return []; } };
async function turn(first) {
  inTurn = true;
  if (first && process.env.FAKE_CLAUDE_DROP) { const s = connect(mcp.env.MYC_BRIDGE_SOCK); s.on('error', () => {}); s.on('connect', () => { s.end(JSON.stringify({ op: 'read', args: {} }) + '\n'); s.destroy(); }); await sleep(300); }
  if (first && process.env.FAKE_CLAUDE_USAGE) for (let i = 0; i < 3; i++) { await sleep(100); for (const block of [1, 2]) out({ type: 'assistant', message: { id: `m${i}`, role: 'assistant', content: [{ type: 'text', text: 'x' + block }], usage: { input_tokens: Number(process.env.FAKE_CLAUDE_USAGE), output_tokens: 0 } } }); }
  if (first && process.env.FAKE_CLAUDE_HANG) { await call('myc_publish', { kind: 'finding', body: 'Claude: still working (hang probe)', refIds: [] }); await new Promise(() => {}); }
  if (first) {
    await sleep(150); await call('myc_publish', { kind: 'finding', body: 'Claude: relative links must be resolved against the page URL before dedupe', refIds: [] });
    for (let i = 0; i < 30 && !replied; i++) {
      await sleep(120);
      await react((await call('myc_inbox', {})).events);
      if (policy === 'midturn') while (incoming.length) await react(consume(incoming.shift()));
    }
  } else await sleep(80);
  out({ type: 'result', subtype: 'success', usage: { input_tokens: 900, output_tokens: 200 }, total_cost_usd: 0.01, model: 'fake' });
  inTurn = false;
}
let started = false, chain = Promise.resolve();
createInterface({ input: process.stdin }).on('line', l => {
  const m = JSON.parse(l);
  if (!started) { started = true; if (process.env.FAKE_CLAUDE_ECHO_FIRST) out({ type: 'user', uuid: m.uuid, message: m.message }); chain = chain.then(() => turn(true)).then(drain); return; }
  if (inTurn) { if (policy === 'midturn') incoming.push(m); else held.push(m); }
  else chain = chain.then(async () => { await react(consume(m)); await turn(false); });
}).on('close', () => { stdinEnded = true; chain.then(() => { srv.kill(); process.exit(0); }); });
async function drain() { while (held.length) { const m = held.shift(); await react(consume(m)); await turn(false); } while (incoming.length) consume(incoming.shift()); }
