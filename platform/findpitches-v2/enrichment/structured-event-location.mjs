function scalar(value){const text=String(value??'').replace(/\s+/g,' ').trim();return text||null;}
function types(value){return Array.isArray(value)?value.map(String):[String(value||'')];}
function eventType(value){return types(value).some(type=>/(?:^|:)\w*Event$/i.test(type)||/\bEvent$/i.test(type));}
function plausible(value){
 const name=scalar(value);
 if(!name||name.length<3||name.length>160)return null;
 if(/^(?:online|virtual|tbc|tbd|unknown|n\/a|various|multiple locations|the venue|the event|the location)$/i.test(name))return null;
 if(/https?:\/\/|www\.|@/i.test(name))return null;
 return name;
}
function eventNodes(value,out=[]){
 if(Array.isArray(value)){for(const item of value)eventNodes(item,out);return out;}
 if(!value||typeof value!=='object')return out;
 if(eventType(value['@type']))out.push(value);
 if(Array.isArray(value['@graph']))for(const item of value['@graph'])eventNodes(item,out);
 return out;
}
function evidence(source,script,value,kind){
 const raw=String(script||'');
 const needle=String(value||'');
 const valueAt=raw.toLowerCase().indexOf(needle.toLowerCase());
 let start=valueAt>=0?Math.max(0,valueAt-300):0;
 const locationAt=raw.toLowerCase().lastIndexOf('"location"',valueAt>=0?valueAt:raw.length);
 if(locationAt>=0&&locationAt>=start-100)start=Math.max(0,locationAt-40);
 const excerpt=raw.slice(start,Math.min(raw.length,start+480)).replace(/\s+/g,' ').trim();
 return [{source,excerpt,kind}];
}

export function extractStructuredEventLocation(docs=[]){
 for(const doc of docs){
  const body=String(doc?.body||'');
  const re=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while((match=re.exec(body))){
   let parsed;try{parsed=JSON.parse(match[1].trim());}catch{continue;}
   for(const event of eventNodes(parsed)){
    const locations=Array.isArray(event.location)?event.location:[event.location];
    for(const loc of locations){
     if(!loc||typeof loc!=='object')continue;
     const venue=plausible(loc.name);
     const address=loc.address&&typeof loc.address==='object'?loc.address:{};
     const locality=plausible(address.addressLocality);
     const region=plausible(address.addressRegion);
     if(venue){return Object.freeze({
       location:Object.freeze({value:venue,evidence:Object.freeze(evidence(doc.url,match[1],venue,'schema_event_location')),confidence:.94}),
       location_area:locality?Object.freeze({value:locality,precision:'place',evidence:Object.freeze(evidence(doc.url,match[1],locality,'schema_event_location')),confidence:.9}):
         region?Object.freeze({value:region,precision:'area',evidence:Object.freeze(evidence(doc.url,match[1],region,'schema_event_location')),confidence:.86}):null
     });}
     if(locality)return Object.freeze({location:null,location_area:Object.freeze({value:locality,precision:'place',evidence:Object.freeze(evidence(doc.url,match[1],locality,'schema_event_location')),confidence:.9})});
     if(region)return Object.freeze({location:null,location_area:Object.freeze({value:region,precision:'area',evidence:Object.freeze(evidence(doc.url,match[1],region,'schema_event_location')),confidence:.86})});
    }
   }
  }
 }
 return Object.freeze({location:null,location_area:null});
}