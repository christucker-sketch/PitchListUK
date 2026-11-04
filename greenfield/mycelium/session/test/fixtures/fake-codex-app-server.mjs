// A PROCESS-level stand-in for `codex app-server --listen stdio://` (JSON lines over stdio), for offline integration of
// the Codex adapter with the worker runtime. No model: it plays a scripted Codex that publishes a finding during its
// turn, waits for steering, replies to the delivered peer finding, submits a file and completes. Not a protocol claim.
import { createInterface } from 'node:readline';
const out = m => process.stdout.write(JSON.stringify(m) + '\n');
let pendingSubmit, threadConfig = {};
let thread = 'thread-1', turn = 'turn-1', calls = 0, replied = false;
const tool = (name, args) => out({ id: 1000 + ++calls, method: 'item/tool/call', params: { threadId: thread, turnId: turn, callId: `call-${calls}`, tool: name, arguments: args } });
const complete = status => setTimeout(() => { out({ method: 'thread/tokenUsage/updated', params: { threadId: thread, turnId: turn, tokenUsage: { total: { inputTokens: 1200, outputTokens: 300 } } } }); out({ method: 'turn/completed', params: { threadId: thread, turn: { id: turn, status } } }); setTimeout(() => process.exit(0), 100); }, 100);
createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') out({ id: m.id, result: {} });
  else if (m.method === 'thread/start') { threadConfig = m.params.config ?? {}; out({ id: m.id, result: { thread: { id: thread },activePermissionProfile:{id:m.params.permissions},approvalPolicy:'never',cwd:m.params.cwd } }); }
  // as the real 0.164.0 does: the MCP inventory reloads config and refuses profiles without default_permissions
  else if (m.method === 'mcpServerStatus/list') out(Object.keys(threadConfig).some(k => k.startsWith('permissions.')) && !threadConfig.default_permissions
    ? { id: m.id, error: { code: -32603, message: 'failed to reload config: config defines `[permissions]` profiles but does not set `default_permissions`' } } : {id:m.id,result:{data:[],nextCursor:null}});
  else if (m.method === 'turn/start') {
    out({ id: m.id, result: { turn: { id: turn } } }); out({ method: 'turn/started', params: { threadId: thread, turn: { id: turn } } });
    setTimeout(() => tool('myc_publish', { kind: 'finding', body: 'Codex: fragment-only links (#top) should not become new frontier entries', refIds: [] }), 200);
  } else if (m.method === 'turn/steer') {
    out({ id: m.id, result: { turnId: m.params.expectedTurnId } });
    const payload = JSON.parse(m.params.input[0].text), peer = payload.events.find(e => e.actor === 'claude' && e.kind === 'finding');
    if (peer && !replied) {
      replied = true;
      setTimeout(() => tool('myc_publish', { kind: 'reply', body: `Codex: agreed with ${peer.id}; adding a test for it`, refIds: [peer.id] }), 100);
      setTimeout(() => { pendingSubmit = { files: [{ path: 'artifact/codex-frontier.test.mjs', content: 'import test from "node:test"; test("placeholder", () => {});\n' }], message: 'test from Claude finding', refIds: [peer.id] }; tool('myc_read', {}); }, 250);
      setTimeout(() => complete('completed'), 600);
    }
  } else if (m.result?.contentItems && pendingSubmit) {
    const state = JSON.parse(m.result.contentItems[0].text);
    if (state.integration) { const submission = pendingSubmit; pendingSubmit = null; tool('myc_submit', { ...submission, base: state.integration }); }
  } else if (m.method === 'turn/interrupt') { out({ id: m.id, result: {} }); complete('interrupted'); }
  // responses to our tool calls ({id, result}) need no answer
});

