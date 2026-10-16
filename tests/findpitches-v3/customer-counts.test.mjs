import test from 'node:test';
import assert from 'node:assert/strict';
import {countSearch,search,regions,inventory} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import {seoConfig} from '../../web/findpitches-v3-web/server/seo-edge.mjs';

const now='2026-10-16T23:30:00Z'; // Already 17 October in London.
const row=(id,market,region,type,start,extra={})=>({id,market,title:id,type,
  location:{region_id:region,label:'Town Hall',precision:'unknown'},organiser:{name:'Local Council',type:'council'},
  dates:{start,end:start},checked:{last_checked:now},sells:[],_restricted:{source_domain:'example.org'},...extra});
const rows=[row('a','GB','gb/kent','market','2026-10-17',{sells:['craft']}),
  row('b','GB','gb/kent','festival','2026-11-01'),row('c','GB','gb/devon','market','2026-12-12'),
  row('d','GB',null,null,null),row('e','GB','gb/not-a-region','show','2026-10-16'),
  row('f','US','us/texas','market','2026-11-01')];

test('region counts retain hierarchy, registry order, zeroes and unknown-location exclusion',()=>{
  const r=regions('GB',rows),counts=Object.fromEntries(r.map(r=>[r.id,r.opportunity_count]));
  assert.equal(counts['gb/kent'],2);assert.equal(counts['gb/south-east'],2);
  assert.equal(counts['gb/devon'],1);assert.equal(counts['gb/south-west'],1);assert.equal(counts['gb/scotland'],0);
  assert.deepEqual(regions('GB',[]).map(r=>r.id),r.map(r=>r.id));
  assert.equal(regions('US',rows).find(r=>r.id==='us/texas').opportunity_count,1);
});

test('count-only results preserve dates, filters and total independently of pagination',()=>{
  const cases=[[{},5],[{types:['market']},2],[{sells:'craft'},1],[{q:'kent'},2],
    [{q:'Town Hall'},5],[{region:'gb/south-east',types:'festival'},1],[{month:'2026-11'},1],
    [{when:'30'},2],[{when:'xmas'},2],[{when:'2026'},4],[{q_text:'Council',organiser_types:'council'},5],
    [{q_text:'absent'},0],[{q:'US city'},0]];
  for(const [filters,expected] of cases){const q={market:'GB',...filters,page:3,page_size:1,sort:'az'};
    assert.equal(countSearch(rows,q,now),expected,JSON.stringify(q));assert.equal(search(rows,q,null,now).total,expected);
  }
  const result=search(rows,{market:'GB',types:'festival'},null,now);
  assert.equal(result.total,1);assert.deepEqual(result.facets.types,{market:2,festival:1,show:1});
  assert.equal(result.facets.unclassified_types,1);assert.equal(result.facets.undated,1);
});

test('count-only requests reject the same invalid filters and pagination as full search',()=>{
  const invalid=[{market:'XX'},{region:'not-a-region'},{q_text:123},{month:'bad'},{when:'soon'},
    {radius_km:10},{sort:'nearest'},{sort:'bad'},{page:0},{page_size:101},{q:'x'.repeat(201)}];
  for(const fields of invalid){const q={market:'GB',...fields};let full;
    assert.throws(()=>search(rows,q,null,now),e=>{full=e;return true;});
    assert.throws(()=>countSearch(rows,q,now),e=>e.code===full.code&&e.status===full.status);
    assert.throws(()=>inventory(rows,q.market,[{key:'test',filters:fields}],now));
  }
});

test('SEO inventory counts retain region overrides and every configured intent total',()=>{
  const snapshot=structuredClone(rows),intents=[{key:'market',filters:{types:'market',region:'gb/kent'}},
    {key:'craft',filters:{sells:'craft',q:'unrelated city'}},{key:'all',filters:{}}];
  const result=inventory(rows,'GB',intents,now);
  assert.equal(result.market_total,5);assert.deepEqual(result.intents,{market:1,craft:0,all:5});
  assert.equal(result.combos['market|gb/devon'],1); // Override the intent's Kent region, as before.
  assert.equal(result.combos['craft|gb/kent'],1); // Explicit region takes precedence over q.
  for(const market of ['GB','US','FR','CA']){
    const configured=seoConfig.intentsFor(market),inv=inventory(rows,market,configured,now);
    for(const i of configured){assert.equal(inv.intents[i.key],search(rows,{...i.filters,market},null,now).total);
      for(const region of Object.keys(inv.regions))assert.equal(inv.combos[i.key+'|'+region]??0,search(rows,{...i.filters,market,region},null,now).total);
    }
  }
  assert.deepEqual(rows,snapshot); // Counting and full search never reorder the source input.
});
