// OFFLINE regression helper only: a short-lived descendant writes one synthetic temporary canary.
// Demonstrates why killing a worker PID is not process-tree termination. Never calls a model/network.
import { spawn } from 'node:child_process';
export async function* agentRun({ config, inbox }) {
  if (typeof config.canary !== 'string' || !config.canary.startsWith('/tmp/myc-codex-')) throw new Error('temporary canary required');
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {writeFileSync} from 'node:fs'; setTimeout(()=>writeFileSync(${JSON.stringify(config.canary)},'descendant survived'),1000);`], { stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  yield { type: 'event', kind: 'note', body: 'offline descendant started' };
  while (!inbox.stopped) await inbox.wait(100);
  // Parent returns on STOP; descendant is deliberately not reaped by this test-only adapter.
}
