import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCandidateEvaluator } from '../../platform/findpitches-v2/engine/evaluator.mjs';
import { getMarket } from '../../platform/findpitches-v2/markets/registry.mjs';

const GOOD_HTML = `
<html>
  <head><title>Vendor Opportunity 2027</title></head>
  <body>
    <h1>Vendors wanted</h1>
    <p>Applications are open in REGION for 2027.</p>
    <a href="/apply">Vendor application</a>
  </body>
</html>`;

for (const scenario of [
  { market: 'GB', region: 'KENT', location: 'Kent' },
  { market: 'US', region: 'TX', location: 'Texas' },
  { market: 'CA', region: 'ON', location: 'Ontario' }
]) {
  test(`same evaluator validates ${scenario.market}/${scenario.region}`, async () => {
    const evaluator = createDefaultCandidateEvaluator({
      fetchProvider: {
        async fetch(url) {
          return {
            final_url: url,
            body: GOOD_HTML.replace('REGION', scenario.location)
          };
        }
      },
      now: () => new Date('2026-09-19T00:00:00Z')
    });

    const candidate = await evaluator({
      market: getMarket(scenario.market),
      region_code: scenario.region,
      location: scenario.location,
      result: { url: `https://${scenario.market.toLowerCase()}.example.test/vendors` }
    });

    assert.equal(candidate.market, scenario.market);
    assert.equal(candidate.status, 'validated');
    assert.equal(candidate.publishable, true);
    assert.match(candidate.candidate_id, /^fpv2_[a-f0-9]{24}$/);
  });
}

test('shared evaluator rejects career pages even when vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({
    fetchProvider: {
      async fetch(url) {
        return {
          final_url: url,
          body: '<html><body><h1>Careers</h1><p>Current vacancies - vendor application coordinator.</p></body></html>'
        };
      }
    }
  });

  const candidate = await evaluator({
    market: getMarket('US'),
    region_code: 'TX',
    location: 'Texas',
    result: { url: 'https://example.test/careers' }
  });

  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});


test('shared evaluator rejects trade-account pages even when generic vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({
    fetchProvider: {
      async fetch(url) {
        return {
          final_url: url,
          body: '<html><head><title>Resale Certificates for Interior Designers by State</title></head><body><h1>Vendor application</h1><p>Resale certificates and trade registration application for designers.</p><a href="/trade-registration-application">Trade registration application</a></body></html>'
        };
      }
    }
  });

  const candidate = await evaluator({
    market: getMarket('US'),
    region_code: 'NC',
    location: 'North Carolina',
    result: { url: 'https://example.test/resale-certificate-guide' }
  });

  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});


test('shared evaluator rejects procurement pages even when vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({ fetchProvider: { async fetch(url) { return { final_url: url, body: '<html><head><title>2026 Vendor Request for Qualifications</title></head><body><h1>Become a Service Partner</h1><p>Public purchase supplier registration. Vendor application and request for qualifications.</p><a href="/vendor-application">Vendor application</a></body></html>' }; } } });
  const candidate = await evaluator({ market: getMarket('US'), region_code: 'KY', location: 'Kentucky', result: { url: 'https://example.test/vendor-rfq' } });
  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});

test('shared evaluator rejects forum pages even when vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({ fetchProvider: { async fetch(url) { return { final_url: url, body: '<html><head><title>Model Y UK Delivery | Community Forum</title></head><body><p>Forum thread discussing a vendor application and delivery.</p></body></html>' }; } } });
  const candidate = await evaluator({ market: getMarket('GB'), region_code: 'HERTS', location: 'Hertfordshire', result: { url: 'https://example.test/forum/thread' } });
  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});


for (const bad of [
  ['government procurement', '<h1>Become a Vendor</h1><p>Bids and RFPs for county suppliers.</p><a href="/forms">Vendor application</a>'],
  ['building inspections', '<h1>Building Inspections</h1><p>Building permit services.</p><a href="/application.pdf">Permit application</a>'],
  ['vendor guide article', '<h1>How to Become a Vendor for the City</h1><p>Vendor permit and license guide.</p><a href="/apply">Vendor application</a>'],
  ['surety bond', '<h1>Vendor application</h1><p>Fitness franchise bond and surety bond requirements.</p><a href="/probate">Apply</a>'],
  ['unrelated news', '<h1>New Jersey joins multistate lawsuit challenging tariffs</h1><p>News report.</p><a href="/fcc-applications">Applications</a>']
]) {
  test('shared evaluator rejects ' + bad[0] + ' false positive', async () => {
    const evaluator = createDefaultCandidateEvaluator({ fetchProvider: { async fetch(url) { return { final_url: url, body: '<html><body>' + bad[1] + '</body></html>' }; } } });
    const candidate = await evaluator({ market: getMarket('US'), region_code: 'NJ', location: 'New Jersey', result: { url: 'https://example.test/not-an-opportunity' } });
    assert.equal(candidate.status, 'rejected');
    assert.equal(candidate.rejection_reason, 'negative_page_signal');
    assert.equal(candidate.publishable, false);
  });
}


test('shared evaluator rejects financial-product trader news false positive', async () => {
  const evaluator = createDefaultCandidateEvaluator({
    fetchProvider: {
      async fetch(url) {
        return {
          final_url: url,
          body: '<html><head><title>TradeStation Crypto Now Available to Traders in Connecticut</title></head><body><p>News release: crypto is now available to traders in Connecticut.</p><h2>Vendor application</h2></body></html>'
        };
      }
    }
  });
  const candidate = await evaluator({
    market: getMarket('US'),
    region_code: 'CT',
    location: 'Connecticut',
    result: { url: 'https://example.test/news/tradestation-crypto-connecticut' }
  });
  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});


for (const conflict of [
  ['US government host','https://www.essexvt.gov/1567/Vendor-Market-Community-Organizations','<h1>Vendor Market & Community Organizations</h1><p>Vendor application for Essex, VT 2027.</p><a href="/apply">Vendor application</a>'],
  ['US city/state code','https://event.test/vendors','<h1>Devon Horse Show</h1><p>Vendor application for Devon, PA in 2027.</p><a href="/apply">Vendor application</a>'],
  ['US city/state name','https://event.test/vendors','<h1>Santa Barbara Orchid Show</h1><p>Exhibitor application for Santa Barbara, California in 2027.</p><a href="/apply">Exhibitor application</a>']
]) {
  test('GB evaluator rejects '+conflict[0]+' market conflict', async () => {
    const evaluator=createDefaultCandidateEvaluator({fetchProvider:{async fetch(){return {final_url:conflict[1],body:'<html><body>'+conflict[2]+'</body></html>'};}},now:()=>new Date('2026-09-30T00:00:00Z')});
    const candidate=await evaluator({market:getMarket('GB'),region_code:'GB-ENG-ESSEX',location:'Essex',result:{url:conflict[1]}});
    assert.equal(candidate.status,'rejected');
    assert.equal(candidate.rejection_reason,'market_conflict');
    assert.equal(candidate.publishable,false);
  });
}

test('GB evaluator does not confuse ordinary lowercase us with US market evidence', async () => {
 const evaluator=createDefaultCandidateEvaluator({fetchProvider:{async fetch(url){return {final_url:url,body:'<html><body><h1>Kent Food Festival</h1><p>Join us in Kent in 2027. Vendor application now open.</p><a href="/apply">Vendor application</a></body></html>'};}},now:()=>new Date('2026-09-30T00:00:00Z')});
 const candidate=await evaluator({market:getMarket('GB'),region_code:'GB-ENG-KENT',location:'Kent',result:{url:'https://festival.test/vendors'}});
 assert.equal(candidate.status,'validated');
 assert.equal(candidate.publishable,true);
});

for (const nonEvent of [
 ['fair trader scheme','<h1>Medway Fair Trader Scheme</h1><p>Vendor application for the Fair Trader Scheme.</p><a href="/apply">Vendor application</a>'],
 ['homechoice','<h1>Register for HomeChoice</h1><p>Vendor application assistance.</p><a href="/apply">Vendor application</a>'],
 ['purchasing vendor','<h1>Purchasing Vendor Application</h1><p>Vendor application for purchasing suppliers.</p><a href="/apply">Vendor application</a>']
]) {
 test('shared evaluator rejects '+nonEvent[0]+' non-event false positive', async()=>{
  const evaluator=createDefaultCandidateEvaluator({fetchProvider:{async fetch(url){return {final_url:url,body:'<html><body>'+nonEvent[1]+'</body></html>';}}}});
  const candidate=await evaluator({market:getMarket('GB'),region_code:'GB-ENG-KENT',location:'Kent',result:{url:'https://example.test/vendors'}});
  assert.equal(candidate.status,'rejected');
  assert.equal(candidate.rejection_reason,'negative_page_signal');
 });
}
