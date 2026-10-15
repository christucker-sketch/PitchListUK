// Offline Germany groundwork only. This module is not imported by a Worker,
// intake contract, producer or customer router and never grants readiness.
export const GERMANY_PREPARATION=Object.freeze({
  country:'DE',locale:'de-DE',currency:'EUR',timezone:'Europe/Berlin',
  date_format:'DD.MM.YYYY',distance_unit:'km',postal_label:'PLZ',
  postal_pattern:'^[0-9]{5}$',runtime_enabled:false,ready_promotion_enabled:false,
  regions:Object.freeze({
    'DE-BW':'Baden-Württemberg','DE-BY':'Bayern','DE-BE':'Berlin','DE-BB':'Brandenburg',
    'DE-HB':'Bremen','DE-HH':'Hamburg','DE-HE':'Hessen','DE-MV':'Mecklenburg-Vorpommern',
    'DE-NI':'Niedersachsen','DE-NW':'Nordrhein-Westfalen','DE-RP':'Rheinland-Pfalz',
    'DE-SL':'Saarland','DE-SN':'Sachsen','DE-ST':'Sachsen-Anhalt',
    'DE-SH':'Schleswig-Holstein','DE-TH':'Thüringen',
  }),
});
const MONTHS={januar:1,jan:1,februar:2,feb:2,'märz':3,maerz:3,'mär':3,mrz:3,
  april:4,apr:4,mai:5,juni:6,jun:6,juli:7,jul:7,august:8,aug:8,
  september:9,sep:9,sept:9,oktober:10,okt:10,november:11,nov:11,dezember:12,dez:12};
const literal=value=>typeof value==='string'&&value.length<=160?value.normalize('NFC')
  .replace(/&auml;/gi,'ä').replace(/&ouml;/gi,'ö').replace(/&uuml;/gi,'ü')
  .replace(/&nbsp;|\u00a0/gi,' ').replace(/\s+/g,' ').trim():null;
function date(year,month,day){
  if(!Number.isInteger(year)||year<2000||year>2099||!Number.isInteger(month)||!Number.isInteger(day))return null;
  const value=new Date(Date.UTC(year,month-1,day));
  return value.getUTCFullYear()===year&&value.getUTCMonth()===month-1&&value.getUTCDate()===day?value.toISOString().slice(0,10):null;
}
// The caller must already know that this is an event/deadline date field.
// Do not search a page for arbitrary dates, infer a year, or derive country.
export function parseGermanDate(value){
  const s=literal(value);if(!s)return null;
  const numeric=s.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})$/);
  if(numeric)return date(Number(numeric[3]),Number(numeric[2]),Number(numeric[1]));
  const iso=s.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if(iso)return date(Number(iso[1]),Number(iso[2]),Number(iso[3]));
  const named=s.match(/^(\d{1,2})\.?\s+([\p{L}]+)\.?\s+(20\d{2})$/u);
  return named?date(Number(named[3]),MONTHS[named[2].toLowerCase()],Number(named[1])):null;
}
export function parseGermanDateRange(value){
  const input=literal(value);if(!input)return null;const s=input.replace(/^vom\s+/i,'');
  const both=s.match(/^(.+?)\s+(?:bis|[-–—])\s+(.+)$/i);
  let start=both?parseGermanDate(both[1]):null,end=both?parseGermanDate(both[2]):null;
  if(!start||!end){
    const named=s.match(/^(\d{1,2})\.?\s*(?:bis|[-–—])\s*(\d{1,2})\.?\s+([\p{L}]+)\.?\s+(20\d{2})$/iu);
    const numeric=s.match(/^(\d{1,2})\.(\d{1,2})\.\s*(?:bis|[-–—])\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})$/i);
    if(named){start=date(Number(named[4]),MONTHS[named[3].toLowerCase()],Number(named[1]));end=date(Number(named[4]),MONTHS[named[3].toLowerCase()],Number(named[2]));}
    else if(numeric){start=date(Number(numeric[5]),Number(numeric[2]),Number(numeric[1]));end=date(Number(numeric[5]),Number(numeric[4]),Number(numeric[3]));}
  }
  return start&&end&&start<=end?{start,end}:null;
}
