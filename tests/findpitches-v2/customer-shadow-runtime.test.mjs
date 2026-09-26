import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../../operations/findpitches-v2/worker/index.mjs',import.meta.url),'utf8');

test('shadow runtime engages bounded customer promotion without publication',()=>{
 assert.match(worker,/CUSTOMER_PROMOTION_BATCH_LIMIT = 12/);
 assert.match(worker,/runCustomerPromotionBatch\(env\.FINDPITCHES_DB/);
 assert.match(worker,/customer_promotion: customerPromotion/);
 assert.match(worker,/publication_enabled: false/);
});

test('status exposes customer-ready count',()=>{
 assert.match(worker,/count\(env, 'customer_opportunities'\)/);
 assert.match(worker,/customer_ready: customerReady/);
});
