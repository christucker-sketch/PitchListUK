import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../../operations/findpitches-v2/worker/index.mjs',import.meta.url),'utf8');

test('shadow runtime engages bounded customer promotion without publication',()=>{
 assert.match(worker,/CUSTOMER_PROMOTION_BATCH_LIMIT = 48/);
 assert.match(worker,/runCustomerPromotionBatch\(env\.FINDPITCHES_DB/);
 assert.match(worker,/customer_promotion: customerPromotion/);
 assert.match(worker,/publication_enabled: false/);
});

test('status exposes customer-ready count',()=>{
 assert.match(worker,/countVerifiedCustomerLocations\(env\)/);
 assert.match(worker,/location_evidence_url/);
 assert.match(worker,/customer_ready: customerReady/);
});

test('status reports location and deadline coverage independently by market',()=>{
 assert.match(worker,/customer_location_quality: await getCustomerLocationQuality\(env\)/);
 assert.match(worker,/FROM customer_opportunities GROUP BY market ORDER BY market/);
 assert.match(worker,/source_backed_location/);
 assert.match(worker,/application_deadlines/);
});
