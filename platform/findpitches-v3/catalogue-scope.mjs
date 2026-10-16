// Private read selection only. A requested market is never geography proof.
export const entityId=value=>typeof value==='string'&&/^ent_[a-f0-9]{32}$/.test(value);
export function catalogueScope({market=null,detailId=null,ids=null}={}){
 if([market,detailId,ids].filter(v=>v!==null).length>1)throw Error('catalogue_scope_invalid');
 if(market!==null){if(typeof market!=='string'||!/^[A-Z]{2}$/.test(market))throw Error('catalogue_scope_invalid');return {kind:'market',market};}
 if(detailId!==null){if(!entityId(detailId))throw Error('catalogue_scope_invalid');return {kind:'detail',id:detailId};}
 if(ids!==null){if(!Array.isArray(ids)||ids.length>100||ids.some(id=>!entityId(id)))throw Error('catalogue_scope_invalid');return {kind:'ids',ids:[...new Set(ids)].sort()};}
 return {kind:'full'};
}
export function scopeFromParams(params){
 let ids=null;if(params.has('ids')){try{ids=JSON.parse(params.get('ids'));}catch{throw Error('catalogue_scope_invalid');}if(ids===null)throw Error('catalogue_scope_invalid');}
 return catalogueScope({market:params.get('market'),detailId:params.get('detail_id'),ids});
}
export function scopeParams(scope){
 const p=new URLSearchParams();if(scope.kind==='market')p.set('market',scope.market);else if(scope.kind==='detail')p.set('detail_id',scope.id);else if(scope.kind==='ids')p.set('ids',JSON.stringify(scope.ids));return p;
}
export function scopeCondition(scope){
 if(scope.kind==='market')return {where:'e.market=?',values:[scope.market]};
 if(scope.kind==='detail')return {where:"e.market=(SELECT target.market FROM entities target WHERE target.id=? AND target.environment='shadow')",values:[scope.id]};
 if(scope.kind==='ids')return {where:'e.id IN (SELECT value FROM json_each(?))',values:[JSON.stringify(scope.ids)]};
 if(scope.kind!=='full')throw Error('catalogue_scope_invalid');return {where:'1=1',values:[]};
}
export function scopeMatches(actual,expected){
 // Old source deployments/fixtures return a complete snapshot without scope.
 // Global fallback is safe. An unexpected partial snapshot is never global.
 if(actual===undefined)return true;
 if(actual===null||typeof actual!=='object'||Array.isArray(actual))return false;
 if(actual.kind==='full')return Object.keys(actual).length===1;
 return JSON.stringify(actual)===JSON.stringify(expected);
}

export function scopedItemsMatch(scope,items){
 if(!scope||scope.kind==='full')return true;
 if(scope.kind==='market')return items.every(item=>item.country===scope.market);
 if(scope.kind==='ids')return items.every(item=>scope.ids.includes(item.id));
 if(scope.kind==='detail')return new Set(items.map(item=>item.country)).size<=1;
 return false;
}
