const test=require('node:test');
const assert=require('node:assert/strict');
const { cleanTitle, hop1Queries, seedsFromResults, dedupeSeeds, seedScore }=require('../scripts/discover-event-seeds');
const { cleanName, isGeneric, buildHop2Queries }=require('../scripts/generate-hop2-queries');
const { analyse }=require('../scripts/audit-rejects');
const { selectTierOne, commercialPriority }=require('../scripts/run-two-hop-pilot');
const { evaluateOpportunity }=require('../lib/opportunity-safety');

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
    {title:'York Food Festival 2027 - Visit York',url:'https://visityork.org/york-food',snippet:'York food festival in England'},
    {title:'York Food Festival 2027 | Official Site',url:'https://yorkfoodfestival.co.uk/york-food',snippet:'York food festival'},
    {title:'York Parking',url:'https://york.gov.uk/parking',snippet:'York parking information'}
  ]);
  assert.equal(rows.length,2);
  assert.equal(dedupeSeeds(rows).length,1);
  assert.equal(cleanTitle(rows[0].name),'York Food Festival 2027');
});

test('hop one rejects foreign lookalikes and low-value social noise',()=>{
  const rows=seedsFromResults('Falmouth','q',[
    {title:'Calendar • Special Events',url:'https://www.falmouthma.gov/calendar.aspx',snippet:'Falmouth Massachusetts special events and farmers market'},
    {title:'Falmouth Food Festival 2027',url:'https://falmouthfoodfestival.co.uk/',snippet:'Falmouth food festival in Cornwall'},
    {title:'Falmouth festival post',url:'https://facebook.com/example',snippet:'Falmouth festival photos'}
  ]);
  assert.deepEqual(rows.map(row=>row.source_url),['https://falmouthfoodfestival.co.uk/']);
});

test('hop one scores UK first-party event pages above generic directories',()=>{
  const official={name:'Ludlow Spring Festival',town:'Ludlow',source_url:'https://ludlowspringfestival.co.uk/',snippet:'Ludlow Spring Festival 2027'};
  const directory={name:'Upcoming Holidays and Festivals',town:'Ludlow',source_url:'https://ricksteves.com/europe/england/festivals',snippet:'Ludlow festivals'};
  assert.ok(seedScore('Ludlow',official)>seedScore('Ludlow',directory));
});


test('hop one demotes administrative pages that merely mention an event',()=>{
  const event={name:'Ludlow Food Festival 2027',town:'Ludlow',source_url:'https://ludlowfoodfestival.co.uk/',snippet:'Ludlow Food Festival takes place in September 2027. Venue and trader information.'};
  const company={name:'Ludlow Marches Food and Drink Festival - Companies House',town:'Ludlow',source_url:'https://find-and-update.company-information.service.gov.uk/company/04230963',snippet:'LUDLOW MARCHES FOOD AND DRINK FESTIVAL. Accounts due June 2027.'};
  const tender={name:'Cirencester Christmas Lights 2027-2031',town:'Cirencester',source_url:'https://www.find-tender.service.gov.uk/procurement/example',snippet:'Procurement contract notice for festive light displays starting November 2027.'};
  assert.ok(seedScore('Ludlow',event)>seedScore('Ludlow',company));
  assert.ok(seedScore('Cirencester',{...event,name:'Cirencester Christmas Market 2027',town:'Cirencester',source_url:'https://cirencester.gov.uk/events/christmas-market',snippet:'Christmas Market takes place in Market Square in 2027 with stalls.'})>seedScore('Cirencester',tender));
});

test('hop two prioritises trader-friendly events over administrative and news pages',()=>{
  const food={name:'Louth Food & Drink Festival 2027',town:'Louth',seed_score:10,snippet:'Town centre food festival with stalls and traders'};
  const admin={name:'Louth Food Festival - Companies House',town:'Louth',seed_score:14,snippet:'Company information filing due 2027'};
  assert.ok(commercialPriority(food)>commercialPriority(admin));
  const plan=selectTierOne([admin,food],1);
  assert.equal(plan.selected[0].name,food.name);
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
    {name:'York Food Festival 2027',town:'York',seed_score:10},
    {name:'Skipton Christmas Market 2027',town:'Skipton',seed_score:10},
    {name:'York Food Festival 2027',town:'York',seed_score:5}
  ],2);
  assert.equal(plan.selected.length,2);
  assert.equal(plan.queries.length,6);
  assert.ok(plan.queries.every(q=>!/filetype:pdf|2027 traders OR/.test(q)));
});

test('two-hop selection round-robins across towns and prefers stronger seeds',()=>{
  const plan=selectTierOne([
    {name:'Bakewell Weak Event',town:'Bakewell',seed_score:4},
    {name:'Bakewell Strong Event',town:'Bakewell',seed_score:10},
    {name:'Ludlow Event One',town:'Ludlow',seed_score:8}
  ],2);
  assert.deepEqual(plan.selected.map(x=>x.name),['Bakewell Strong Event','Ludlow Event One']);
});

test('strong undated trader routes found by two-hop are watched, never published',()=>{
  const row=evaluateOpportunity({
    event_name:'Bakewell Country Festival',organiser:'Bakewell Agricultural & Horticultural Society',
    source_url:'https://bakewellahs.co.uk/trade-at-bakewell-country-festival',
    application_url:'https://bakewellahs.co.uk/trade-at-bakewell-country-festival',
    location:'Derbyshire, England',region:'Derbyshire',event_start:'',event_end:'',application_deadline:'',
    contact_email:'',query_lane:'two-hop-event-name',query_text:'"Bakewell Country Festival" traders OR stallholders',
    source_evidence:'Trade at Bakewell Country Festival. Trader applications and trade stand information for England.'
  },{now:new Date('2026-10-02T00:00:00Z'),allowUnapprovedDiscovery:true});
  assert.equal(row.quality_status,'watch');
  assert.equal(row.publishable,false);
  assert.ok(row.quality_reasons.includes('undated_trader_route_watch'));
});
