import test from 'node:test';
import assert from 'node:assert/strict';
import { customerMarketCatalog, customerRegionCatalog, normalizeOpportunitySearch } from '../../platform/findpitches-v2/customer/api-contract.mjs';

test('customer market catalog comes from live market registry',()=>{
 const codes=customerMarketCatalog().map(x=>x.code);
 assert.deepEqual(codes.sort(),['AU','CA','GB','HK','IE','NZ','SG','US']);
});

test('customer regions come from canonical geography catalog',()=>{
 const kent=customerRegionCatalog('GB').find(x=>x.code==='GB-ENG-KENT');
 assert.equal(kent.name,'Kent');
});

test('search supports adaptive offering and cuisine terms',()=>{
 const q=normalizeOpportunitySearch({market:'gb',offering:'Korean corn dogs',cuisine:'Korean',limit:40});
 assert.equal(q.market,'GB');
 assert.equal(q.offering,'Korean corn dogs');
 assert.equal(q.cuisine,'Korean');
 assert.equal(q.limit,40);
});

test('distance search requires complete coordinates',()=>{
 assert.throws(()=>normalizeOpportunitySearch({market:'GB',lat:51.5,radius_km:25}),/coordinates_incomplete/);
});

test('unknown market fails closed',()=>{
 assert.throws(()=>normalizeOpportunitySearch({market:'ZZ'}),/market_unknown/);
});
