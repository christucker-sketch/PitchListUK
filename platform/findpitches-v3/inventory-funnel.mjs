// Compare actual customer-eligible snapshots, never cached internal READY.
// Older observed membership proves recovery; absence of history proves nothing.
const clean=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
function index(snapshot){
 if(snapshot?.schema!=='findpitches-v3-customer-proof-snapshot-v1'||snapshot.publication_enabled!==false||snapshot.production_cutover_enabled!==false||!Number.isFinite(Date.parse(snapshot.as_of))||!Array.isArray(snapshot.items))throw Error('customer_snapshot_required');
 const map=new Map();for(const row of snapshot.items){if(!row.id||!row.country||map.has(row.id))throw Error('unique_customer_snapshot_entities_required');map.set(row.id,row);}return map;
}
export function inventorySourceFamily(row){
 const domain=clean(row.source_domain).replace(/^www\./,'');
 return ({'eventeny.com':'eventeny','myntimage.co.uk':'myntimage','creativecrafts-online.co.uk':'creativecrafts','littlehummingbirdevents.co.uk':'littlehummingbird','cjseventswarwickshire.co.uk':'cjseventswarwickshire','localstalls.com':'localstalls','veganeventsuk.co.uk':'veganeventsuk'})[domain]??(domain||'unknown');
}
const eventKey=r=>JSON.stringify([r.country,clean(r.title),r.event_start,r.event_end,clean(r.organiser),clean(r.location)]);
const empty=()=>({before:0,after:0,retained:0,new_entities_ready:0,recoveries:0,prior_visibility_unproven:0,withdrawals:0,net:0,retention_percent:null});
export function customerInventoryFunnel(before,after,{history=[],createdAt={}}={}){
 const a=index(before),b=index(after),start=Date.parse(before.as_of),end=Date.parse(after.as_of);
 if(end<start)throw Error('ordered_customer_snapshots_required');
 const seen=new Set(a.keys());for(const old of history){if(Date.parse(old.as_of)>start)throw Error('prior_customer_history_required');for(const id of index(old).keys())seen.add(id);}
 const groups=new Map(),total=empty(),changes=[],knownEvents=new Set([...a.values()].map(eventKey)),newEventGroups=new Set();
 const group=r=>{const key=JSON.stringify([r.country,inventorySourceFamily(r)]);if(!groups.has(key))groups.set(key,{country:r.country,source_family:inventorySourceFamily(r),...empty()});return groups.get(key);};
 for(const row of a.values()){total.before++;group(row).before++;}
 for(const row of b.values()){
  total.after++;group(row).after++;
  if(a.has(row.id)){
   const previous=a.get(row.id);if(previous.country!==row.country||inventorySourceFamily(previous)!==inventorySourceFamily(row))throw Error('customer_cohort_attribution_changed_requires_review');
   total.retained++;group(row).retained++;continue;
  }
  const created=Date.parse(createdAt[row.id]),kind=Number.isFinite(created)&&created>start&&created<=end?'new_entities_ready':seen.has(row.id)?'recoveries':'prior_visibility_unproven';
  total[kind]++;group(row)[kind]++;changes.push({id:row.id,kind,country:row.country,source_family:inventorySourceFamily(row)});
  if(kind==='new_entities_ready'&&!knownEvents.has(eventKey(row)))newEventGroups.add(eventKey(row));
 }
 for(const row of a.values())if(!b.has(row.id)){total.withdrawals++;group(row).withdrawals++;changes.push({id:row.id,kind:'withdrawals',country:row.country,source_family:inventorySourceFamily(row)});}
 for(const item of [total,...groups.values()]){item.net=item.after-item.before;item.retention_percent=item.before?100*item.retained/item.before:null;}
 return {schema:'findpitches-v3-customer-inventory-funnel-v1',from:before.as_of,to:after.as_of,elapsed_hours:(end-start)/3600000,total,by_country_source:[...groups.values()].sort((x,y)=>x.country.localeCompare(y.country)||x.source_family.localeCompare(y.source_family)),distinct_new_event_groups:newEventGroups.size,event_group_definition:'Advisory exact country/title/date/organiser/location tuple; no entity identity is changed.',changes};
}
