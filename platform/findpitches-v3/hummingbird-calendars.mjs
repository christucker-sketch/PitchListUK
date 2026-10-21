// Exact visually reviewed source revisions. New bytes/URLs remain held until
// separately reviewed; no OCR, guessed dates, sold-out stripping or clock reset.
const asset=key=>'https://static.wixstatic.com/media/'+key+'~mv2.png/v1/fill/w_929,h_689,al_c,q_90,usm_0.66_1.00_0.01,enc_avif,quality_auto/2026%20Events%20Calendar.png';
export const HUMMINGBIRD_LEGACY_CALENDAR=asset('a95187_a494dd88463c4e2cbf516b66696adfd1');
export const HUMMINGBIRD_CALENDAR=asset('a95187_370321f688a94ceba38307cd04c4c7f8');
export const HUMMINGBIRD_CALENDAR_SHA256='e07844e162db62a0f7f231012e4dd86b24efcd1036e44c0919b257bb4a3faf28';
const ORIGINAL_ROWS=Object.freeze([
 ['2026-10-16','HORNSEA VILLAGE'],['2026-10-18','THORESBY'],['2026-10-18','FLEMINGATE SHOPPING CENTRE'],
 ['2026-10-25','RUFFORD ABBEY'],['2026-10-25','HESSLE TOWN HALL'],['2026-10-30','RUFFORD ABBEY NIGHT'],['2026-10-31','HULL MINSTER'],
 ['2026-11-01','HUMBER BRIDGE'],['2026-11-06','VANTOM VILLAGE','2026-11-08'],['2026-11-08','DRIFFIELD SHOWGROUND'],
 ['2026-11-13','HULL CITY CENTRE MAKERS'],['2026-11-14','LEEDS CORN X CHRISTMAS'],['2026-11-15','CUSWORTH HALL'],['2026-11-15','HESSLE TOWN HALL'],
 ['2026-11-19','HULL CITY CENTRE XMAS LIGHTS SWITCH ON'],['2026-11-20','HORNSEA VILLAGE'],['2026-11-21','HULL CITY CENTRE XMAS WEEKEND','2026-11-22'],
 ['2026-11-22','TEMPLE NEWSAM ESTATE'],['2026-11-22','FLEMINGATE SHOPPING CENTRE'],['2026-11-28','ANIMAL EDUCATION CENTRE, HULL'],
 ['2026-11-29','RUFFORD ABBEY'],['2026-11-29','DRIFFIELD SHOWGROUND'],['2026-12-05','WITHERNSEA VICTORIAN CHRISTMAS'],['2026-12-05','HULL MINSTER'],
 ['2026-12-06','HUMBER BRIDGE'],['2026-12-11','HULL CITY CENTRE MAKERS'],['2026-12-12','LINCOLNSHIRE SHOWGROUND EXO CENTRE'],
 ['2026-12-13','FLEMINGATE SHOPPING CENTRE'],['2026-12-18','HORNSEA'],['2026-12-20','HUMBER BRIDGE'],
].map(([date,label,end_date=date])=>Object.freeze({date,end_date,label,source_identifier:'little-hummingbird:'+encodeURIComponent(label)+':'+date+(end_date===date?'':':'+end_date)})));

const removed=new Set(['little-hummingbird:HORNSEA%20VILLAGE:2026-10-16','little-hummingbird:THORESBY:2026-10-18','little-hummingbird:FLEMINGATE%20SHOPPING%20CENTRE:2026-10-18','little-hummingbird:ANIMAL%20EDUCATION%20CENTRE%2C%20HULL:2026-11-28']);
const CURRENT_ROWS=Object.freeze(ORIGINAL_ROWS.filter(r=>!removed.has(r.source_identifier)));
const representations=rows=>Object.freeze(rows.map(Object.freeze));
export const HUMMINGBIRD_CALENDARS=Object.freeze([
 Object.freeze({url:HUMMINGBIRD_LEGACY_CALENDAR,source_updated:'2026-10-09',reviewed_at:'2026-10-13',reviewer:'codex',sold_out_marks:false,rows:ORIGINAL_ROWS,representations:representations([{content_type:'image/avif',bytes:93230,sha256:'f4022bcaacc84ac671b5574efad81a7abbd7694629d5091d4f5b422248850fbe'}])}),
 Object.freeze({url:HUMMINGBIRD_CALENDAR,source_updated:'2026-10-19',reviewed_at:'2026-10-21',reviewer:'codex',sold_out_marks:false,rows:CURRENT_ROWS,representations:representations([{content_type:'image/avif',bytes:88605,sha256:HUMMINGBIRD_CALENDAR_SHA256},{content_type:'image/png',bytes:669303,sha256:'d7bee0dd12c83eb7cfbb276663d71a58f23cbb07a8fea4a3fcbb6940bedff008'}])}),
]);
export const hummingbirdCalendar=url=>HUMMINGBIRD_CALENDARS.find(c=>c.url===url)??null;
