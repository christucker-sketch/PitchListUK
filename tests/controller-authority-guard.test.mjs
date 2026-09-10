import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAuthoritativeUsMutationAllowed,
  globalControllerCutoverEnabled,
  readControllerAuthority
} from '../operations/cloudflare-global-acquisition/lib/controller-authority-guard.mjs';

function envWithAuthority(authority, cutover = 'true') {
  return {
    GLOBAL_CONTROLLER_CUTOVER_ENABLED: cutover,
    CONTROLLER_STATE: {
      idFromName(name) {
        assert.equal(name, 'us-controller');
        return name;
      },
      get() {
        return {
          fetch: async () => Response.json({
            ok: true,
            state: { version: 9, sha256: 'abc', authority }
          })
        };
      }
    }
  };
}

const usMutation = { country: 'US', mode: 'discover', mutation_capable: true };

test('cutover flag is false unless deliberately enabled', () => {
  assert.equal(globalControllerCutoverEnabled({}), false);
  assert.equal(globalControllerCutoverEnabled({ GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'false' }), false);
  assert.equal(globalControllerCutoverEnabled({ GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'true' }), true);
});

test('US mutation is blocked while cutover flag is disabled', async () => {
  await assert.rejects(
    () => assertAuthoritativeUsMutationAllowed(envWithAuthority('authoritative', 'false'), usMutation),
    /cutover flag is explicitly enabled/
  );
});

test('US mutation is blocked while controller state remains shadow', async () => {
  await assert.rejects(
    () => assertAuthoritativeUsMutationAllowed(envWithAuthority('shadow'), usMutation),
    /current authority is shadow/
  );
});

test('US mutation requires both deliberate cutover flag and authoritative state', async () => {
  assert.equal(await assertAuthoritativeUsMutationAllowed(envWithAuthority('authoritative'), usMutation), true);
  assert.equal((await readControllerAuthority(envWithAuthority('authoritative'))).authority, 'authoritative');
});

test('read-only US and UK mutation paths do not depend on US controller authority', async () => {
  assert.equal(await assertAuthoritativeUsMutationAllowed({}, { country: 'US', mutation_capable: false }), true);
  assert.equal(await assertAuthoritativeUsMutationAllowed({}, { country: 'UK', mutation_capable: true }), true);
});
