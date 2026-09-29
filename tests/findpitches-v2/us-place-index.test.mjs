import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGazetteerPlaces,parseCensusPlacePopulations,buildUsPlaceIndex}
  from '../../platform/findpitches-v2/geography/us-place-index.mjs';

const gaz='USPS\tGEOID\tNAME\tLSAD\tINTPTLAT\tINTPTLONG\n'+
  'CA\t0612345\tExampleville city\t25\t+37.1\t-122.2\n'+
  'NY\t3612345\tExampleville city\t25\t+40.1\t-73.1\n'+
  'CA\t0667890\tSample CDP\t57\t+38.1\t-120.1\n'+
  'TX\t4812345\tUnknown special place\t00\t+31.1\t-96.1';
const pop=[
 [['P1_001N','state','place'],['150000','06','12345'],['2000','06','67890']],
 [['place','state','P1_001N'],['12345','36','230000'],['12345','48','5000']]
];

test('Census place index joins by state/place GEOID, not duplicated city name',()=>{
  const index=buildUsPlaceIndex(gaz,pop);
  assert.deepEqual(index.scope,{states:3,excluded_outside_50_states:0,places:4,incorporated:2,cdps:1,unclassified:1,major_cities:2});
  assert.equal(index.places.find(p=>p.geoid==='0612345').residents_2020,150000);
  assert.equal(index.places.find(p=>p.geoid==='3612345').residents_2020,230000);
  assert.equal(index.places.find(p=>p.geoid==='0667890').tier,'separate_review');
  assert.equal(index.places.find(p=>p.geoid==='4812345').classification,'review_lsad');
  assert.match(index.sources.note,/mixed source vintages/i);
});

test('population and Gazetteer parsers reject bad records rather than inflate coverage',()=>{
  assert.equal(parseGazetteerPlaces(gaz).length,4);
  assert.equal(parseCensusPlacePopulations(pop).size,4);
  assert.throws(()=>parseGazetteerPlaces(gaz+'\nCA\t0612345\tDuplicate\t25\t37.1\t-122.2'),/duplicate/);
  assert.throws(()=>parseCensusPlacePopulations([pop[0],pop[0]]),/duplicate/);
  assert.throws(()=>buildUsPlaceIndex(gaz,[pop[0]]),/missing_geoids/);
  assert.throws(()=>parseGazetteerPlaces('NAME\tLSAD\nexample\t57'),/missing_USPS/);
});

test('major-city threshold never includes CDPs or unknown legal status',()=>{
  const highPop=[
 [['P1_001N','state','place'],['150000','06','12345'],['400000','06','67890']],
 [['P1_001N','state','place'],['230000','36','12345'],['700000','48','12345']]
 ];
 const index=buildUsPlaceIndex(gaz,highPop);
 assert.equal(index.scope.major_cities,2);
 assert.equal(index.places.find(p=>p.geoid==='0667890').tier,'separate_review');
 assert.equal(index.places.find(p=>p.geoid==='4812345').tier,'separate_review');
});

test('DC and Puerto Rico entries do not inflate 50-state coverage denominators',()=>{
 const extra='\nDC\t1100001\tWashington city\t25\t+38.9\t-77.0'+
   '\nPR\t7200001\tExample municipio\t37\t+18.4\t-66.1';
 const index=buildUsPlaceIndex(gaz+extra,pop);
 assert.equal(index.scope.excluded_outside_50_states,2);
 assert.equal(index.scope.major_cities,2);
 assert.equal(index.scope.states,3);
});

test('actual 2025 Gazetteer pipe-delimited format is accepted',()=>{
  const pipe=gaz.replaceAll('\t','|');
  assert.deepEqual(parseGazetteerPlaces(pipe),parseGazetteerPlaces(gaz));
});
