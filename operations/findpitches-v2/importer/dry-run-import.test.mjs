import assert from 'node:assert/strict';
import { canonicalUrl, scorePair, classify, validateIncoming } from './dry-run-import.mjs';

const incoming={opportunity_id:'fpd_1',country_code:'US',event_name:'Spring Food Festival 2027',organiser:'Town Events',location:'Austin, TX',event_start:'2027-04-20',application_state:'OPEN_NOW',source_url:'https://example.com/event?utm_source=x',application_url:'https://apply.example.com/form'};
const existing={id:'OPP-1',country_code:'US',event_name:'Spring Food Festival 2027',organiser:'Town Events',location:'Austin TX',event_start:'2027-04-20',source_url:'https://example.com/event',application_url:'https://apply.example.com/form'};
assert.equal(canonicalUrl('https://www.Example.com/a/?utm_source=x#x'),'https://example.com/a');
assert.equal(validateIncoming(incoming).length,0);
assert.equal(classify(incoming,[existing]).action,'existing_match');
const newer={...incoming,opportunity_id:'fpd_2',event_name:'Spring Food Festival 2028',event_start:'2028-04-20'};
assert.equal(classify(newer,[existing]).action,'probable_match');
const other={...incoming,opportunity_id:'fpd_3',event_name:'Completely Different Craft Fair',organiser:'Other',location:'Miami FL',source_url:'https://other.test/x',application_url:'https://other.test/app'};
assert.equal(classify(other,[existing]).action,'new_candidate');
const bad={...incoming,opportunity_id:'',application_state:'HISTORICAL'};
assert.equal(classify(bad,[existing]).action,'reject');
const canada={...incoming,opportunity_id:'fpd_ca',country_code:'CA',location:'Toronto',source_url:'https://canada.test',application_url:'https://canada.test/app'};
assert.equal(classify(canada,[existing]).action,'new_candidate');
assert.ok(scorePair(incoming,existing).score>0.82);
console.log('Importer tests passed');
