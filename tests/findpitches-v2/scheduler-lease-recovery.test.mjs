import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverExpiredSchedulerLeases } from '../../operations/findpitches-v2/worker/index.mjs';

function fakeDb(rows) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              const now = values[2];
              let changes = 0;
              for (const row of rows) {
                if (row.status === 'leased' && row.lease_until !== null && row.lease_until <= now) {
                  row.status = 'ready';
                  row.lease_until = null;
                  row.available_at = values[0];
                  row.last_error = 'expired_lease_recovered';
                  row.updated_at = values[1];
                  changes += 1;
                }
              }
              return { meta: { changes } };
            }
          };
        }
      };
    }
  };
}

test('expired scheduler leases return to ready', async () => {
  const now = new Date('2026-09-21T11:00:00.000Z');
  const rows = [{ id: 'expired', status: 'leased', lease_until: '2026-09-21T10:59:59.000Z', available_at: 'later' }];
  const recovered = await recoverExpiredSchedulerLeases(fakeDb(rows), { now });
  assert.equal(recovered, 1);
  assert.equal(rows[0].status, 'ready');
  assert.equal(rows[0].lease_until, null);
  assert.equal(rows[0].available_at, now.toISOString());
});

test('live scheduler leases remain untouched', async () => {
  const now = new Date('2026-09-21T11:00:00.000Z');
  const rows = [{ id: 'live', status: 'leased', lease_until: '2026-09-21T11:03:00.000Z', available_at: 'unchanged' }];
  const recovered = await recoverExpiredSchedulerLeases(fakeDb(rows), { now });
  assert.equal(recovered, 0);
  assert.deepEqual(rows[0], { id: 'live', status: 'leased', lease_until: '2026-09-21T11:03:00.000Z', available_at: 'unchanged' });
});
