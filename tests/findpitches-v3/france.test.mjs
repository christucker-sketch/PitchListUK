import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDocument,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {normalizeExport} from '../../platform/findpitches-v3/contract.mjs';
import {usableRouteEligible,discoverUsableRoutes} from '../../platform/findpitches-v3/usable-route.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {stagingCatalogue,stagingReady} from '../../platform/findpitches-v3/staging.mjs';
import {mapProof,present,markets,resolveLocation} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import {routes,seoConfig} from '../../web/findpitches-v3-web/server/seo-edge.mjs';
import {database,NOW,record,seed} from './helpers.mjs';
import {sql,ingestRecords} from '../../platform/findpitches-v3/store.mjs';

const URL='https://organisateur.example.org/marche-createurs-2026/';
const TITLE='Marché de Noël des créateurs 2026';
const PHONE='<section><h2>Inscriptions exposants</h2><p>Inscriptions exposants au 06 12 34 56 78.</p></section>';
const FORM='<section><h2>Inscriptions exposants</h2><p>Les inscriptions exposants sont ouvertes.</p><form method="post" action="/candidature"><input name="entreprise"><textarea name="produits"></textarea><button type="submit">Envoyer ma candidature</button></form></section>';
function document({body=PHONE,country='FR',date='2026-11-21',title=TITLE,owner=URL}={}){
 const event={'@type':'Event',name:title,url:URL,startDate:date,endDate:date,organizer:{name:'Association des créateurs',url:owner},location:{name:'Salle des fêtes',address:{streetAddress:'1 rue des Arts',addressLocality:'Paris',addressRegion:'Île-de-France',postalCode:'75001',addressCountry:country},geo:{'@type':'GeoCoordinates',latitude:48.8566,longitude:2.3522}}};
 return {requested_url:URL,url:URL,http_status:200,fetched_at:NOW,html:`<script type="application/ld+json">${JSON.stringify(event)}</script><main><h1>${title}</h1>${body}</main>`};
}
const input=()=>record({opportunity_id:'fr-fixture',country_code:'FR',event_name:TITLE,organiser:'Association des créateurs',location:'Salle des fêtes, 1 rue des Arts, Paris, Île-de-France, 75001',event_end:'2026-11-21',canonical_url:URL,application_url:URL,application_state:'UNKNOWN',source_platform:'official',source_identifier:null,evidence:[{url:URL,excerpt:'Inscriptions exposants au 06 12 34 56 78.'}]});
test('FR is an additive country contract; original language is retained and unsupported countries remain rejected',()=>{
 const raw=input(),before=JSON.stringify(raw),r=normalizeExport(raw);assert.deepEqual(r.errors,[]);assert.equal(r.normalized.market,'FR');assert.equal(r.normalized.event_name,TITLE);assert.equal(JSON.stringify(raw),before);assert.ok(normalizeExport({...raw,country_code:'ZZ'}).errors.includes('unsupported_market'));
 assert.equal(routes.marketOf('fr'),'FR');assert.equal(routes.finderPath('FR'),'/fr/find-pitches/');assert.deepEqual(seoConfig.intentsFor('FR'),[]);const m=markets([]).find(m=>m.code==='FR');assert.equal(m.locale,'fr-FR');assert.equal(m.currency,'EUR');assert.equal(m.launch_status,'building');assert.equal(resolveLocation('FR','FR-IDF').region_id,'fr/ile-de-france');assert.equal(resolveLocation('FR','Paris').kind,'unresolved');
});
test('official French event proof distinguishes exhibitor phone/email/enquiry from an open application',()=>{
 for(const [body,type,state] of [[PHONE,'trader_phone','ENQUIRY_AVAILABLE'],['<section><h2>Contact exposants</h2><p>Pour les inscriptions exposants, écrire par courriel à <a href="mailto:exposants@organisateur.example.org">notre équipe</a>.</p></section>','trader_email','ENQUIRY_AVAILABLE'],[FORM,'event_application','OPEN_NOW']]){
  const r=verifyDocument(document({body}),{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.facts.country,'FR');assert.equal(r.usable_route.type,type);assert.equal(r.facts.application_state,state);assert.ok(usableRouteEligible(r));assert.equal(r.venue_coordinates.lat,48.8566);assert.equal(r.venue_address.street,'1 rue des Arts');
 }
 const phone=verifyDocument(document(),{now:NOW});assert.equal(phone.usable_route.destination,'tel:+33612345678');assert.ok(compareProof({market:'US',edition:'2026'},phone).includes('source_country_market_mismatch'));
});
test('French discovery/geography, contact, stale and private-only traps cannot promote',()=>{
 const unsafe=[document({country:null}),document({country:'US'}),document({owner:'https://calendar.example.org/'}),document({date:'2025-11-21'}),document({body:'<p>Contact : 06 12 34 56 78</p>'}),document({body:'<footer>'+PHONE+'</footer>'}),document({body:PHONE+'<p>Liste d’attente</p>'}),document({body:PHONE+'<p>Inscriptions fermées</p>'}),document({body:PHONE+'<p>Réservé aux particuliers</p>',title:'Vide-greniers 2026'}),document({body:PHONE,title:'Vide-greniers 2026'}),document({body:PHONE,title:'Salon de recrutement 2026'}),document({body:PHONE,title:'A SUPP 2026'}),document({body:PHONE.replace('06 12 34 56 78','061234567890')}),document({body:PHONE.replace('au 06','avant le 01/10/2026 au 06')}),document({body:PHONE.replace('au 06','avant le 1 octobre 2026 au 06')}),document({body:PHONE.replace('au 06','avant le 1 octobre au 06')}),document({body:PHONE+'<p>Date limite : 01/10/2026</p>'}),document({body:FORM.replace('produits','tickets').replace('entreprise','visitor')}),document({body:FORM.replace('Envoyer ma candidature','Acheter des billets')}),document({body:FORM.replace('action="/candidature"','action="/connexion"')}),document({body:FORM.replace('type="submit"','type="submit" disabled')})];
 for(const [i,d] of unsafe.entries())assert.notEqual(verifyDocument(d,{now:NOW}).status,'verified','unsafe case '+i);
 const supported=verifyDocument(document({title:'Vide-greniers 2026',body:PHONE+'<p>Professionnels acceptés.</p>'}),{now:NOW});assert.equal(supported.status,'verified',supported.reasons.join(','));
});
test('French two-hop routes follow an explicit invitation and fetch the real organiser form, never a login shell',()=>{
 const target='https://organisateur.example.org/inscription-exposants/',parent=document({body:`<section><h2>Inscriptions exposants</h2><a href="${target}">Inscription exposants</a></section>`}),report=verifyDocument(parent,{now:NOW});assert.deepEqual(discoverUsableRoutes(parent,report).map(r=>r.url),[target]);
 const child={requested_url:target,url:target,http_status:200,fetched_at:NOW,html:'<main><h1>Candidature exposants</h1>'+FORM+'</main>'},bundle={document_kind:'global_usable_route_bundle',requested_url:URL,url:URL,fetched_at:NOW,documents:[parent,child]};
 const r=verifyDocument(bundle,{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.facts.application_url,target);assert.equal(r.facts.application_state,'ENQUIRY_AVAILABLE');
 for(const html of ['<main><h1>Connexion exposants</h1><input name="password"></main>','<main><h1>Inscription exposants 2025</h1>'+FORM+'</main>']){const bad=structuredClone(bundle);bad.documents[1].html=html;assert.notEqual(verifyDocument(bad,{now:NOW}).status,'verified');}
});
test('FR replay, source custody, readiness, region/venue and Pro phone action work end-to-end without publication',async t=>{
 const db=database(t),raw=input(),{entity}=await seed(db,raw,{environment:'shadow'}),original=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,ids=new Set(original.map(r=>r.id)),before=JSON.stringify(original),identity=JSON.stringify(await sql(db,'SELECT id,market,edition,environment,shadow_only FROM entities WHERE id=?',entity.id).first());
 const replay=await ingestRecords(db,[raw],{environment:'shadow',now:NOW});assert.equal(replay.duplicates,1);assert.equal((await sql(db,'SELECT COUNT(*) n FROM entities').first()).n,1);
 await recordVerification(db,entity.id,document(),{now:NOW});assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');assert.equal(JSON.stringify((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results.filter(r=>ids.has(r.id))),before);const after=await sql(db,'SELECT id,market,edition,environment,shadow_only FROM entities WHERE id=?',entity.id).first();assert.equal(JSON.stringify(after),identity);
 assert.equal((await stagingReady(db,{market:'FR',now:NOW})).items.length,1);const snapshot=await stagingCatalogue(db,{now:NOW}),row=mapProof(snapshot.items[0],NOW);assert.equal(row.market,'FR');assert.equal(row.title,TITLE);assert.equal(row.location.region_id,'fr/ile-de-france');assert.equal(row.location.precision,'venue');assert.equal(row.application.status,'enquire');assert.equal(present(row,{tier:'pro',scope:'global'}).access.application_action_url,'tel:+33612345678');assert.ok(!JSON.stringify(present(row,{tier:'free'})).includes('+33612345678'));assert.equal(present(row,{tier:'pro',market:'US'}).access.locked,true);
 for(const table of ['customer_projections','publication_queue'])assert.equal((await sql(db,'SELECT COUNT(*) n FROM '+table).first()).n,0);
});
