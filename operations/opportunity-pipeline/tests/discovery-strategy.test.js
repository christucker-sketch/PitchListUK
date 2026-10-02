const test=require('node:test');
const assert=require('node:assert/strict');
const { cleanTitle, hop1Queries, seedsFromResults, dedupeSeeds }=require('../scripts/discover-event-seeds');
const { cleanName, isGeneric, buildHop2Queries }=require('../scripts/generate-hop2-queries');
const { analyse }=require('../scripts/audit-rejects');
const { selectTierOne }=require('../scripts/run-two-hop-pilot');

test('hop one uses event discovery language without vendor terms',()=>{
  const q=hop1Queries('York',2027);
  assert.equal(q.length,6);
  for(const x of q){
    assert.match(x,/York/);
    assert.doesNotMatch(x,/trader|vendor|stallholder|apply to trade/i);
  }
});

test('hop one extracts and dedupes event-like result names',()=>{
  const rows=seedsFromResults('York','q',[
    {title:'York Food Festival 2027 - Visit York',url:'https://a.test/york-food',snippet:'Food festival'},
    {title:'York Food Festival 2027 | Official Site',url:'https://b.test/york-food',snippet:'Food festival'},
    {title:'York Parking',url:'https://c.test/parking',snippet:'Parking information'}
  ]);
  assert.equal(rows.length,2);
  assert.equal(dedupeSeeds(rows).length,1);
  assert.equal(cleanTitle(rows[0].name),'York Food Festival 2027');
});

test('hop two creates tiered event-name searches including 2027 and artefacts',()=>{
  const rows=buildHop2Queries({name:'York Food Festival 2027',town:'York'});
  assert.equal(rows.length,9);
  assert.equal(rows.filter(x=>x.tier===1).length,3);
  assert.ok(rows.some(x=>/2027/.test(x.query)));
  assert.ok(rows.some(x=>/filetype:pdf/.test(x.query)));
  assert.ok(rows.some(x=>/forms\.office\.com/.test(x.query)));
});

test('generic event names are tightened by place',()=>{
  assert.equal(isGeneric(cleanName('Christmas Market 2027'),'York'),true);
  const rows=buildHop2Queries({name:'Christmas Market 2027',town:'York'});
  assert.ok(rows.every(x=>x.query.includes('York')));
});

test('reject audit flags recurring and opening-later trader routes',()=>{
  const row=analyse({
    event_name:'Wakefield Craft Fair',
    source_url:'https://example.co.uk/traders',
    source_evidence:'Annual fair. Applications will open soon. Traders wanted. Contact trade@example.co.uk',
    quality_reasons:['application_closed']
  });
  assert.ok(row.audit_flags.includes('opening_later'));
  assert.ok(row.audit_flags.includes('recurring'));
  assert.ok(row.audit_flags.includes('trader_terms'));
  assert.ok(row.audit_score>=5);
});


test('two-hop pilot only spends tier-one queries on a bounded seed set',()=>{
  const plan=selectTierOne([
    {name:'York Food Festival 2027',town:'York'},
    {name:'Skipton Christmas Market 2027',town:'Skipton'},
    {name:'York Food Festival 2027',town:'York'}
  ],2);
  assert.equal(plan.selected.length,2);
  assert.equal(plan.queries.length,6);
  assert.ok(plan.queries.every(q=>!/filetype:pdf|2027 traders OR/.test(q)));
});
