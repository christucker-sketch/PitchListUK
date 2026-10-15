/* Shared presentation only. Source/API values are never scanned for translation.
   English URLs are unchanged; /lang/{de,fr}/ selects language, not country. */
(function () {
  const FP = window.FP = window.FP || {};
  const catalogs = window.FP_LOCALES || {};
  const languages = Object.freeze({en: 'English', de: 'Deutsch', fr: 'Français'});
  const normal = value => String(value).replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const language = value => Object.hasOwn(languages, value) ? value : 'en';
  function route(path) {
    const match = String(path).match(/^\/lang\/([a-z]{2})(?=\/|$)/);
    if (!match) return {language:'en', path, prefix:'', explicit:false, valid:!String(path).startsWith('/lang/')};
    return {language:language(match[1]), path:String(path).slice(match[0].length) || '/', prefix:match[1]==='en'?'':'/lang/'+match[1], explicit:true, valid:Object.hasOwn(languages,match[1])};
  }
  function pathFor(path, lang) {
    if (typeof path!=='string' || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) return '/';
    const clean=route(path).path;
    if (/^\/(?:api|ops|preview|assets)(?:\/|$)/.test(clean)) return clean;
    return (language(lang)==='en'?'':'/lang/'+language(lang))+clean;
  }
  const enabled=typeof document==='undefined'||document.querySelector('meta[name=fp-localisation-enabled]')?.content!=='false';
  const initial = typeof location==='object' ? route(location.pathname).language : 'en';
  function tr(message, args=[], lang=initial) {
    const raw=String(message), key=normal(raw), translated=catalogs[language(lang)]?.[key];
    const padded=translated===undefined?raw:raw.match(/^\s*/)[0]+translated+raw.match(/\s*$/)[0];
    return padded.replace(/\{(\d+)\}/g,(token,n)=>n in args?String(args[n]):token);
  }
  function translatePart(part, lang, attribute=false) {
    // Markers originate only from our tagged template's static parts. Values
    // are inserted AFTER translation, so event names/addresses/HTML stay exact.
    const ids=[];
    const withSlots=part.replace(/\uE000(\d+)\uE001/g,(_,n)=>{let i=ids.indexOf(n);if(i<0){i=ids.length;ids.push(n);}return '{'+i+'}';});
    const key=normal(withSlots), translated=catalogs[language(lang)]?.[key];
    if (translated===undefined) return part;
    const safe=escape(translated).replace(/\{(\d+)\}/g,(token,n)=>ids[n]===undefined?token:'\uE000'+ids[n]+'\uE001');
    return part.match(/^\s*/)[0]+safe+part.match(/\s*$/)[0];
  }
  function markup(value, lang=initial) {
    // Never apply to assembled listing HTML: this API is for owned static
    // templates/assets only. No mutation observer translates DOM/source text.
    return String(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/gi, piece => {
      if (/^<(?:script|style)\b|^<!--/i.test(piece)) return piece;
      if (piece.startsWith('<')) return piece.replace(/\b(aria-label|title|placeholder|alt)=(['"])(.*?)\2/g,(_,name,quote,text)=>name+'='+quote+translatePart(text,lang,true)+quote);
      return translatePart(piece,lang);
    });
  }
  function html(strings, ...values) {
    if (typeof strings==='string') return markup(strings);
    const staticMarkup=strings.map((part,i)=>part+(i<values.length?'\uE000'+i+'\uE001':'')).join('');
    return markup(staticMarkup).replace(/\uE000(\d+)\uE001/g,(_,n)=>String(values[n]));
  }
  function locale(market) { return initial==='en' ? (/^en-/.test(market?.locale||'')?market.locale:'en-GB') : initial==='de'?'de-DE':'fr-FR'; }
  function market(value) {
    if (!value) return value;
    const frenchCountries={GB:'le Royaume-Uni',US:'les États-Unis',CA:'le Canada',AU:'l’Australie',IE:'l’Irlande',NZ:'la Nouvelle-Zélande',SG:'Singapour',HK:'Hong Kong',FR:'la France'};
    return {...value, name:tr(value.name), the:initial==='fr'?(frenchCountries[value.code]||tr(value.the)):tr(value.the), locale:locale(value),
      vocab:Object.fromEntries(Object.entries(value.vocab||{}).map(([k,v])=>[k,tr(v)])),
      postal:Object.fromEntries(Object.entries(value.postal||{}).map(([k,v])=>[k,['label','label_mid'].includes(k)?tr(v):v])),
      region_label:Object.fromEntries(Object.entries(value.region_label||{}).map(([k,v])=>[k,tr(v)]))};
  }
  function meta(value, descriptor, selectedMarket, lang=initial, indexable=false) {
    const equivalentPath=new URL(value.canonical).pathname;
    const alternates=value.indexable&&indexable?languageAlternates(equivalentPath,selectedMarket.code):[];
    if (lang==='en') return indexable?{...value,hreflang:alternates}:value;
    const place=descriptor.region?.name || tr(selectedMarket.name,[],lang);
    const heading=tr('Checked opportunities in {0}',[place],lang);
    return {...value,place,title:heading+' | FindPitches',h1:heading,
      description:tr('Browse checked markets, festivals and trader opportunities in {0}. Apply directly with the organiser.',[place],lang),
      intro:[tr('Browse checked markets, festivals and trader opportunities in {0}. Apply directly with the organiser.',[place],lang),tr('Checked against event, organiser and application sources.',[],lang)],
      breadcrumbs:value.breadcrumbs.map((b,i)=>({...b,name:i===0?b.name:i===1?tr(selectedMarket.name,[],lang):tr(b.name,[],lang)})),
      faq:[['Do you guarantee I\'ll get a pitch?','No. Organisers choose their traders. Listings are checked against retained event, organiser and application evidence.'],['What does it cost?','Searching and saving are free. Pro adds the organiser’s application page for every listing, with email alerts coming later.']].map(([q,a])=>({q:tr(q,[],lang),a:tr(a,[],lang)})),
      canonical:value.canonical.replace(/^(https:\/\/[^/]+)(\/.*)$/,(_,origin,path)=>origin+pathFor(path,lang)),
      hreflang:alternates,jsonld:[{'@context':'https://schema.org','@type':'CollectionPage',name:heading,inLanguage:lang,url:value.canonical.replace(/^(https:\/\/[^/]+)(\/.*)$/,(_,origin,path)=>origin+pathFor(path,lang))}],robots:indexable&&value.indexable?value.robots:'noindex,follow',indexable:indexable&&value.indexable};
  }
  function languageAlternates(path,country,site='https://findpitches.com') {
    return Object.keys(languages).map(lang=>({lang:lang+'-'+country,href:site+pathFor(path,lang)})).concat({lang:'x-default',href:site+pathFor(path,'en')});
  }
  function applicationLabel(type) {
    return tr(type==='trader_phone'?'Call organiser':type==='trader_email'?'Email organiser':['standing_registration','vendor_portal_registration'].includes(type)?'Register with organiser':['trader_enquiry','organiser_intake'].includes(type)?'Contact organiser':'Apply on the organiser’s site');
  }
  FP.i18n = {languages,language,route,pathFor,tr,html,markup,locale,market,normal,escape,current:initial,
    meta,languageAlternates,applicationLabel,enabled,
    number:value=>new Intl.NumberFormat(locale()).format(value),
    money:plan=>initial==='en'||!Number.isFinite(plan.price)||plan.price===0?tr(plan.price_label):new Intl.NumberFormat(locale(),{style:'currency',currency:plan.currency}).format(plan.price),
    list:values=>new Intl.ListFormat(locale(),{style:'long',type:'conjunction'}).format(values),
    sourceNotice:()=>tr('Listing details are shown in the source’s original language.')};
  if(enabled&&typeof location==='object'&&typeof localStorage==='object'&&['/','/index.html'].includes(location.pathname)){try{const saved=JSON.parse(localStorage.getItem('fp:pref:language'));if(saved&&saved!=='en'&&Object.hasOwn(languages,saved))location.replace(pathFor(location.pathname+location.search,saved)+location.hash);}catch{}}
})();
