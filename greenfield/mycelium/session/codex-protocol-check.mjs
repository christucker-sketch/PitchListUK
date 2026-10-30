// Read-only protocol check. Does not execute Codex, authenticate, connect or invoke a model.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export function checkProtocol(schema) {
  const d = schema.definitions, v = d?.v2;
  const methods = ['initialize', 'thread/start', 'turn/start', 'turn/steer', 'turn/interrupt', 'item/tool/call'];
  const enums = new Set();
  function walk(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o.enum)) for (const x of o.enum) enums.add(x); for (const x of Object.values(o)) walk(x); }
  walk(schema);
  for (const m of methods) if (!enums.has(m)) throw new Error(`unsupported protocol method: ${m}`);
  for (const [name, fields] of Object.entries({ TurnSteerParams: ['threadId', 'expectedTurnId', 'input'], TurnInterruptParams: ['threadId', 'turnId'], ThreadStartParams: ['dynamicTools', 'sandbox', 'approvalPolicy', 'cwd'] })) {
    for (const f of fields) if (!v?.[name]?.properties?.[f]) throw new Error(`missing ${name}.${f}`);
  }
  if (!v.TurnSteerParams.required?.includes('expectedTurnId')) throw new Error('steer must guard active turn identity');
  const tools = JSON.stringify(v.DynamicToolSpec);
  if (!tools?.includes('"function"') || !tools.includes('inputSchema')) throw new Error('unsupported dynamic-tool shape; adapt explicitly');
  return { methods, liveReady: false, note: 'Schema compatibility only. No server/model/BRIX execution demonstrated.' };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const bytes = readFileSync(process.argv[2]);
  console.log(JSON.stringify({ schemaSha256: createHash('sha256').update(bytes).digest('hex'), ...checkProtocol(JSON.parse(bytes)) }, null, 2));
}
