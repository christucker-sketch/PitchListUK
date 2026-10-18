import test from 'node:test';import assert from 'node:assert/strict';
import {FRENCH_CALLS,communeURL,fetchFrenchCallBundle} from '../../platform/findpitches-v3/france-calls.mjs';
import {verifyDocument,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {recordVerification,verificationGate} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
import {decode} from '../../platform/findpitches-v3/source-dom.mjs';
import {database,seed,record} from './helpers.mjs';
import {sql,loadEntity} from '../../platform/findpitches-v3/store.mjs';
const NOW='2026-10-18T14:00:00.000Z',config=id=>FRENCH_CALLS.find(c=>c.id===id);
const source=(url,html)=>({requested_url:url,url,http_status:200,fetched_at:NOW,html,redirect_chain:[url]});
function bundle(id='hochstatt'){
 const c=config(id),geo={document_kind:'french_commune_registry',requested_url:communeURL(c),url:communeURL(c),http_status:200,fetched_at:NOW,raw_json:JSON.stringify({nom:c.commune,code:c.code,codeRegion:c.region})};
 let html,app;
 if(id==='hochstatt'){
  html='<title>Marché de Noël de Hochstatt &#8211; Comité des Fêtes de Hochstatt</title><main><h1>Marché de Noël de Hochstatt</h1><p>Le samedi 28 novembre 2026</p><p>Vous êtes artisans et vous souhaitez participer ?</p><a href="'+c.application+'/">Inscription exposant</a></main><footer>Hôtel de ville, 1 rue fictive, Hochstatt</footer>';
  app={...source(c.application,'<main><h1>Préinscription Marché de Noël 2026</h1><p>L’exposant doit obligatoirement être professionnel.</p><form method="post" action="'+c.application+'/"><textarea name="activite"></textarea><div class="gform-footer"><input type="submit" value="Envoyer"></div></form><p>Option : La Mairie de Flaxlanden organise également un marché les 12 et 13 décembre 2026.</p></main>'),url:c.application+'/',redirect_chain:[c.application,c.application+'/']};
 }else if(id==='podensac'){
  html='<title>Foire Sainte-Catherine 2026 : les inscriptions exposants sont ouvertes ! - Commune de Podensac</title><article><p>Vous souhaitez participer à la Foire Sainte-Catherine de Podensac, qui se tiendra le dimanche 22 novembre 2026 ?</p><p>Les commerçants, artisans, producteurs souhaitant réserver un emplacement sont invités à transmettre leur dossier complet avant le vendredi 6 novembre 2026.</p><p>Le dossier complet est à envoyer à exposants@podensac.fr</p></article>';
  app={...source(c.application,html),url:c.url,redirect_chain:[c.application,c.url]};
 }else{
  html='<div class="wysiwyg"><p>Le March&eacute; de No&euml;l de Kilstett se tiendra le dimanche 13 d&eacute;cembre 2026.</p><p>La Commune recherche des cr&eacute;ateurs, artisans et producteurs alimentaires.</p><p>Date limite d’inscription : vendredi 30 octobre !</p><a href="'+c.pdf+'">Formulaire papier</a><a href="'+c.application+'">Je m’inscris en ligne</a></div>';
  app={...source(c.application,'<body><p>Marché de Noël de Kilstett, le dimanche 13 décembre 2026. Produits et artisans. Date limite d’inscription : vendredi 30 octobre 2026 !</p><form action="https://docs.google.com/forms/d/e/current/formResponse"><input type="hidden" name="entry.1_sentinel"><div role="button">Next</div></form></body>'),url:'https://docs.google.com/forms/d/e/current/viewform',redirect_chain:[c.application,'https://docs.google.com/forms/d/e/current/viewform']};
 }
 return {document_kind:'fr_official_call_bundle',requested_url:c.url,url:c.url,fetched_at:NOW,documents:[source(c.url,html),geo,app]};
}
const check=b=>verifyDocument(b,{now:NOW});
test('scoped French official calls prove source dates, independent country and usable trader routes',()=>{
 for(const id of ['kilstett','podensac','hochstatt']){const r=check(bundle(id));assert.equal(r.status,'verified',id+':'+r.reasons);assert.equal(r.facts.country,'FR');assert.equal(r.location_precision,'locality');assert.equal(r.venue_coordinates,undefined);assert.equal(r.facts.location,config(id).commune+', '+config(id).region_name);}
 assert.equal(check(bundle('podensac')).facts.application_state,'ENQUIRY_AVAILABLE');assert.equal(check(bundle('podensac')).facts.application_deadline,'2026-11-06');assert.equal(check(bundle('kilstett')).facts.application_deadline,'2026-10-30');
 assert.equal(decode('MARCH&Eacute; DE NO&Euml;L &agrave; Kilstett'),'MARCHÉ DE NOËL à Kilstett');
});
test('missing/wrong registry, stale supporting evidence and another canonical page cannot supply proof',()=>{
 for(const mutation of [b=>{b.documents[1].raw_json=JSON.stringify({nom:'Paris',code:'75056',codeRegion:'11'});},b=>{b.documents[1].url='https://example.org/';},b=>{b.documents[1].fetched_at='2026-10-17T14:00:00.000Z';},b=>{b.documents[2].fetched_at='2026-10-19T14:00:00.000Z';},b=>{b.requested_url='https://example.org/news';},b=>{b.documents[0].url='https://example.org/news';}]){const b=bundle();mutation(b);assert.notEqual(check(b).status,'verified');}
});
test('a different event in optional form consent cannot replace the main event; footer invitation is insufficient',()=>{
 const r=check(bundle());assert.equal(r.facts.event_start,'2026-11-28');assert.equal(r.facts.location.includes('1 rue fictive'),false);
 const b=bundle();b.documents[0].html=b.documents[0].html.replace('Vous êtes artisans et vous souhaitez participer ?','Informations visiteurs');assert.notEqual(check(b).status,'verified');
 const c=bundle();c.documents[0].html=c.documents[0].html.replace('Vous êtes artisans et vous souhaitez participer ?','Informations visiteurs')+'<footer>Vous êtes artisans et vous souhaitez participer ?</footer>';assert.notEqual(check(c).status,'verified');
});
test('waitlists, future openings, closures, old editions, disabled and unrelated form actions stay withheld',()=>{
 for(const value of ['Liste d’attente','Les inscriptions sont fermées','Les candidatures ne sont pas encore ouvertes','Marché complet']){const b=bundle();b.documents[0].html=b.documents[0].html.replace('</main>','<p>'+value+'</p></main>');assert.notEqual(check(b).status,'verified',value);}
 for(const mutation of [s=>s.replace('samedi 28 novembre 2026','samedi 28 novembre 2025'),s=>s.replace('samedi 28 novembre 2026','dimanche 28 novembre 2026')]){const b=bundle();b.documents[0].html=mutation(b.documents[0].html);assert.notEqual(check(b).status,'verified');}
 for(const mutation of [s=>s.replace('type="submit"','type="submit" disabled'),s=>s.replace('name="activite"','name="activite" disabled'),s=>s.replace('action="'+config('hochstatt').application+'/"','action="https://example.org/contact"')]){const b=bundle();b.documents.at(-1).html=mutation(b.documents.at(-1).html);assert.notEqual(check(b).status,'verified');}
});
test('a complete dossier is not a full event; passed/exclusive deadlines and wrong application aliases fail closed',()=>{
 const b=bundle('podensac');assert.equal(check(b).status,'verified');assert.equal(verifyDocument(b,{now:'2026-11-06T00:00:00Z'}).status,'unverified');
 const wrong=bundle('podensac');wrong.documents.at(-1).redirect_chain=[wrong.documents.at(-1).requested_url];assert.notEqual(check(wrong).status,'verified');
 const footer=bundle('podensac');footer.documents[0].html=footer.documents[0].html.replace('Le dossier complet est à envoyer à exposants@podensac.fr','Contactez la mairie')+'<footer>Le dossier complet est à envoyer à exposants@podensac.fr</footer>';assert.notEqual(check(footer).status,'verified');
});
test('a PDF filename cannot replace a full deadline; contradictory or unrelated Google forms never qualify',()=>{
 for(const mutate of [b=>{b.documents[2].html=b.documents[2].html.replace('Date limite d’inscription : vendredi 30 octobre 2026 !','Date limite : voir inscription-30-octobre-2026.pdf');},b=>{b.documents[2].html=b.documents[2].html.replace('13 décembre','14 décembre');},b=>{b.documents[0].html=b.documents[0].html.replace('30 octobre','29 octobre');},b=>{b.documents.at(-1).html=b.documents.at(-1).html.replaceAll('Kilstett','Paris');},b=>{b.documents.at(-1).html=b.documents.at(-1).html.replace('formResponse','login');}]){const b=bundle('kilstett');mutate(b);assert.notEqual(check(b).status,'verified');}
});
test('source verification adds missing fields while preserving original facts, identity, producer holds and expiry',async t=>{
 const db=database(t),b=bundle(),proof=check(b),input=record({country_code:'FR',opportunity_id:'fr-official-call-control',event_name:proof.facts.event_name,event_start:'2026-11-28',event_end:null,organiser:null,location:null,canonical_url:config('hochstatt').url,application_url:config('hochstatt').application,source_platform:'other'}),{entity}=await seed(db,input);
 const original=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,ids=new Set(original.map(f=>f.id)),identity=await sql(db,'SELECT id,market,edition FROM entities WHERE id=?',entity.id).first();
 await recordVerification(db,entity.id,b,{now:NOW});assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results.filter(f=>ids.has(f.id)),original);assert.deepEqual(await sql(db,'SELECT id,market,edition FROM entities WHERE id=?',entity.id).first(),identity);
 assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,0);assert.notEqual((await verificationGate(db,await loadEntity(db,entity.id),{now:'2026-10-19T14:00:00Z'})).status,'verified');assert.ok(compareProof({...proof.facts,market:'GB'},proof).includes('source_country_market_mismatch'));
 assert.equal((await sql(db,'SELECT COUNT(*) n FROM publication_queue').first()).n,0);
});
test('required geography failures preserve retry semantics and stop PDF/application expansion',async()=>{
 const c=config('kilstett'),b=bundle('kilstett');let calls=0;const fetched=await fetchFrenchCallBundle(c.url,{now:NOW,fetcher:async url=>{calls++;return url===c.url?new Response(b.documents[0].html,{headers:{'content-type':'text/html'}}):new Response('',{status:503});}});assert.equal(calls,2);assert.equal(fetched.reason,'source_http_503');
});
