import { buildQueries } from '../queries/templates.mjs';
import { MARKETS } from '../markets/registry.mjs';
for (const code of ['GB','US','CA']) {
 const all=buildQueries({market:MARKETS[code],location:'TEST',limit:100});
 const live=buildQueries({market:MARKETS[code],location:'TEST',limit:4});
 console.log(JSON.stringify({market:code,total:all.length,live:live.map(x=>({id:x.template_id,q:x.query})),omitted_by_family:Object.fromEntries([...new Set(all.slice(4).map(x=>x.template_id))].map(id=>[id,all.slice(4).filter(x=>x.template_id===id).length]))},null,2));
}
