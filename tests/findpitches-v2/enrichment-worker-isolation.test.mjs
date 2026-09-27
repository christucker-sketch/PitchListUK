import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const classifier=fs.readFileSync(new URL('../../operations/findpitches-v2/worker/index.mjs',import.meta.url),'utf8');
const enrichment=fs.readFileSync(new URL('../../operations/findpitches-v2-enrichment/worker/index.mjs',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../../operations/findpitches-v2-enrichment/wrangler.jsonc',import.meta.url),'utf8');

test('enrichment is physically separate from classifier worker',()=>{
 assert.doesNotMatch(classifier,/runEnrichmentBatch|enqueueValidatedForEnrichment|ENRICHMENT_BATCH_LIMIT/);
 assert.match(enrichment,/runEnrichmentBatch/);
 assert.match(enrichment,/enqueueValidatedForEnrichment/);
});
test('dedicated enrichment worker has no Serper/search binding',()=>{
 assert.doesNotMatch(enrichment,/FINDPITCHES_SEARCH_API_KEY|createSerperSearchProvider/);
 assert.doesNotMatch(config,/SERPER|SEARCH_API_KEY/i);
 assert.match(config,/findpitches-v2-enrichment/);
 assert.match(config,/"\* \* \* \* \*"/);
});
