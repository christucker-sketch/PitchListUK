// Server-rendered public content for indexable pages (English only).
// Everything here is built from Free-tier presented rows (present(row, free)),
// so source and application links are never in the markup. The browser page
// script replaces this block with the interactive page once it loads; when the
// script cannot run (crawler, blocked API, old browser) this content remains.
import {present,marketOf,ancestors} from './customer-catalogue.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ISO_SUFFIX=/\s*[—–-]\s*(\d{4}-\d{2}-\d{2})$/;

export function displayDate(iso,market='GB'){
  if(!/^\d{4}-\d{2}-\d{2}/.test(iso??''))return null;
  return new Date(iso.slice(0,10)+'T12:00:00Z').toLocaleDateString(market==='US'?'en-US':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
}
// Producer titles sometimes end with a raw ISO date ("Market — 2026-11-13").
// Presentation only: the stored title is unchanged.
export function displayTitle(title,market='GB'){
  const m=String(title??'').match(ISO_SUFFIX);return m?String(title).replace(ISO_SUFFIX,' — '+displayDate(m[1],market)):String(title??'');
}
export function dateRange(dates,market){
  const a=displayDate(dates?.start,market),b=displayDate(dates?.end,market);
  return a?(b&&b!==a?a+' – '+b:a):null;
}
const STATUS={open_now:'Taking applications',open:'Taking applications',closing_soon:'Closing soon',enquire:'Enquire with the organiser'};

function listItem(o,href){
  const when=dateRange(o.dates,o.market);
  return `<li><a href="${esc(href(o.canonical_path))}">${esc(displayTitle(o.title,o.market))}</a>`+
    `<span>${esc([when,o.location?.label,o.organiser?.name].filter(Boolean).join(' · '))}</span></li>`;
}

export function seoPageBody({meta,results,links,finderHref,href}){
  const crumbs=(meta.breadcrumbs??[]).map((b,i,all)=>i===all.length-1?`<span>${esc(b.name)}</span>`:`<a href="${esc(href(b.path))}">${esc(b.name)}</a>`).join(' › ');
  const list=results.length?`<h2>Coming up</h2><ul class="ssr-list">${results.map(o=>listItem(o,href)).join('')}</ul>`:'';
  const groups=(links??[]).map(g=>`<section><h2>${esc(g.title)}</h2><ul class="ssr-links">${g.links.map(l=>`<li><a href="${esc(href(l.path))}">${esc(l.label)}</a> <small>${esc(l.count)}</small></li>`).join('')}</ul></section>`).join('');
  return `<div class="wrap section" data-ssr>`+(crumbs?`<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>`:'')+
    `<h1>${esc(meta.h1)}</h1>${(meta.intro??[]).map(p=>`<p>${esc(p)}</p>`).join('')}${list}`+
    (finderHref?`<p><a href="${esc(finderHref)}">Search every listing in the Finder</a></p>`:'')+groups+`</div>`;
}

export function opportunityMeta(row){
  const o=present(row),title=displayTitle(o.title,o.market),when=dateRange(o.dates,o.market),checked=displayDate(o.checked?.last_checked,o.market);
  const parts=[`${title}${when&&!title.includes(when)?', '+when:''}${o.location?.label?' at '+o.location.label:''}.`];
  if(o.organiser?.name)parts.push(`Organised by ${o.organiser.name}.`);
  if(checked)parts.push(`Checked ${checked}.`);
  parts.push('See how traders and vendors apply on FindPitches.');
  return {title,description:parts.join(' ').slice(0,300)};
}

export function opportunityBody(row,{href,seo,routes}){
  const o=present(row),market=marketOf(o.market),title=displayTitle(o.title,o.market),when=dateRange(o.dates,o.market);
  const regions=o.location?.region_id?ancestors(o.market,o.location.region_id):[];
  const crumbs=[`<a href="${esc(href('/'))}">Home</a>`,`<a href="${esc(href(routes.marketPath(o.market)))}">${esc(market.name)}</a>`,...regions.map(r=>`<a href="${esc(href(seo.pathOf(o.market,null,r)))}">${esc(r.name)}</a>`)].join(' › ');
  const facts=[['When',when],['Where',o.location?.label],['Organiser',o.organiser?.name],['Applications',STATUS[o.application?.status]??null],
    ['Application deadline',displayDate(o.application?.deadline,o.market)],['Pitch fee',o.fee?.text],['Last checked',displayDate(o.checked?.last_checked,o.market)]].filter(([,v])=>v);
  return `<div class="wrap section" data-ssr><nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav><h1>${esc(title)}</h1>`+
    `<dl class="ssr-facts">${facts.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`+
    `<p>The organiser’s own application page and source link are part of <a href="${esc(href('/pricing.html'))}">FindPitches Pro</a>. You apply direct with the organiser.</p>`+
    `<p><a href="${esc(href(routes.marketPath(o.market)))}">More trader opportunities in ${esc(market.name)}</a></p></div>`;
}
