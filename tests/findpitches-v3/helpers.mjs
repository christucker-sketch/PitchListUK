import { openLocalD1 } from '../../operations/findpitches-v3/local-d1.mjs';
import { ingestRecords,linkedEntity } from '../../platform/findpitches-v3/store.mjs';
import { drainPipeline } from '../../platform/findpitches-v3/pipeline.mjs';
export const NOW='2026-10-06T12:00:00.000Z';
export function record(overrides={}) {return {schema_version:'findpitches-discovery-export-v1',opportunity_id:'fixture-1',country_code:'US',event_name:'River Lantern Autumn Craft Market',organiser:'River Arts Association',location:'Austin, Texas',event_start:'2026-11-21',event_end:'2026-11-22',canonical_url:'https://www.eventeny.com/events/vendor/?id=52126',application_url:'https://www.eventeny.com/events/vendor/?id=52126',application_state:'OPEN_NOW',lifecycle_event:'NEW',source_platform:'eventeny',last_checked:NOW,evidence:[{url:'https://www.eventeny.com/events/vendor/?id=52126',excerpt:'Applications open'}],...overrides};}
export function database(t) {const db=openLocalD1();t.after(()=>db.close());return db;}
export async function seed(db,input=record(),options={}) {const imported=await ingestRecords(db,[input],{environment:'test',now:NOW,...options});if(imported.rejected)throw new Error(JSON.stringify(imported.errors));await drainPipeline(db,{now:NOW});return {entity:await linkedEntity(db,imported.record_ids[0]),recordId:imported.record_ids[0]};}
