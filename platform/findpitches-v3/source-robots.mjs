// Conservative public-source access check. No challenge or credential bypass.
export function robotsPermits(content,url,agent='FindPitches-V3-Shadow-Verification') {
  if(typeof content!=='string'||content.length>65536||/^\s*</.test(content))return false;
  const groups=[];let agents=[],rules=[],hadRules=false;
  const flush=()=>{if(agents.length)groups.push({agents,rules});agents=[];rules=[];hadRules=false;};
  for(const raw of content.split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim(),m=line.match(/^([\w-]+)\s*:\s*(.*)$/);if(!m)continue;const k=m[1].toLowerCase(),v=m[2].trim();
    if(k==='user-agent'){if(hadRules)flush();agents.push(v.toLowerCase());}
    else if(['allow','disallow'].includes(k)&&agents.length){hadRules=true;if(v)rules.push({allow:k==='allow',path:v});}
  }flush();
  const exact=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.toLowerCase().includes(a))),selected=exact.length?exact:groups.filter(g=>g.agents.includes('*'));
  const u=new URL(url),path=u.pathname+u.search,matches=[];
  for(const r of selected.flatMap(g=>g.rules)){const end=r.path.endsWith('$'),p=(end?r.path.slice(0,-1):r.path).split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');if(new RegExp('^'+p+(end?'$':'')).test(path))matches.push({...r,length:r.path.replace(/[*$]/g,'').length});}
  matches.sort((a,b)=>b.length-a.length||Number(b.allow)-Number(a.allow));return !matches.length||matches[0].allow;
}
export async function publicRobotsAllowed(url,{fetcher=fetch}={}) {
  const target=new URL('/robots.txt',url);let response;try{response=await fetcher(target.href,{redirect:'manual',headers:{Accept:'text/plain','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},signal:AbortSignal.timeout(12000)});}catch{return {allowed:false,reason:'robots_fetch_failed'};}
  if(response.status===404)return {allowed:true,reason:'robots_not_published'};
  if(response.status!==200)return {allowed:false,reason:'robots_http_'+response.status};
  const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {allowed:false,reason:'robots_size_limit'};}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}const content=new TextDecoder().decode(bytes);
  return {allowed:robotsPermits(content,url),reason:robotsPermits(content,url)?null:'robots_prohibited_or_invalid'};
}
