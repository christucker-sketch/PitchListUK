const crypto = require('crypto');
const { classifyUsOpportunityEvidence } = require('./us-acquisition-classifier');
const { US_VENDOR_CATEGORIES, RECURRING_TERMS, APPLICATION_TERMS } = require('../config/us-classification-model');

function normaliseText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function normaliseUsPostal(value) { const m = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/); return m ? m[1] : ''; }
function firstMatch(text, regexes) { for (const regex of regexes) { const m = text.match(regex); if (m) return normaliseText(m[1] || m[0]); } return ''; }
function extractUsDate(text, labels = []) {
  const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const prefix = escaped.length ? `(?:${escaped.join('|')})\\s*[:\\-]?\\s*` : '';
  const patterns = [new RegExp(`${prefix}(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})`, 'i'), new RegExp(`${prefix}(\\d{1,2})[\\/-](\\d{1,2})[\\/-](20\\d{2}|\\d{2})(?!\\d)`, 'i')];
  for (const pattern of patterns) {
    const m = text.match(pattern); if (!m) continue;
    if (/^\d/.test(m[1])) { const month = Number(m[1]), day = Number(m[2]), rawYear = Number(m[3]), year = rawYear < 100 ? 2000 + rawYear : rawYear; if (month < 1 || month > 12 || day < 1 || day > 31) continue; return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`; }
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    return `${m[3]}-${String(months.indexOf(m[1].toLowerCase()) + 1).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
  }
  return '';
}
function extractApplicationUrl(page) { return (Array.isArray(page.links) ? page.links : []).filter(l=>l&&l.url).map(l=>({...l,text:normaliseText(l.text).toLowerCase()})).filter(l=>APPLICATION_TERMS.some(t=>l.text.includes(t))||/apply|vendor|exhibitor|booth|concession/i.test(l.url))[0]?.url || ''; }
function extractCategories(text) { const lower=text.toLowerCase(); return [...new Set(US_VENDOR_CATEGORIES.filter(c=>c.terms.some(t=>lower.includes(t))).map(c=>c.id))]; }
function stableId(parts) { const material=parts.map(v=>normaliseText(v).toLowerCase()).join('|'); return `opp_us_${crypto.createHash('sha256').update(material).digest('hex').slice(0,20)}`; }
function requireState(state={}) { const code=String(state.code||'').trim().toUpperCase(), name=String(state.name||'').trim(), jurisdiction=String(state.jurisdiction||'').trim().toUpperCase(); if(!/^[A-Z]{2}$/.test(code)||!name||jurisdiction!==`US-${code}`) throw new Error('Invalid US state descriptor'); return {...state,code,name,jurisdiction}; }
function extractStateOpportunity(page, options={}) {
  const state=requireState(options.state); const title=normaliseText(page.title), body=normaliseText(page.text||page.body), sourceUrl=page.url||page.source_url||'', applicationUrl=page.application_url||extractApplicationUrl(page);
  const classification=classifyUsOpportunityEvidence({title,body,sourceUrl,applicationUrl});
  if(classification.decision==='rejected') return {status:'rejected',reasons:[classification.reason,...classification.negativeSignals]};
  if(classification.decision!=='candidate') return {status:'review',reasons:[classification.reason]};
  const text=`${title} ${body}`.trim();
  const organiser=normaliseText(page.organiser||firstMatch(body,[/(?:hosted|organized|organised|presented) by\s+([^.;|]+)/i,/(?:contact|about)\s+([^.;|]+?)\s+(?:for vendor|vendor applications?)/i]));
  const eventName=normaliseText(page.event_name||title.replace(/\s*[-|:]\s*(vendor|exhibitor|food truck|booth).*$/i,''));
  const postalCode=normaliseUsPostal(page.postal_code||page.zip||firstMatch(text,[/\b(\d{5}(?:-\d{4})?)\b/]));
  const geography=typeof options.resolvePostal==='function'&&postalCode?options.resolvePostal(postalCode,options):null;
  const localityPattern=new RegExp(`\\b([A-Z][A-Za-z .'-]+),\\s*${state.code}\\s+\\d{5}(?:-\\d{4})?\\b`);
  const locality=normaliseText(page.locality||page.city||geography?.locality||firstMatch(text,[localityPattern]));
  const eventStart=page.event_start||extractUsDate(text,['event date','date','starts','start date']); const eventEnd=page.event_end||''; const applicationDeadline=page.application_deadline||extractUsDate(text,['application deadline','apply by','applications close','vendor deadline']);
  const recurring=Boolean(page.recurring)||RECURRING_TERMS.some(t=>text.toLowerCase().includes(t)); const multiEvent=Boolean(page.multi_event); const reasons=[];
  if(!sourceUrl)reasons.push('missing_source_url'); if(!applicationUrl)reasons.push('missing_application_route'); if(!eventName)reasons.push('missing_event_name'); if(!organiser)reasons.push('missing_organiser'); if(!locality&&!geography)reasons.push(`missing_${state.code.toLowerCase()}_locality`); if(!recurring&&!multiEvent&&!eventStart)reasons.push('missing_event_date');
  const status=reasons.length?'review':'candidate'; const hasPageCoordinates=Number.isFinite(Number(page.latitude))&&Number.isFinite(Number(page.longitude)); const temporalIdentity=eventStart||(multiEvent?'multi-event':(recurring?'recurring':''));
  const row={stable_id:stableId(['US',organiser,eventName,locality||geography?.locality||'',temporalIdentity]),event_name:eventName,organiser,source_url:sourceUrl,application_url:applicationUrl,location:locality||geography?.locality||'',locality:locality||geography?.locality||'',region:state.name,region_code:state.code,region_name:state.name,country:'United States',country_code:'US',jurisdiction:state.jurisdiction,currency:'USD',postal_code:postalCode||'',latitude:geography?.latitude??(hasPageCoordinates?Number(page.latitude):''),longitude:geography?.longitude??(hasPageCoordinates?Number(page.longitude):''),coordinate_source:geography?.coordinate_source||(hasPageCoordinates?'page':''),coordinate_precision:geography?.coordinate_precision||(hasPageCoordinates?'exact':''),coordinate_label:geography?.coordinate_label||'',event_start:eventStart,event_end:eventEnd,application_deadline:applicationDeadline,recurring,multi_event:multiEvent,opportunity_type:multiEvent?'multi-event':(recurring?'recurring':'event'),vendor_categories:extractCategories(text),quality_status:status==='candidate'?'review':'needs_work',publishable:false};
  return {status,reasons,row};
}
module.exports={extractStateOpportunity,extractUsDate,extractCategories,extractApplicationUrl,stableId,normaliseUsPostal};
