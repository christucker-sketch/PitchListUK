import test from 'node:test';
import assert from 'node:assert/strict';
import { extractNamedFields } from '../../platform/findpitches-v2/enrichment/named-fields.mjs';

test('HTML explicitly labelled organiser and venue retain source-specific evidence',()=>{
 const result=extractNamedFields([{url:'https://example.org/vendors',body:'<h2>Vendor application</h2><p>Organised by Kent Food Festivals</p><p>Venue: Maidstone Market Square</p>'}]);
 assert.equal(result.organiser.value,'Kent Food Festivals');
 assert.equal(result.location.value,'Maidstone Market Square');
 assert.equal(result.organiser.evidence[0].source,'https://example.org/vendors');
 assert.match(result.location.evidence[0].excerpt,/Venue:/);
});

test('PDF extracted text preserves labelled organiser and location',()=>{
 const result=extractNamedFields([{url:'https://example.org/traders.pdf',body:'Trader application\nOrganizer: Downtown Events Association\nEvent location: Riverfront Park\nApplication deadline: 12 October 2026'}]);
 assert.equal(result.organiser?.value,'Downtown Events Association');
 assert.equal(result.location?.value,'Riverfront Park');
 assert.equal(result.location?.evidence[0].source,'https://example.org/traders.pdf');
});

test('unknown fields are never inferred from URL, event title or discovery region',()=>{
 const result=extractNamedFields([{url:'https://events.example.com/maidstone',body:'<p>Become a vendor at the Summer Fair. Apply here.</p>'}]);
 assert.equal(result.organiser,null);
 assert.equal(result.location,null);
});

test('rejects placeholders and fields containing unrelated labels',()=>{
 const result=extractNamedFields([{url:'https://example.org/event',body:'Venue: TBC\nOrganised by Unknown\nApplication deadline: 12 October 2026'}]);
 assert.equal(result.organiser,null);
 assert.equal(result.location,null);
});

test('never use unrelated PDF pages or first page as provenance of later extracted labels',()=>{
 const result=extractNamedFields([
  {url:'https://example.org/info',body:'<p>Apply for a stall.</p>'},
  {url:'https://example.org/application.pdf',body:'Organised by Regional Festival Trust\nVenue: The Showground'}
 ]);
 assert.equal(result.organiser.evidence[0].source,'https://example.org/application.pdf');
 assert.equal(result.location.evidence[0].source,'https://example.org/application.pdf');
});
