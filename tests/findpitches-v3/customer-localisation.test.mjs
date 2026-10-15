import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {i18n,catalogs} from '../../web/findpitches-v3-web/server/i18n.mjs';
import {customerLanguage,customerReturnPath,signInMail} from '../../platform/findpitches-v3/customer-localisation.mjs';
import {grantPreview,requestLogin,consumeChallenge} from '../../platform/findpitches-v3/customer-auth.mjs';
import {mapProof,present} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import worker from '../../platform/findpitches-v3/customer-worker.mjs';
import {localisationFixture} from './fixtures/customer-localisation.mjs';
import {runtimeImports} from '../../operations/findpitches-v3/runtime-imports.mjs';
import {previewReleaseConfig} from '../../operations/findpitches-v3/release-customer-preview.mjs';
const browserI18n=lang=>{const ctx={window:{},location:{pathname:'/lang/'+lang+'/uk/find-pitches/'},URL,Intl};vm.createContext(ctx);for(const name of ['locales.js','i18n.js'])vm.runInContext(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/js/'+name,import.meta.url),'utf8'),ctx);return ctx.window.FP.i18n;};
test('localised category links and practical guidance keep every original filter and route key',()=>{
 const configs={};for(const lang of ['en','de','fr']){const ctx={window:{},location:{pathname:lang==='en'?'/':'/lang/'+lang+'/'},URL,Intl};vm.createContext(ctx);for(const file of ['locales.js','i18n.js','routes.js','seo/seo-config.js'])vm.runInContext(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/js/'+file,import.meta.url),'utf8'),ctx);configs[lang]=ctx.window.FP.seoConfig;}
 const shape=c=>JSON.stringify(c.intentsFor('GB').map(({key,filters,slugs})=>({key,filters,slugs})));
 for(const lang of ['de','fr']){assert.equal(shape(configs[lang]),shape(configs.en));assert.notEqual(configs[lang].intentsFor('GB')[0].labels.GB,configs.en.intentsFor('GB')[0].labels.GB);assert.notEqual(configs[lang].guidance.GB[0],configs.en.guidance.GB[0]);assert.deepEqual([...configs[lang].intentsFor('FR')],[]);}
});
test('boundary audit keeps real module dependencies visible while ignoring language copy ending in from',()=>{
 assert.deepEqual(runtimeImports('const c={"Searching from":"Suchen ab"};'),[]);
 assert.deepEqual(runtimeImports("const path='/legacy/import';const body={kind:'import',environment:'shadow'};"),[]);
 assert.deepEqual(runtimeImports('import {a,\n b} from "./own.mjs";export {a} from "../outside.mjs";const p=import("foreign-package");import "side-effects";'),['./own.mjs','../outside.mjs','foreign-package','side-effects']);
 assert.deepEqual(runtimeImports('import{a}/*comment*/from"../outside.mjs";const p=import(/*comment*/"foreign-package");export*from"node:fs";'),['../outside.mjs','foreign-package','node:fs']);
});
test('preview release refuses production, unknown bindings and shared/wrong databases',()=>{
 const state={worker:'findpitches-v3-customer-preview',database_name:'findpitches-v3-customer-preview',database_id:'preview-db'};
 const before={compatibility_date:'2026-10-01',bindings:[{name:'V3_CUSTOMER_MODE',type:'plain_text',text:'restricted_shadow_preview'},{name:'V3_CUSTOMER_DB',type:'d1',id:'preview-db'},{name:'V3_READY_API',type:'service',service:'findpitches-v3-api-shadow'},{name:'V3_EMAIL_API_KEY',type:'secret_text'}]};
 const config=previewReleaseConfig(before,state,[{cron:'*/5 * * * *'}]);assert.equal(config.keep_vars,true);assert.equal(config.routes,undefined);assert.equal(config.vars.V3_EMAIL_API_KEY,undefined);assert.deepEqual(config.triggers.crons,['*/5 * * * *']);
 assert.throws(()=>previewReleaseConfig(before,{...state,worker:'findpitches-v3-customer-production'},[]));
 assert.throws(()=>previewReleaseConfig(before,{...state,database_id:'source-db'},[]));assert.throws(()=>previewReleaseConfig({...before,bindings:before.bindings.concat({name:'unexpected',type:'r2_bucket'})},state,[]));
});
test('language URLs preserve country, entity/filter IDs and safe English routes',()=>{
  for(const lang of ['en','de','fr']){
    const path='/us/opportunity/ent_example/?cc=us&q=Food';assert.equal(i18n.route(customerReturnPath(path,lang)).path,path);
    assert.equal(i18n.pathFor('/api/v3/opportunities?market=FR',lang),'/api/v3/opportunities?market=FR');
  }
  assert.equal(i18n.route('/fr/').language,'en');assert.equal(i18n.route('/lang/de/fr/').path,'/fr/');
  assert.equal(i18n.route('/lang/zz/uk/').valid,false);assert.equal(i18n.pathFor('//foreign.example/', 'de'),'/');
  assert.equal(customerLanguage(undefined),'en');assert.throws(()=>customerLanguage('de-DE'),/validation/);assert.throws(()=>customerLanguage({}));
});
test('catalogs have equal keys, identical numbered arguments, and no translation HTML',()=>{
  assert.deepEqual(Object.keys(catalogs.fr).sort(),Object.keys(catalogs.de).sort());assert.ok(Object.keys(catalogs.fr).length>900);
  for(const [lang,catalog] of Object.entries(catalogs))for(const [key,value] of Object.entries(catalog)){
    assert.deepEqual(value.match(/\{\d+\}/g)?.sort()??[],key.match(/\{\d+\}/g)?.sort()??[],lang+': '+key);
    assert.ok(!/[<>]/.test(value),key);
  }
});
test('localised SEO links equivalent languages of the same country only after the indexing gate',()=>{
 const original={canonical:'https://findpitches.com/us/',indexable:true,robots:'index,follow',breadcrumbs:[{name:'FindPitches',path:'/'},{name:'United States',path:'/us/'}]},d={market:'US'},m={code:'US',name:'United States'};
 const held=i18n.meta(original,d,m,'de',false);assert.equal(held.indexable,false);assert.equal(held.robots,'noindex,follow');assert.deepEqual(held.hreflang,[]);
 const ready=i18n.meta(original,d,m,'de',true);assert.equal(ready.canonical,'https://findpitches.com/lang/de/us/');assert.equal(ready.hreflang.length,4);assert.ok(ready.hreflang.every(h=>h.href.endsWith('/us/')));assert.ok(ready.hreflang.some(h=>h.lang==='fr-US'));
 assert.equal(i18n.meta({...original,indexable:false},d,m,'de',true).indexable,false);
});
test('tagged interface templates never translate source values, recursively translate markers or alter source fields',()=>{
  for(const lang of ['de','fr']){const ui=browserI18n(lang),facts={title:'Taking applications',organiser:'Market',venue:'Food'},before=JSON.stringify(facts);
    const html=ui.html(['<h1>','</h1><p>','</p><button>Save</button>'],facts.title,facts.organiser);
    assert.ok(html.includes('<h1>Taking applications</h1>'));assert.ok(html.includes('<p>Market</p>'));assert.ok(!html.includes('<button>Save</button>'));assert.equal(JSON.stringify(facts),before);
    assert.equal(ui.html(['<p>','</p>'],'\uE0001\uE001'),'<p>\uE0001\uE001</p>');
    const m={code:'US',name:'United States',the:'the US',locale:'en-US',currency:'USD',distance_unit:'mi',vocab:{trader:'vendor'},postal:{label:'ZIP Code'}};
    const translated=ui.market(m);assert.equal(translated.code,'US');assert.equal(translated.currency,'USD');assert.equal(translated.distance_unit,'mi');assert.equal(m.name,'United States');assert.notEqual(translated.locale,m.locale);
  }
});
test('German/French enquiry and registration wording never claims an open application',()=>{
  for(const lang of ['fr','de']){
    const ui=browserI18n(lang);assert.equal(ui.applicationLabel('trader_enquiry'),i18n.tr('Contact organiser',[],lang));assert.equal(ui.applicationLabel('trader_phone'),i18n.tr('Call organiser',[],lang));assert.equal(ui.applicationLabel('standing_registration'),i18n.tr('Register with organiser',[],lang));
    assert.notEqual(i18n.tr('Contact organiser',[],lang),i18n.tr('Taking applications',[],lang));
    assert.notEqual(i18n.tr('Vendor registration',[],lang),i18n.tr('Taking applications',[],lang));
    assert.ok(i18n.tr('Register with the organiser’s vendor intake. Registration does not guarantee a place at this event.',[],lang).length>50);
  }
});
test('all localised static routes render translated SSR, honest noindex and locale bases; prefixed APIs cannot bypass guards',async t=>{
  const {db,env,now}=localisationFixture();t.after(()=>db.close());const gate=(await grantPreview(db,now)).split(';')[0];
  for(const lang of ['de','fr'])for(const path of ['/','/finder.html','/account.html','/saved.html','/alerts.html','/pricing/','/organisers/']){
    const r=await worker.fetch(new Request('https://preview.example.org/lang/'+lang+path,{headers:{Cookie:gate}}),env);assert.equal(r.status,200,path);
    const html=await r.text();assert.ok(html.includes('<html lang="'+lang+'"'));assert.ok(html.includes('<base href="/lang/'+lang+'/">'));assert.equal(r.headers.get('Content-Language'),lang);assert.equal(r.headers.get('X-Robots-Tag'),'noindex,nofollow');assert.ok(html.includes('/assets/js/i18n.js'));
  }
  for(const path of ['/lang/de/api/v3/session','/lang/fr/ops/preflight','/lang/zz/','/lang/fr/assets/js/config.js'])assert.equal((await worker.fetch(new Request('https://preview.example.org'+path,{headers:{Cookie:gate}}),env)).status,404,path);
  assert.equal((await worker.fetch(new Request('https://preview.example.org/favicon.ico',{headers:{Cookie:gate}}),env)).status,204);
  const canonical=await worker.fetch(new Request('https://preview.example.org/lang/en/pricing.html',{headers:{Cookie:gate}}),env);assert.equal(canonical.status,301);assert.equal(canonical.headers.get('Location'),'/pricing.html');
});
test('same V3 evidence and Free/Pro redaction survive any presentation language',()=>{
  const {db,items,now}=localisationFixture();try{const before=JSON.stringify(items);for(const lang of ['de','fr']){
    const row=mapProof(items[0],now),free=present(row,{tier:'free'}),pro=present(row,{tier:'pro',market:'GB'});
    assert.equal(free.title,items[0].title);assert.equal(free.access.application_url,null);assert.equal(pro.access.application_url,items[0].application_url);
    const ui=browserI18n(lang);assert.ok(ui.html(['<h1>','</h1>'],pro.title).includes(items[0].title));
  }assert.equal(JSON.stringify(items),before);}finally{db.close();}
});
test('localized sign-in mail and one-use proof return to the original country/filter without a real email',async t=>{
  const {db,env,now}=localisationFixture();t.after(()=>db.close());Object.assign(env,{V3_EMAIL_API_KEY:'mail_fixture',V3_EMAIL_FROM:'sender@example.org'});
  for(const locale of ['de','fr']){const next='/lang/'+locale+'/us/find-pitches/?q=Texas&cc=us';let mail;
    await requestLogin(new Request('https://preview.example.org/api/v3/session/link'),env,{email:locale+'@example.org',locale,next},{now,fetcher:async(url,options)=>{assert.equal(url,'https://api.smtp2go.com/v3/email/send');mail=JSON.parse(options.body);return Response.json({data:{succeeded:1}});}});
    assert.equal(mail.subject,signInMail(locale,'unused').subject);const link=new URL(mail.text_body.split('\n')[1]);assert.equal(link.searchParams.get('lang'),locale);
    const token=link.searchParams.get('token'),result=await consumeChallenge(db,token,now);assert.equal(result.next,next);await assert.rejects(consumeChallenge(db,token,now),/invalid_link/);
    const expired=await worker.fetch(new Request(link),env);assert.equal(expired.status,303);assert.equal(expired.headers.get('Location'),'/lang/'+locale+'/account.html?signin=expired');
  }
  await assert.rejects(requestLogin(new Request('https://preview.example.org/api/v3/session/link'),env,{email:'bad@example.org',locale:'zz'},{now}),/validation/);
});
