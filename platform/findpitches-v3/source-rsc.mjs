// Inert Next/React source records. JSON only; never eval, JS execution or reference guessing.
import {parseHtml,nodes,text} from './source-dom.mjs';
function stream(html){
 const root=parseHtml(html),chunks=[];let size=0;
 for(const script of nodes(root,n=>n.tag==='script'&&!n.attrs.src)){
  const raw=text(script,{scoped:false}).trim();if(!raw.startsWith('self.__next_f.push('))continue;
  const m=raw.match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);if(!m)throw Error('source_rsc_inert_json_required');
  let value;try{value=JSON.parse(m[1]);}catch{throw Error('source_rsc_inert_json_required');}
  if(Array.isArray(value)&&value.length===1&&value[0]===0)continue;
  if(!Array.isArray(value)||value.length!==2||value[0]!==1||typeof value[1]!=='string')throw Error('source_rsc_data_chunks_required');
  size+=value[1].length;if(size>1048576||chunks.length>=100)throw Error('source_rsc_size_limit');chunks.push(value[1]);
 }
 return chunks.join('');
}
export function sourceRSCServerError(html){
 for(const line of stream(html).split('\n')){const match=line.match(/^[\da-f]+:E(\{.*\})$/);if(!match)continue;
  try{const value=JSON.parse(match[1]);if(typeof value.digest==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value.digest))return true;}catch{}
 }return false;
}
export function sourceRSCRecords(html){
 const records=[],ids=new Set();for(const line of stream(html).split('\n')){
  const m=line.match(/^([\da-f]+):([\[{].*)$/);if(!m)continue;
  if(ids.has(m[1]))throw Error('source_rsc_duplicate_record');ids.add(m[1]);
  try{records.push(JSON.parse(m[2]));}catch{throw Error('source_rsc_record_json_required');}
 }
 let visited=0;function bound(x,depth){if(++visited>50000||depth>100)throw Error('source_rsc_structure_limit');if(x&&typeof x==='object')for(const value of Object.values(x))bound(value,depth+1);}
 for(const record of records)bound(record,0);return records;
}
export function sourceRSCObjects(html,key){
 const out=[];function walk(x){if(!x||typeof x!=='object')return;if(Object.hasOwn(x,key)&&x[key]&&typeof x[key]==='object'&&!Array.isArray(x[key]))out.push(x[key]);for(const value of Object.values(x))walk(value);}
 for(const record of sourceRSCRecords(html))walk(record);return out;
}
