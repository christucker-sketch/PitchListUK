import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)):[path.join(directory,e.name)]);}
for(const file of files(path.join(root,'platform/findpitches-v3'))) {
  const text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
    if(!match[2].startsWith('./')||!path.resolve(path.dirname(file),match[2]).startsWith(path.join(root,'platform/findpitches-v3')+path.sep))throw new Error('runtime_import_outside_v3:'+file);
  }
  // This one fixed anonymous GET is an operator audit probe of the user's live
  // UK source, not a V2 database/customer-module dependency or publication path.
  const boundedAudit=file.endsWith('/mk1-source.mjs')?text.replace("'https://pitchlist.uk/api/customer-opportunities/search?limit=50'","''"):text;
  if(/findpitches-v2|customer_opportunities|\/api\/customer-opportunities/.test(boundedAudit))throw new Error('v2_runtime_dependency:'+file);
}
for(const file of files(path.join(root,'operations/findpitches-v3/cloudflare'))) {
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!/^findpitches-v3-\w+-shadow$/.test(config.name)||config.routes?.length||config.d1_databases.length!==1||config.d1_databases[0].binding!=='FINDPITCHES_V3_DB'||config.d1_databases[0].database_name!=='findpitches-v3-shadow')throw new Error('resource_boundary_violation:'+file);
  for(const q of [...config.queues?.producers??[],...config.queues?.consumers??[]])if(!/^findpitches-v3-/.test(q.queue)||q.queue.includes('publication'))throw new Error('queue_boundary_violation:'+file);
  if(config.vars.V3_CITY_ENABLED!=='false'||config.vars.V3_DAILY_QUERY_LIMIT!=='1000')throw new Error('acquisition_default_must_be_disabled');
}
console.log('V3 runtime imports, resources and disabled acquisition/publication boundaries passed');
