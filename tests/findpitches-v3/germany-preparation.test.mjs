import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {GERMANY_PREPARATION,parseGermanDate,parseGermanDateRange} from '../../operations/findpitches-v3/germany-preparation.mjs';
import {normalizeExport} from '../../platform/findpitches-v3/contract.mjs';import {record} from './helpers.mjs';
import {SUPPORTED_MARKETS} from '../../web/findpitches-v3-web/server/catalogue-registry.mjs';
const vectors=JSON.parse(fs.readFileSync(new URL('./fixtures/germany-preparation.json',import.meta.url)));
test('German date fields require literal full years and valid calendar dates without mutating their inputs',()=>{
 for(const row of vectors.dates){const before=JSON.stringify(row);assert.equal(parseGermanDate(row.input),row.expected,row.input);assert.equal(JSON.stringify(row),before);}
 assert.equal(parseGermanDate('14. Ma\u0308rz 2027'),'2027-03-14');assert.equal(parseGermanDate('x'.repeat(161)),null);assert.equal(parseGermanDate(null),null);
});
test('German date ranges share only an explicit year and never guess a cross-year edition or page-clock date',()=>{
 for(const row of vectors.ranges)assert.deepEqual(parseGermanDateRange(row.input),row.expected,row.input);
});
test('Germany groundwork leaves runtime intake/customer support off and proposes country-qualified state IDs',()=>{
 assert.equal(GERMANY_PREPARATION.runtime_enabled,false);assert.equal(GERMANY_PREPARATION.ready_promotion_enabled,false);
 assert.equal(Object.keys(GERMANY_PREPARATION.regions).length,16);assert.ok(Object.keys(GERMANY_PREPARATION.regions).every(k=>/^DE-[A-Z]{2}$/.test(k)));
 assert.equal(SUPPORTED_MARKETS.includes('DE'),false);assert.ok(normalizeExport(record({country_code:'DE'})).errors.includes('unsupported_market'));
 assert.equal(GERMANY_PREPARATION.currency,'EUR');assert.equal(GERMANY_PREPARATION.timezone,'Europe/Berlin');
});
