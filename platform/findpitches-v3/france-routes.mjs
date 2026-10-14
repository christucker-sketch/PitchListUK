// France country pack: proof comes from an already-bound official event,
// never from a tourist calendar, query, producer classification or phone prefix.
import {parseHtml,nodes,first,text} from './source-dom.mjs';
import {safeSourceUrl} from './source-document.mjs';

export const FRANCE_ROUTE_POLICY='fr-official-exhibitor-route-v1';
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const trader=/\b(?:exposants?|artisans?|createurs?|producteurs?|commercants?|professionnels?|vendeurs?)\b/;
const purpose=/\b(?:candidature|inscriptions?|reserver|reservation|renseignements?|contact|devenir exposant|participer)\b/;
const blocked=/\b(?:fermees?|closes?|cloturees?|terminees?|annule(?:e|es|s)?|reporte(?:e|es|s)?|complet(?:e|es|s)?|plus de places|liste d['’ ]attente|reserve(?:e)? aux particuliers|particuliers uniquement|sur invitation|adherents? uniquement|benevoles?|recrutement|offres? d['’ ]emploi|a supp(?:rimer)?)\b/;
const origin=s=>{try{return new URL(s).origin.replace('://www.','://');}catch{return null;}};
const https=(s,base)=>{try{const u=new URL(s,base);u.hash='';return safeSourceUrl(u.href)?u.href:null;}catch{return null;}};
const email=s=>/^mailto:[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(s??'')?s:null;
const main=d=>first(parseHtml(d.html),n=>n.tag==='main'||n.tag==='article');
function blocks(root){return nodes(root,n=>['section','article','div','p'].includes(n.tag),{scoped:true}).filter(n=>{const s=fold(text(n));return s.length<14000&&trader.test(s)&&purpose.test(s)&&!blocked.test(s);});}
export function frenchPhone(value){
 const s=String(value??'').replace(/^tel:/i,'').trim();
 if(!/^(?:0[1-9]|\+33[1-9]|0033[1-9])(?:[ .-]?\d){8}$/.test(s))return null;
 const digits=s.replace(/[ .-]/g,'');return 'tel:'+(digits.startsWith('0')&&!digits.startsWith('0033')?'+33'+digits.slice(1):digits.replace(/^0033/,'+33'));
}
function prohibited(report,root){
 const body=fold(text(root)),title=fold(report.facts.event_name);
 return blocked.test(body)||/\b(?:emploi|recrutement|boutique permanente|magasin permanent|a supp(?:rimer)?)\b/.test(title)||/\b(?:brocante|vide[ -]greniers?)\b/.test(title)&&!/\b(?:professionnels? (?:acceptes?|autorises?|bienvenus)|ouvert(?:e|es|s)? aux professionnels)\b/.test(body);
}
export function discoverFrenchRoutes(document,report){
 if(report.facts?.country!=='FR')return [];
 const root=main(document);if(!root||prohibited(report,root))return [];
 const links=new Map();for(const block of blocks(root))for(const a of nodes(block,n=>n.tag==='a'&&n.attrs.href,{scoped:true})){
  const label=fold(text(a)),route=https(a.attrs.href,document.url);
  if(!route||route===document.url||origin(route)!==origin(document.url)||!trader.test(label)||!purpose.test(label)||/\/(?:connexion|login|billetterie|tickets?|annuaire|newsletter)(?:\/|$)/i.test(new URL(route).pathname))continue;
  links.set(route,{url:route,invitation:text(block).slice(0,14000)});
 }return [...links.values()].slice(0,2);
}
function deadline(s){
 // French day-first dates and full French month names, with an explicit year.
 // A deadline instruction that cannot be parsed stays WATCH, never presumed open.
 const months='janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre'.split(' ');
 const instructions=[...s.matchAll(/(?:avant le|jusqu['’]au|date limite(?: d['’]inscription)?\s*:?)[ ]+([^!?;]{1,70})/gi)];
 const dates=instructions.map(m=>{
  const numeric=m[1].match(/^(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/),named=m[1].match(/^(\d{1,2})(?:er)? (\w+) (20\d{2})\b/),isoDate=m[1].match(/^(20\d{2})-(\d{2})-(\d{2})\b/);
  const parts=numeric?[numeric[1],numeric[2],numeric[3]]:named?[named[1],String(months.indexOf(named[2])+1),named[3]]:isoDate?[isoDate[3],isoDate[2],isoDate[1]]:null;
  if(!parts)return null;const iso=`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`,d=new Date(iso+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;
 });return {dates:[...new Set(dates.filter(Boolean))],invalid:dates.some(d=>!d)};
}
function formProof(block,d){return nodes(block,n=>n.tag==='form',{scoped:true}).filter(f=>{
 const action=https(f.attrs.action,d.url);
 if(f.attrs.method?.toLowerCase()!=='post'||!action||origin(action)!==origin(d.url)||/\/(?:connexion|login|contact|newsletter|billetterie|tickets?)(?:\/|$)/i.test(new URL(action).pathname)||nodes(f,n=>n.tag==='fieldset'&&n.attrs.disabled!==undefined).length)return false;
 const fields=nodes(f,n=>['input','select','textarea'].includes(n.tag)&&n.attrs.disabled===undefined&&n.attrs.type!=='hidden'&&n.attrs.name,{scoped:true});
 const submit=nodes(f,n=>n.attrs?.disabled===undefined&&(n.tag==='button'&&(!n.attrs.type||n.attrs.type==='submit')||n.tag==='input'&&n.attrs.type==='submit'),{scoped:true});
 return fields.length>=2&&fields.some(n=>/(?:entreprise|produits?|activite|stand|exposant|artisan|societe|business|vendor)/.test(fold(n.attrs.name)))&&submit.some(n=>/\b(?:envoyer|soumettre|inscrire|candidater)\b/.test(fold(n.attrs.value??text(n))));
}).length===1;}
export function frenchRouteOptions(document,report,routeDocuments,{now}){
 if(report.facts.country!=='FR')return null;
 const root=main(document);if(!root||prohibited(report,root))return {blocked:true,options:[]};
 const eventDeadline=deadline(fold(text(root)));
 if(eventDeadline.invalid||eventDeadline.dates.length>1||eventDeadline.dates.some(v=>v<now.slice(0,10)||v>report.facts.event_end))return {blocked:true,options:[]};
 const links=discoverFrenchRoutes(document,report),options=[];
 for(const d of [document,...routeDocuments]){
  if(d.reason||d.http_status!==200||!d.html||d.requested_url!==d.url||origin(d.url)!==origin(document.url)||d!==document&&!links.some(l=>l.url===d.url)||!Number.isFinite(Date.parse(d.fetched_at))||Date.parse(d.fetched_at)>Date.parse(now))continue;
  const scope=main(d);if(!scope||prohibited(report,scope))continue;
  const heading=fold(text(first(scope,n=>n.tag==='h1',{scoped:true})));
  if([...heading.matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==report.facts.event_start?.slice(0,4)&&m[1]!==report.facts.event_end?.slice(0,4)))continue;
  for(const block of blocks(scope)){
   const original=text(block),s=fold(original),dates=deadline(s);
   if([...s.matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==report.facts.event_start?.slice(0,4)&&m[1]!==report.facts.event_end?.slice(0,4))||dates.invalid||dates.dates.length>1||dates.dates.some(v=>v<now.slice(0,10)||v>report.facts.event_end))continue;
   const common={landing_url:d.url,excerpt:original,...dates.dates.length?{deadline:dates.dates[0]}:{}};
   if(formProof(block,d))options.push({...common,type:'organiser_intake',open:d===document&&/\b(?:inscriptions?|candidatures?) (?:(?:des exposants |exposants )?(?:sont |actuellement )?)ouvertes\b/.test(s)});
   // The number/email must occur in the same explicit exhibitor instruction,
   // not merely somewhere on the page or in its navigation/footer.
   for(const instruction of nodes(block,n=>n.tag==='p',{scoped:true}).concat(block.tag==='p'?[block]:[])){
    const instructionText=text(instruction),label=fold(instructionText);
    if(!trader.test(label)||!purpose.test(label)||blocked.test(label)||label.length>1200)continue;
    for(const a of nodes(instruction,n=>n.tag==='a',{scoped:true})){
     const address=email(a.attrs.href);if(address&&/\b(?:email|courriel|ecrire|contact|renseignements|inscriptions?)\b/.test(label))options.push({...common,type:'trader_email',destination:address});
    }
    if(/\b(?:inscriptions?|reserver|reservation|renseignements?|contact)\b/.test(label)){
     const numbers=[...instructionText.matchAll(/(?<![\d+])(?:\+33|0033|0)[1-9](?:[ .-]?\d){8}(?!\d)/g)].map(m=>frenchPhone(m[0])).filter(Boolean);
     for(const destination of new Set(numbers))options.push({...common,type:'trader_phone',destination});
    }
   }
  }
 }return {blocked:false,options};
}
