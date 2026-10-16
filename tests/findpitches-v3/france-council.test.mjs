import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {SEYSSINS_CALL,SEYSSINS_COMMUNE,fetchFrenchCouncilBundle,fetchCouncilPDF} from '../../platform/findpitches-v3/france-council.mjs';
import {fetchProofDocument} from '../../platform/findpitches-v3/proof-document.mjs';
import {verifyDocument,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {proofExpiry} from '../../platform/findpitches-v3/source-calendar.mjs';
import {usableRouteEligible} from '../../platform/findpitches-v3/usable-route.mjs';
import {recordVerification,verifyEntitySource} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {sql,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
import {database,seed,record} from './helpers.mjs';
const NOW='2026-10-16T09:00:00.000Z';
const html=fs.readFileSync(new URL('../../producer/fp-discovery-lab/tests/fixtures/fr_seyssins_marche_noel_appel_2026-10-14.html',import.meta.url),'utf8');
const geo={nom:'Seyssins',code:'38486',codesPostaux:['38180'],codeDepartement:'38',codeRegion:'84'};
const doc=()=>({requested_url:SEYSSINS_CALL,url:SEYSSINS_CALL,fetched_at:NOW,http_status:200,html});
const bundle=()=>({document_kind:'fr_council_source_bundle',requested_url:SEYSSINS_CALL,url:SEYSSINS_CALL,fetched_at:NOW,documents:[doc(),{document_kind:'french_commune_registry',requested_url:SEYSSINS_COMMUNE,url:SEYSSINS_COMMUNE,http_status:200,fetched_at:NOW,raw_json:JSON.stringify([geo])}]});
const report=b=>verifyDocument(b,{now:NOW});
test('real retained council prose proves a dated trader email route with independent named-commune corroboration',()=>{
 const r=report(bundle());assert.equal(r.status,'verified');assert.equal(r.profile,'fr_council_call');assert.equal(r.facts.country,'FR');assert.equal(r.facts.event_start,'2026-12-10');assert.equal(r.facts.event_end,'2026-12-10');assert.equal(r.facts.application_deadline,'2026-11-15');assert.equal(r.facts.organiser,'Ville de Seyssins');assert.equal(r.facts.location,'parvis de l’Hôtel de ville, Seyssins');assert.equal(r.facts.event_name,'marché de Noël de Seyssins');assert.equal(r.facts.application_state,'ENQUIRY_AVAILABLE');assert.equal(r.usable_route.destination,'mailto:marchedenoel@mairie-seyssins.fr');assert.equal(usableRouteEligible(r),true);assert.equal(r.application_close_at,undefined);
 assert.equal(verifyDocument(doc(),{now:NOW}).status,'unverified');
});
test('query/country labels, French language and a neighbouring commune cannot replace source geography',()=>{
 for(const patch of [{raw_json:JSON.stringify([{...geo,nom:'Seyssinet-Pariset',code:'38485',codesPostaux:['38170']}])},{raw_json:JSON.stringify([{...geo,code:'99999'}])},{raw_json:JSON.stringify([geo,geo])},{reason:'official_commune_registry_unavailable'},{url:'https://example.org/communes'}]){const b=bundle();Object.assign(b.documents[1],patch);b.country='FR';b.market='FR';assert.notEqual(report(b).status,'verified');}
});
test('weekday, edition, deadline and source clocks must agree; past calls and boundary uncertainty stay withheld',()=>{
 for(const [before,after] of [['jeudi 10 décembre','vendredi 10 décembre'],['édition 2026','édition 2025'],['15 novembre 2026','15 novembre 2027'],['15 novembre 2026','30 février 2026'],['15 novembre 2026','15 novembre'],['15 novembre 2026','15 septembre 2026']]){const b=bundle();b.documents[0].html=html.replaceAll(before,after);assert.notEqual(report(b).status,'verified',after);}
 const future=bundle();future.documents[1].fetched_at='2026-10-17T12:00:00Z';assert.notEqual(report(future).status,'verified');
 const r=report(bundle());assert.equal(proofExpiry(r,'2026-11-14T09:00:00Z'),'2026-11-14T10:00:00.000Z');assert.notEqual(verifyDocument(bundle(),{now:'2026-11-14T10:00:00Z'}).status,'verified');assert.notEqual(verifyDocument(bundle(),{now:'2026-12-11T12:00:00Z'}).status,'verified');
});
test('footer email, arbitrary article, waitlist, private-only and a mismatched application destination never pass',()=>{
 for(const mutation of [s=>s.replaceAll('marchedenoel@mairie-seyssins.fr','unrelated@example.org'),s=>s.replace('transmettre votre dossier de candidature','consulter notre actualité'),s=>s.replace('Comment postuler','Liste d’attente — Comment postuler'),s=>s.replace('Comment postuler','Réservé aux particuliers — Comment postuler'),s=>s.replace('id="contenu"','id="unrelated"'),s=>s.replaceAll('MARCHÉ DE NOËL : APPEL À CANDIDATURES','Nouvelles de la mairie')]){const b=bundle();b.documents[0].html=mutation(html);assert.notEqual(report(b).status,'verified');}
 const b=bundle();b.documents[0].html=html.replaceAll('marchedenoel@mairie-seyssins.fr','')+'<footer>marchedenoel@mairie-seyssins.fr</footer>';assert.notEqual(report(b).status,'verified');
});
test('the three real negative French peer fixtures stay unverified by the conservative generic fallback',()=>{
 for(const [name,url] of [['fr_valdemoder_inscription_waitlist_2026-10-14.html','https://www.noel.valdemoder.fr/marche-de-noel/inscription/'],['fr_ornans_afp_appel_candidature_2026-10-14.html','https://www.ornans.fr/appel-a-candidatures/'],['fr_valence_village_noel_home_2026-10-14.html','https://www.village-noel-valence.com/']]){const page=fs.readFileSync(new URL('../../producer/fp-discovery-lab/tests/fixtures/'+name,import.meta.url),'utf8');assert.notEqual(verifyDocument({requested_url:url,url,http_status:200,html:page,fetched_at:NOW},{now:NOW}).status,'verified');}
});
test('multiple event dates, competing deadlines and explicitly not-yet-open calls cannot promote',()=>{
 for(const [before,after] of [['jeudi 10 décembre','jeudi 10 décembre et le vendredi 11 décembre'],['édition 2026','édition 2026 et saison 2027'],['15 novembre 2026','15 novembre 2026 et avant le 16 novembre 2026'],['15 novembre 2026','15 novembre 2026, date limite 16 novembre 2026'],['Comment postuler','Les candidatures ne sont pas encore ouvertes. Comment postuler'],['Comment postuler','Les inscriptions sont closes. Comment postuler']]){const b=bundle();b.documents[0].html=html.replaceAll(before,after);assert.notEqual(report(b).status,'verified',after);}
});
test('only linked official regulations are retained; opaque PDF bytes never provide parsed event facts',async()=>{
 let calls=0;const fetched=await fetchProofDocument(SEYSSINS_CALL,{now:NOW,fetcher:async url=>{calls++;return url===SEYSSINS_CALL?new Response(html,{headers:{'content-type':'text/html'}}):url===SEYSSINS_COMMUNE?Response.json([geo]):new Response('%PDF-1.7\nOpaque scanned original',{headers:{'content-type':'application/pdf'}});}});
 assert.equal(calls,3);assert.equal(fetched.document_kind,'fr_council_source_bundle');assert.equal(report(fetched).status,'verified');const pdf=fetched.documents[2];assert.equal(atob(pdf.pdf_base64),'%PDF-1.7\nOpaque scanned original');assert.match(pdf.content_hash,/^[a-f0-9]{64}$/);assert.equal(report(fetched).evidence.at(-1).kind,'linked_regulations_original_only');assert.ok(report(fetched).evidence.at(-1).excerpt.includes('"textual_facts_used":false'));
 const bad=structuredClone(fetched);bad.documents[2].requested_url='https://example.org/unrelated.pdf';assert.notEqual(report(bad).status,'verified');
});
test('PDF retrieval bounds bytes, validates signature, rejects redirects, HTML and unapproved hosts without a request',async()=>{
 const url=SEYSSINS_CALL.replace('/actualite/601/17-marche-de-noel-appel-a-candidatures.htm','/cms_viewFile.php?idtf=8067&path=Reglement-marche-de-Noel-2026.pdf');
 for(const [body,init,reason] of [['not a PDF',{headers:{'content-type':'application/pdf'}},'source_attachment_pdf_signature_missing'],['<html>',{headers:{'content-type':'text/html'}},'source_attachment_format_requires_review'],['',{status:302,headers:{location:'https://example.org/x'}},'source_attachment_http_302'],['%PDF-'+'.'.repeat(2621440),{headers:{'content-type':'application/pdf'}},'source_attachment_size_limit']])assert.equal((await fetchCouncilPDF(url,{now:NOW,fetcher:async()=>new Response(body,init)})).reason,reason);
 assert.equal((await fetchCouncilPDF('https://example.org/x.pdf',{fetcher:()=>assert.fail('unapproved fetch')})).reason,'source_attachment_route_unapproved');
});
test('source verification is additive, replay idempotent, identity disagreement held, and test proof excluded from commercial catalogue',async t=>{
 const db=database(t),r=report(bundle()),raw=record({opportunity_id:'fr-council-proof-control',country_code:'FR',event_name:r.facts.event_name,organiser:r.facts.organiser,location:r.facts.location,event_start:r.facts.event_start,event_end:r.facts.event_end,application_url:SEYSSINS_CALL,canonical_url:SEYSSINS_CALL,application_state:'ENQUIRY_AVAILABLE',source_platform:'organiser_site'}),{entity}=await seed(db,raw),original=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,ids=new Set(original.map(x=>x.id)),identity=await sql(db,'SELECT id,market,edition FROM entities WHERE id=?',entity.id).first();
 await recordVerification(db,entity.id,bundle(),{now:NOW});assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results.filter(x=>ids.has(x.id)),original);assert.deepEqual(await sql(db,'SELECT id,market,edition FROM entities WHERE id=?',entity.id).first(),identity);
 assert.equal((await ingestRecords(db,[raw],{now:NOW,environment:'test'})).duplicates,1);assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,0);assert.ok(compareProof({...r.facts,market:'GB'},r).includes('source_country_market_mismatch'));assert.ok(compareProof({...r.facts,market:'FR',event_start:'2027-12-10'},r).includes('selected_event_start_disagrees_with_proof'));
 for(const table of ['customer_projections','publication_queue'])assert.equal((await sql(db,'SELECT COUNT(*) n FROM '+table).first()).n,0);
});
test('required registry rate limits retain active proof, original expiry and Retry-After without fetching an attachment',async t=>{
 const db=database(t),facts=report(bundle()).facts,{entity}=await seed(db,record({country_code:'FR',...facts,canonical_url:SEYSSINS_CALL})),prior=await recordVerification(db,entity.id,bundle(),{now:NOW}),before=await sql(db,'SELECT * FROM source_verifications WHERE id=?',prior.verification_id).first();let calls=0;
 const failed=await verifyEntitySource(db,entity.id,{now:'2026-10-16T10:00:00Z',maxSourceRequests:3,fetcher:async url=>{calls++;return url===SEYSSINS_CALL?new Response(html,{headers:{'content-type':'text/html'}}):new Response('',{status:429,headers:{'retry-after':'1800'}});}});
 assert.equal(calls,2);assert.equal(failed.active_proof_unchanged,true);assert.equal(failed.retry_at,'2026-10-16T10:30:00.000Z');assert.deepEqual(await sql(db,'SELECT * FROM source_verifications WHERE id=?',prior.verification_id).first(),before);assert.equal((await sql(db,'SELECT COUNT(*) n FROM source_verifications').first()).n,1);
});
